/**
 * Tests for scripts/main-head-check.sh, the check that stops an apply whose
 * commit is no longer main's head (jerryaswell/self_mgmt#388), and for its wiring in the deploy's
 * apply job.
 *
 * The script runs against real throwaway Git repositories on disk, so
 * `git ls-remote` is the real one, as on the runner. Nothing touches a network
 * remote. The wiring tests read .github/workflows/deploy.yml as text: the
 * apply job's steps, the condition each one carries, and its group.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./main-head-check.sh', import.meta.url));
const WORKFLOW = fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url));
const GATE = "steps.head.outputs.current == 'true'";

/** git with no user or system configuration, and a fixed author. */
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid'
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * A repository whose main has two commits, `old` and then `head`. With
 * `branch`, main is named that instead.
 */
function repo(t, { branch = 'main' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'main-head-check-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', branch);
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'old');
  const old = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'head');
  const head = git(dir, 'rev-parse', 'HEAD');
  return { dir, old, head };
}

function check(...args) {
  const r = spawnSync('bash', [SCRIPT, ...args], { env: GIT_ENV, encoding: 'utf8', timeout: 30_000 });
  assert.equal(r.error, undefined, `main-head-check.sh did not run: ${r.error}`);
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("main-head-check: main's head exits 0", (t) => {
  const { dir, head } = repo(t);
  const r = check(head, dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`${head} is the head of main`));
});

test('main-head-check: a commit main has moved past exits 1, naming both', (t) => {
  const { dir, old, head } = repo(t);
  const r = check(old, dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp(`${old} is not the head of main .*${head}`));
});

test('main-head-check: the head of another branch is not main', (t) => {
  const { dir, old } = repo(t);
  git(dir, 'branch', 'other', old);
  assert.equal(check(old, dir).status, 1);
});

test('main-head-check: a ref that only ends in refs/heads/main is ignored', (t) => {
  // ls-remote's pattern matches this branch too, and lists it first, since it
  // sorts before refs/heads/main; were it read as main, the old commit would
  // pass.
  const { dir, old, head } = repo(t);
  git(dir, 'branch', 'a/refs/heads/main', old);
  assert.match(git(dir, 'ls-remote', dir, 'refs/heads/main'), new RegExp(`^${old}\trefs/heads/a/refs/heads/main\n`));
  assert.equal(check(old, dir).status, 1);
  assert.equal(check(head, dir).status, 0);
});

test('main-head-check: a remote with no main exits 2', (t) => {
  const { dir, head } = repo(t, { branch: 'trunk' });
  const r = check(head, dir);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /could not read refs\/heads\/main/);
});

test('main-head-check: a remote that cannot be read exits 2', (t) => {
  const { dir, head } = repo(t);
  const r = check(head, join(dir, 'no-such-repository'));
  assert.equal(r.status, 2, r.out);
});

test('main-head-check: anything but a full lowercase hash exits 2, before reading the remote', (t) => {
  const { dir, head } = repo(t);
  for (const bad of ['', head.slice(0, 12), head.toUpperCase(), `${head}\n${head}`, 'main', `${head} `]) {
    const r = check(bad, dir);
    assert.equal(r.status, 2, `${JSON.stringify(bad)}: ${r.out}`);
    assert.match(r.out, /is not a full commit hash/);
  }
});

test('main-head-check: a usage error exits 2', (t) => {
  const { dir, head } = repo(t);
  assert.equal(check(head).status, 2);
  assert.equal(check(head, dir, 'extra').status, 2);
});

/** The apply job's lines in deploy.yml, from `  apply:` to the next job. */
/** The lines of one top-level job in deploy.yml. */
function job(name) {
  const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `deploy.yml has no ${name} job`);
  let end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  if (end === -1) end = lines.length;
  return lines.slice(start, end);
}
const applyJob = () => job('apply');

/** A job's concurrency block, as its indented lines. */
function concurrencyOf(name) {
  const block = /^ {4}concurrency:\n((?: {6}.*\n)+)/m.exec(`${job(name).join('\n')}\n`);
  assert.ok(block, `the ${name} job has no concurrency block`);
  return block[1];
}

/** The apply job's steps, each as its lines, comments left out. */
function applySteps() {
  const job = applyJob();
  const from = job.indexOf('    steps:');
  assert.notEqual(from, -1, 'the apply job has no steps');
  const steps = [];
  for (const line of job.slice(from + 1)) {
    if (/^ {6}- /.test(line)) steps.push([line]);
    else if (steps.length && line.trim() && !line.trim().startsWith('#')) steps.at(-1).push(line);
  }
  return steps;
}

/** A step's `if:` condition, or undefined. Only a one-line condition counts. */
function condition(step) {
  for (const line of step) {
    const m = /^ {6}(?:- | {2})if: (.*)$/.exec(line);
    if (m) return m[1].trim();
  }
  return undefined;
}

test('deploy.yml: the head check is the apply job\'s first step after the checkout', () => {
  const steps = applySteps();
  const at = steps.findIndex((s) => s.some((l) => l.trim() === 'id: head'));
  assert.notEqual(at, -1, 'no step has id: head');
  const guard = steps[at];
  assert.ok(guard.some((l) => l.includes('./scripts/main-head-check.sh "$GITHUB_SHA" origin')),
    'the head check does not run the script on the run\'s commit');
  assert.equal(condition(guard), undefined, 'the head check itself must always run');
  for (const before of steps.slice(0, at)) {
    assert.match(before[0], /^ {6}- uses: actions\/checkout@[0-9a-f]{40} /,
      `only the checkout may come before the head check: ${before[0].trim()}`);
  }
});

test('deploy.yml: every apply step after the head check is gated on it', () => {
  const steps = applySteps();
  const at = steps.findIndex((s) => s.some((l) => l.trim() === 'id: head'));
  const after = steps.slice(at + 1);
  assert.ok(after.length > 10, 'expected the apply job\'s steps after the head check');
  for (const step of after) {
    const cond = condition(step);
    // Gated at the top level: `<gate>` alone, or `<gate> && <more>`. A
    // status function such as always() would run the step anyway.
    assert.ok(cond === GATE || cond?.startsWith(`${GATE} && `),
      `${step[0].trim()} runs whatever the head check said (if: ${cond})`);
    assert.doesNotMatch(cond, /\b(always|failure|cancelled)\(\)|\|\|/, `${step[0].trim()}: ${cond}`);
  }
  assert.ok(after.some((s) => s.some((l) => l.includes('terraform apply -auto-approve'))),
    'terraform apply is not among the gated steps');
});

test('deploy.yml: the apply group keeps every waiting run and cancels none', () => {
  // With the default queue: single, an older run arriving late would cancel
  // the newer one's waiting apply, and then itself stop at the head check.
  const block = concurrencyOf('apply');
  assert.match(block, /^ {6}group: shed-inventory-apply$/m);
  assert.match(block, /^ {6}cancel-in-progress: false$/m);
  assert.match(block, /^ {6}queue: max$/m);
});

test('deploy.yml: the plan group keeps every waiting run too, since apply needs plan', () => {
  // A late plan (a re-run of an old run) under queue: single would cancel the
  // pending plan of main's head, and the head's apply would then be skipped
  // while the old run stops at the head check: nothing applied.
  const block = concurrencyOf('plan');
  assert.match(block, /^ {6}group: shed-inventory-plan-\$\{\{ github\.ref \}\}$/m);
  assert.match(block, /^ {6}cancel-in-progress: false$/m);
  assert.match(block, /^ {6}queue: max$/m);
});
