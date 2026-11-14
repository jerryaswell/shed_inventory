/**
 * Tests for scripts/amplify-publish.sh, the deploy's one publish path.
 *
 * The script runs under a stub `aws` binary first on PATH, which logs its
 * arguments and answers as the manual-deploy API would, and most tests stub
 * `curl` the same way; zip and jq are the real ones, as on the CI runner. The
 * upload-retry tests run the real curl against a server on 127.0.0.1 that this
 * file starts, so what they hold is curl's own retry, not a stub's account of
 * it. No AWS call and no upload is ever real, and the AWS_* variables are
 * removed from the script's environment as well, so a call that somehow missed
 * a stub would have no credentials to use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./amplify-publish.sh', import.meta.url));

const STUB_AWS = `#!/usr/bin/env bash
# Stub aws for scripts/amplify-publish.test.js: logs its arguments, calls nothing.
set -u
echo "aws $*" >> "$STUB_LOG"
case "$2" in
  create-deployment) printf '{"jobId":"7","zipUploadUrl":"%s"}\\n' "\${STUB_UPLOAD_URL:-https://upload.example.invalid/site.zip}" ;;
  get-job) echo SUCCEED ;;
esac
exit 0
`;

const STUB_CURL = `#!/usr/bin/env bash
# Stub curl for scripts/amplify-publish.test.js: logs its arguments, sends nothing.
echo "curl $*" >> "$STUB_LOG"
exit 0
`;

/**
 * A temporary dist/ holding `files` (name -> content), and the stubs. With
 * `realCurl`, only aws is stubbed and the script finds the system's curl.
 */
function setup(t, files, { realCurl = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'amplify-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = join(root, 'dist');
  mkdirSync(dist);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dist, name), content);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const stubs = realCurl ? [['aws', STUB_AWS]] : [['aws', STUB_AWS], ['curl', STUB_CURL]];
  for (const [name, body] of stubs) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  return { root, dist };
}

/**
 * The script's environment: the stubs first on PATH, no AWS credentials, and
 * no proxy, so a real curl's upload to 127.0.0.1 goes straight to the server
 * here. CURL_HOME points at the temporary root, which holds no .curlrc.
 */
function scriptEnv(root, extra = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('AWS_') && !/_proxy$/i.test(k))
  );
  return Object.assign(env, {
    PATH: `${join(root, 'bin')}:${process.env.PATH}`,
    STUB_LOG: join(root, 'calls.log'),
    AWS_CONFIG_FILE: '/dev/null',
    AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    AWS_EC2_METADATA_DISABLED: 'true',
    CURL_HOME: root,
    XDG_CONFIG_HOME: root,
    ...extra
  });
}

/** The stub calls the script made, in order. */
function stubCalls(root) {
  const log = join(root, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
}

/**
 * Run the script under the stubs: its status, output and stub calls. The
 * arguments are an app id, a branch and `dist` unless a test passes its own.
 */
function publish({ root, dist }, args = ['app-id', 'pr-1', dist]) {
  const r = spawnSync('bash', [SCRIPT, ...args], { env: scriptEnv(root), encoding: 'utf8', timeout: 30_000 });
  assert.equal(r.error, undefined, `amplify-publish.sh did not run: ${r.error}`);
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls: stubCalls(root) };
}

/**
 * A server on 127.0.0.1 standing in for the presigned upload URL. It answers
 * the nth PUT with `statuses[n - 1] (the nth PUT, counting from 1)`, or the last entry once they run out, and
 * keeps each PUT's body.
 */
async function uploadServer(t, statuses) {
  const bodies = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'PUT') bodies.push(Buffer.concat(chunks));
      res.statusCode = statuses[Math.min(bodies.length, statuses.length) - 1] ?? 405;
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}/site.zip`, bodies };
}

/**
 * Run the script as `publish` does, but without blocking, so the upload
 * server in this process can answer the real curl. Past `timeout` the script
 * is killed with its whole process group, curl included, and the status is
 * null.
 */
function publishTo({ root, dist }, url, { timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [SCRIPT, 'app-id', 'pr-1', dist], {
      env: scriptEnv(root, { STUB_UPLOAD_URL: url }),
      detached: true
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), timeout);
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, out, calls: stubCalls(root) });
    });
  });
}

const INDEX = '<!doctype html><title>site</title>';

test('amplify-publish: a dist/ with index.html is zipped, uploaded and deployed', (t) => {
  const r = publish(setup(t, { 'index.html': INDEX }));
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(
    r.calls.map((c) => c.split(' ').slice(0, 3).join(' ')),
    ['aws amplify create-deployment', 'curl -sS --fail', 'aws amplify start-deployment', 'aws amplify get-job']
  );
  assert.match(r.calls[1], / https:\/\/upload\.example\.invalid\/site\.zip$/);
  assert.match(r.calls[2], /--job-id 7\b/);
});

test('amplify-publish: a wrong number of arguments exits 2 before anything is sent', (t) => {
  const s = setup(t, { 'index.html': INDEX });
  for (const args of [[], ['app-id', 'pr-1'], ['app-id', 'pr-1', s.dist, 'extra']]) {
    const r = publish(s, args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}: ${r.out}`);
    assert.match(r.out, /^usage: .*amplify-publish\.sh <app-id> <branch-name> <dist-dir>$/m);
    assert.deepEqual(r.calls, []);
  }
});

test('amplify-publish: a dist/ with no index.html is refused before anything is sent', (t) => {
  const r = publish(setup(t, { 'other.html': INDEX }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /No index\.html in .*refusing to publish/);
  assert.deepEqual(r.calls, []);
});

test('amplify-publish: a dist/ holding a customHttp.yml is refused before anything is sent (jerryaswell/self_mgmt#286)', (t) => {
  // Amplify lets a customHttp.yml at the root of the bundle override the
  // headers set on the app, the Content-Security-Policy among them. No job
  // puts one in dist/, so one there would replace the reviewed policy unseen.
  const headers = "customHeaders:\n  - pattern: '**'\n    headers:\n      - key: 'Content-Security-Policy'\n        value: \"default-src *\"\n";
  const r = publish(setup(t, { 'index.html': INDEX, 'customHttp.yml': headers }));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /customHttp\.yml/);
  assert.match(r.out, /refusing to publish/);
  assert.deepEqual(r.calls, []);
});

test('amplify-publish: an upload answered 503 is sent again, and the deployment then started', async (t) => {
  // The upload follows create-deployment, so a transient failure that ended
  // the script here would leave a deployment that was never started.
  const s = setup(t, { 'index.html': INDEX }, { realCurl: true });
  const upload = await uploadServer(t, [503, 200]);
  const r = await publishTo(s, upload.url);
  assert.equal(r.status, 0, r.out);
  assert.equal(upload.bodies.length, 2, r.out);
  assert.equal(upload.bodies[0].subarray(0, 2).toString(), 'PK', 'the upload is the zip');
  assert.ok(upload.bodies[1].equals(upload.bodies[0]), 'the retry sends the same zip');
  assert.deepEqual(
    r.calls.map((c) => c.split(' ').slice(0, 3).join(' ')),
    ['aws amplify create-deployment', 'aws amplify start-deployment', 'aws amplify get-job']
  );
});

test('amplify-publish: an upload that keeps failing is tried four times and never starts the deployment', async (t) => {
  const s = setup(t, { 'index.html': INDEX }, { realCurl: true });
  const upload = await uploadServer(t, [503]);
  const r = await publishTo(s, upload.url);
  assert.notEqual(r.status, 0, r.out);
  assert.equal(upload.bodies.length, 4, r.out);
  assert.deepEqual(
    r.calls.map((c) => c.split(' ').slice(0, 3).join(' ')),
    ['aws amplify create-deployment']
  );
});

test('amplify-publish: an upload answered 403 is not retried', async (t) => {
  // A 403 from a presigned URL is a signature or expiry problem that sending
  // the same request again cannot fix, so it fails at once.
  const s = setup(t, { 'index.html': INDEX }, { realCurl: true });
  const upload = await uploadServer(t, [403, 200]);
  const r = await publishTo(s, upload.url);
  assert.notEqual(r.status, 0, r.out);
  assert.equal(upload.bodies.length, 1, r.out);
  assert.deepEqual(
    r.calls.map((c) => c.split(' ').slice(0, 3).join(' ')),
    ['aws amplify create-deployment']
  );
});

test('amplify-publish: each upload attempt has a connection and transfer deadline, and the retries a budget (#23)', (t) => {
  // Retries alone never end an attempt that stalls; these are what do.
  const r = publish(setup(t, { 'index.html': INDEX }));
  assert.equal(r.status, 0, r.out);
  const upload = r.calls[1];
  assert.match(upload, / --connect-timeout 10 /);
  assert.match(upload, / --max-time 120 /);
  assert.match(upload, / --retry-max-time 300 /);
});

/**
 * A curl first on PATH that shortens the script's --max-time to 1 second and
 * its --retry-max-time to 4, then runs the real curl with every other argument
 * as given, so a stalled upload is held to the script's own flags in seconds
 * rather than minutes. The values themselves are checked in the test above.
 */
const SHORT_DEADLINE_CURL = `#!/usr/bin/env bash
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --max-time) args+=("$1" 1); shift 2 ;;
    --retry-max-time) args+=("$1" 4); shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
PATH=\${PATH#*:} exec curl "\${args[@]}"
`;

test('amplify-publish: an upload whose response never comes times out and never starts the deployment (#23)', async (t) => {
  // The server takes the whole zip and withholds its answer. Without a
  // transfer deadline curl waits on it until it is killed.
  const s = setup(t, { 'index.html': INDEX }, { realCurl: true });
  writeFileSync(join(s.root, 'bin', 'curl'), SHORT_DEADLINE_CURL);
  chmodSync(join(s.root, 'bin', 'curl'), 0o755);
  const bodies = [];
  const server = createServer((req) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => bodies.push(Buffer.concat(chunks)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const started = Date.now();
  const r = await publishTo(s, `http://127.0.0.1:${server.address().port}/site.zip`, { timeout: 20_000 });
  const elapsed = Date.now() - started;
  assert.notEqual(r.status, null, `killed after ${elapsed} ms rather than timing out: ${r.out}`);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /timed out/i);
  assert.ok(bodies.length >= 2, `the stalled upload was not retried: ${bodies.length} attempt(s)`);
  assert.ok(bodies.length <= 4, `${bodies.length} attempts`);
  assert.equal(bodies[0].subarray(0, 2).toString(), 'PK', 'the upload is the zip');
  assert.deepEqual(
    r.calls.map((c) => c.split(' ').slice(0, 3).join(' ')),
    ['aws amplify create-deployment']
  );
});

test('deploy.yml: the publish goes to the amplify_branch_name output, not a literal branch (#24)', () => {
  // The hosting branch is an input; a literal here would publish to the old
  // branch, or to none, once the input changed. Read as text, comments left out.
  const workflow = fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url));
  const lines = readFileSync(workflow, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l));
  const calls = lines.filter((l) => l.includes('./scripts/amplify-publish.sh'));
  assert.equal(calls.length, 1, 'deploy.yml should call amplify-publish.sh once');
  const m = /amplify-publish\.sh\s+"\$(\w+)"\s+"\$(\w+)"\s+\S+/.exec(calls[0]);
  assert.ok(m, `the publish passes something other than two variables: ${calls[0].trim()}`);
  const branchVar = m[2];
  assert.ok(
    lines.some((l) => new RegExp(`^\\s*${branchVar}=\\$\\(terraform output -raw amplify_branch_name\\)\\s*$`).test(l)),
    `${branchVar} is not read from terraform output amplify_branch_name`
  );
});
