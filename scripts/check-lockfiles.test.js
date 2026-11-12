/**
 * Tests for scripts/check-lockfiles.js, the lock-file tamper-check guard
 * (jerryaswell/self_mgmt#67), and for its wiring in the deploy's build and build-backend jobs.
 *
 * The self-tests build lock files by hand, each a copy of a clean one with one
 * defect, so they pin what is flagged and what is left alone. The tree tests
 * run the check over every package-lock.json in the repository, and read
 * .github/workflows/deploy.yml as text for the steps that run it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLockfiles, lockFindings, tarballUrl } from './check-lockfiles.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./check-lockfiles.js', import.meta.url));
const WORKFLOW = fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url));

// A well-formed sha512 token: 86 base64 characters and the padding.
const HASH = `sha512-${'A'.repeat(86)}==`;

/** A registry entry for `name` at `version`, as npm writes one. */
const registryEntry = (name, version = '1.0.0') => ({
  version,
  resolved: tarballUrl(name, version),
  integrity: HASH,
  license: 'MIT'
});

/** A clean lock file: the root, a plain, a scoped and a nested dependency. */
function cleanLock() {
  return {
    name: 'fixture',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'fixture', version: '1.0.0', dependencies: { plain: '^1.0.0', '@scope/pkg': '^2.0.0' } },
      'node_modules/plain': registryEntry('plain'),
      'node_modules/@scope/pkg': registryEntry('@scope/pkg', '2.0.0'),
      'node_modules/@scope/pkg/node_modules/plain': { ...registryEntry('plain', '0.9.0'), dev: true }
    }
  };
}

/** A clean lock file with `edit` applied to its packages map. */
function lockWith(edit) {
  const lock = cleanLock();
  edit(lock.packages);
  return lock;
}

// ---- What is flagged ------------------------------------------------------

test('a clean lock file has no findings', () => {
  assert.deepEqual(lockFindings(cleanLock()), []);
});

test('tarballUrl is the registry\'s layout, the scope in the path and not the file name', () => {
  assert.equal(tarballUrl('plain', '1.0.0'), 'https://registry.npmjs.org/plain/-/plain-1.0.0.tgz');
  assert.equal(tarballUrl('@scope/pkg', '2.0.0'), 'https://registry.npmjs.org/@scope/pkg/-/pkg-2.0.0.tgz');
});

test('an entry with no integrity is flagged, the shape of the jerryaswell/self_mgmt#55 lock file', () => {
  const lock = lockWith((p) => delete p['node_modules/plain'].integrity);
  assert.deepEqual(lockFindings(lock), ['node_modules/plain: no integrity']);
});

test('an entry with no resolved is flagged', () => {
  const lock = lockWith((p) => delete p['node_modules/@scope/pkg'].resolved);
  assert.deepEqual(lockFindings(lock), ['node_modules/@scope/pkg: no resolved']);
});

test('an entry with neither, as `npm install` over a local tree writes it, is flagged for both', () => {
  const lock = lockWith((p) => {
    delete p['node_modules/@scope/pkg/node_modules/plain'].resolved;
    delete p['node_modules/@scope/pkg/node_modules/plain'].integrity;
  });
  assert.deepEqual(lockFindings(lock), [
    'node_modules/@scope/pkg/node_modules/plain: no integrity',
    'node_modules/@scope/pkg/node_modules/plain: no resolved'
  ]);
});

test('an integrity that holds no well-formed sha512 hash is flagged', () => {
  for (const integrity of ['', 'x', 'sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA=', `sha512-${'A'.repeat(10)}==`, `sha256-${'A'.repeat(43)}=`, 42]) {
    const lock = lockWith((p) => (p['node_modules/plain'].integrity = integrity));
    assert.deepEqual(lockFindings(lock), ['node_modules/plain: integrity holds no sha512 hash'], JSON.stringify(integrity));
  }
});

test('an integrity with a sha512 token beside another algorithm is accepted', () => {
  const lock = lockWith((p) => (p['node_modules/plain'].integrity = `sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA= ${HASH}`));
  assert.deepEqual(lockFindings(lock), []);
});

test('a resolved on another host, or not quite the registry, is flagged', () => {
  for (const resolved of [
    'https://registry.example.com/plain/-/plain-1.0.0.tgz',
    'http://registry.npmjs.org/plain/-/plain-1.0.0.tgz',
    'https://registry.npmjs.org.example.com/plain/-/plain-1.0.0.tgz',
    'https://user@registry.npmjs.org/plain/-/plain-1.0.0.tgz',
    'git+ssh://git@github.com/someone/plain.git#0123456789abcdef0123456789abcdef01234567',
    'file:../plain-1.0.0.tgz'
  ]) {
    const lock = lockWith((p) => (p['node_modules/plain'].resolved = resolved));
    const findings = lockFindings(lock);
    assert.equal(findings.length, 1, resolved);
    assert.match(findings[0], /^node_modules\/plain: resolved is .*, not the registry's https:\/\/registry\.npmjs\.org\/plain\/-\/plain-1\.0\.0\.tgz$/);
  }
});

test('a resolved on the registry but for another package or version is flagged', () => {
  for (const resolved of [tarballUrl('evil', '1.0.0'), tarballUrl('plain', '1.0.1'), tarballUrl('@scope/plain', '1.0.0')]) {
    const lock = lockWith((p) => (p['node_modules/plain'].resolved = resolved));
    assert.equal(lockFindings(lock).length, 1, resolved);
  }
});

test('an alias resolves to the tarball of the package its name field names', () => {
  // `"plain": "npm:other@3.0.0"` installs other under node_modules/plain.
  const aliased = { name: 'other', ...registryEntry('other', '3.0.0') };
  assert.deepEqual(lockFindings(lockWith((p) => (p['node_modules/plain'] = aliased))), []);
  const wrong = { ...aliased, resolved: tarballUrl('plain', '3.0.0') };
  assert.equal(lockFindings(lockWith((p) => (p['node_modules/plain'] = wrong))).length, 1);
});

test('a file with no packages map, or not an object, is one finding', () => {
  for (const lock of [{ lockfileVersion: 1, dependencies: {} }, [], null, 'text']) {
    assert.deepEqual(lockFindings(lock), ['no `packages` map: lockfileVersion 2 or 3 is needed'], JSON.stringify(lock));
  }
});

test('an installed entry that is not an object is flagged', () => {
  assert.deepEqual(lockFindings(lockWith((p) => (p['node_modules/plain'] = 'plain'))), ['node_modules/plain: not an object']);
});

// ---- What is left alone ---------------------------------------------------

test('the root and other folders of the repository need neither field', () => {
  const lock = lockWith((p) => {
    p['packages/tool'] = { name: 'tool', version: '0.0.1' };
  });
  assert.deepEqual(lockFindings(lock), []);
});

test('a workspace link to a folder the lock file holds needs neither field', () => {
  const lock = lockWith((p) => {
    p['packages/tool'] = { name: 'tool', version: '0.0.1' };
    p['node_modules/tool'] = { resolved: 'packages/tool', link: true };
  });
  assert.deepEqual(lockFindings(lock), []);
});

test('a link to anything else is flagged, so `link` is no way round the check', () => {
  for (const resolved of [undefined, 'packages/missing', 'node_modules/plain', 'https://registry.npmjs.org/plain/-/plain-1.0.0.tgz']) {
    const lock = lockWith((p) => (p['node_modules/tool'] = { resolved, link: true }));
    const findings = lockFindings(lock);
    assert.equal(findings.length, 1, String(resolved));
    assert.match(findings[0], /^node_modules\/tool: a link to .*, which is not a folder the lock file holds$/);
  }
});

test('a bundled dependency nested under its parent, which arrives inside the parent\'s tarball, needs neither field', () => {
  const lock = lockWith((p) => {
    p['node_modules/@scope/pkg/node_modules/bundled'] = { version: '1.0.0', inBundle: true };
  });
  assert.deepEqual(lockFindings(lock), []);
});

test('a top-level entry marked inBundle is checked like any other, so the flag is no way round the check', () => {
  const foreign = { version: '1.0.0', inBundle: true, resolved: 'https://registry.example.com/plain/-/plain-1.0.0.tgz' };
  const findings = lockFindings(lockWith((p) => (p['node_modules/plain'] = foreign)));
  assert.deepEqual(findings, [
    'node_modules/plain: no integrity',
    "node_modules/plain: resolved is \"https://registry.example.com/plain/-/plain-1.0.0.tgz\", not the registry's https://registry.npmjs.org/plain/-/plain-1.0.0.tgz"
  ]);
  const bare = { version: '1.0.0', inBundle: true };
  assert.deepEqual(lockFindings(lockWith((p) => (p['node_modules/plain'] = bare))), ['node_modules/plain: no integrity', 'node_modules/plain: no resolved']);
});

test('a nested inBundle entry that carries a resolved or integrity of its own, which npm would fetch, is checked', () => {
  const key = 'node_modules/@scope/pkg/node_modules/bundled';
  const withResolved = { version: '1.0.0', inBundle: true, resolved: 'https://registry.example.com/bundled/-/bundled-1.0.0.tgz' };
  assert.deepEqual(lockFindings(lockWith((p) => (p[key] = withResolved))), [
    `${key}: no integrity`,
    `${key}: resolved is "https://registry.example.com/bundled/-/bundled-1.0.0.tgz", not the registry's ${tarballUrl('bundled', '1.0.0')}`
  ]);
  const withIntegrity = { version: '1.0.0', inBundle: true, integrity: HASH };
  assert.deepEqual(lockFindings(lockWith((p) => (p[key] = withIntegrity))), [`${key}: no resolved`]);
  const clean = { ...registryEntry('bundled'), inBundle: true };
  assert.deepEqual(lockFindings(lockWith((p) => (p[key] = clean))), []);
});

// ---- The command ----------------------------------------------------------

/** Write `locks` (name to object, or to raw text) to a throwaway folder and run the script on them. */
function runScript(locks) {
  const dir = mkdtempSync(join(tmpdir(), 'check-lockfiles-'));
  try {
    const files = Object.entries(locks).map(([name, lock]) => {
      const file = join(dir, name);
      writeFileSync(file, typeof lock === 'string' ? lock : JSON.stringify(lock));
      return file;
    });
    const r = spawnSync(process.execPath, [SCRIPT, ...files], { encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr.replaceAll(dir, '<dir>') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the command exits 0 on clean files and 1 naming every bad entry in any of them', () => {
  const clean = runScript({ 'a.json': cleanLock(), 'b.json': cleanLock() });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stderr, '');

  const bad = lockWith((p) => {
    delete p['node_modules/plain'].integrity;
    delete p['node_modules/@scope/pkg'].resolved;
  });
  const r = runScript({ 'a.json': cleanLock(), 'b.json': bad });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.deepEqual(r.stderr.trim().split('\n'), [
    '::error file=<dir>/b.json::<dir>/b.json: node_modules/plain: no integrity',
    '::error file=<dir>/b.json::<dir>/b.json: node_modules/@scope/pkg: no resolved',
    "2 lock entries would install without a tamper check, or from somewhere other than the registry's tarball"
  ]);
});

test('the command exits 2 with no files, and on a file that is not JSON, without quoting it', () => {
  const none = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /^usage: /);

  const r = runScript({ 'a.json': '{"packages": not json SECRET' });
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), '<dir>/a.json: cannot be read as JSON (SyntaxError)');
});

test('checkLockfiles reads through the reader it is given', () => {
  const err = [];
  const status = checkLockfiles(['x'], { read: () => JSON.stringify(cleanLock()), out: () => {}, err: (l) => err.push(l) });
  assert.equal(status, 0);
  assert.deepEqual(err, []);
});

// ---- The tree -------------------------------------------------------------

/** Every package-lock.json in the repository, outside node_modules. */
function lockFiles() {
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.terraform', 'dist', 'coverage'].includes(entry.name)) walk(join(abs, entry.name));
      } else if (entry.name === 'package-lock.json' || entry.name === 'npm-shrinkwrap.json') {
        out.push(relative(ROOT, join(abs, entry.name)));
      }
    }
  };
  walk(ROOT);
  return out.sort();
}

test('every lock file in the repository is clean', () => {
  const files = lockFiles();
  assert.deepEqual(files, ['backend/package-lock.json', 'package-lock.json']);
  for (const file of files) {
    assert.deepEqual(lockFindings(JSON.parse(readFileSync(join(ROOT, file), 'utf8'))), [], file);
  }
});

test('the root lock file with every third entry stripped, as jerryaswell/self_mgmt#55 found it, names exactly those', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const stripped = Object.keys(lock.packages).filter((k) => k !== '').filter((_, i) => i % 3 === 0);
  assert.ok(stripped.length > 50, 'the root lock file is smaller than expected');
  for (const key of stripped) {
    delete lock.packages[key].resolved;
    delete lock.packages[key].integrity;
  }
  assert.deepEqual(lockFindings(lock), stripped.flatMap((k) => [`${k}: no integrity`, `${k}: no resolved`]));
});

/** A job's steps in deploy.yml, each as its lines, comments left out. */
function jobSteps(name) {
  const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `deploy.yml has no ${name} job`);
  let end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  if (end === -1) end = lines.length;
  const job = lines.slice(start, end);
  const from = job.indexOf('    steps:');
  assert.notEqual(from, -1, `the ${name} job has no steps`);
  const steps = [];
  for (const line of job.slice(from + 1)) {
    if (/^ {6}- /.test(line)) steps.push([line]);
    else if (steps.length && line.trim() && !line.trim().startsWith('#')) steps.at(-1).push(line);
  }
  return steps;
}

/**
 * Each job that runs `npm ci` checks its lock files first, unconditionally.
 * `build` runs at the root and checks both files; `build-backend` runs in
 * backend/ and checks its own.
 */
const CHECKS = {
  build: `node scripts/check-lockfiles.js ${lockFiles().join(' ')}`,
  'build-backend': 'node ../scripts/check-lockfiles.js package-lock.json'
};

for (const [job, command] of Object.entries(CHECKS)) {
  test(`deploy.yml: the ${job} job checks its lock files before its first npm ci, with no condition`, () => {
    const steps = jobSteps(job);
    const check = steps.findIndex((s) => s.some((l) => l.trim().replace(/^- /, '') === `run: ${command}`));
    assert.notEqual(check, -1, `no ${job} step runs: ${command}`);
    for (const line of steps[check]) {
      assert.doesNotMatch(line, /^\s*(if|continue-on-error):/, `the check step in ${job} is conditional or allowed to fail`);
    }
    const install = steps.findIndex((s) => s.some((l) => /\bnpm ci\b/.test(l)));
    assert.notEqual(install, -1, `the ${job} job runs no npm ci`);
    assert.ok(check < install, 'the lock files are checked only after npm ci has installed from them');
  });
}

/**
 * No workflow runs a dependency's install script (jerryaswell/self_mgmt#271). Every npm command in
 * .github/workflows that installs or rebuilds packages takes --ignore-scripts,
 * in the same shell command as the install (a trailing `#` comment and the
 * other commands on the line do not count), and not as `--ignore-scripts=false`.
 * The commands are also pinned to where they are expected, so an install that
 * moved into a form the pattern cannot read would be missed here, not passed.
 */
const WORKFLOWS = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
// `npm`, then any options (`--prefix backend`, `-C backend`, `--foo=bar`), then
// an install or rebuild subcommand or alias. `npx` and `npm exec` fetch a
// package too, so they are held to the same flag.
const INSTALLS =
  /\b(?:npx\b|npm(?:\s+-{1,2}[\w-]+(?:=\S+|\s+(?!-)[^\s;&|)]+)?)*\s+(?:ci|clean-install|install|i|add|install-test|it|install-ci-test|cit|rebuild|rb|exec|x)(?=\s|$|\)))/;
const IGNORES_SCRIPTS = /\s--ignore-scripts(?:=true)?(?=\s|$|\))/;
/** Where the installs are: each of these jobs has exactly one. */
const INSTALLERS = {
  'deploy.yml': ['build', 'build-backend']
};

/** The shell commands of a line, the `#` comment stripped, split on `&&`, `;` and `|`. */
const commandsOf = (line) =>
  line
    .replace(/\s#.*$/, '')
    .split(/&&|\|\|?|;/)
    .map((c) => c.trim())
    .filter(Boolean);

test('every npm install in .github/workflows runs with --ignore-scripts', () => {
  const runs = [];
  for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const lines = readFileSync(join(WORKFLOWS, file), 'utf8').split('\n');
    let job = null;
    lines.forEach((line, i) => {
      const heading = /^ {2}([\w-]+):\s*$/.exec(line);
      if (heading) job = heading[1];
      if (line.trim().startsWith('#')) return;
      for (const command of commandsOf(line)) {
        if (INSTALLS.test(command)) runs.push({ where: `${file}:${i + 1}`, file, job, command });
      }
    });
  }
  for (const { where, command } of runs) {
    assert.match(command, IGNORES_SCRIPTS, `${where} installs with install scripts: ${command}`);
  }
  const found = Object.fromEntries(Object.keys(INSTALLERS).map((f) => [f, runs.filter((r) => r.file === f).map((r) => r.job)]));
  assert.deepEqual(found, INSTALLERS, 'the installs are not where INSTALLERS says, one per job');
});

test('the install pattern reads the forms a workflow could take', () => {
  const installs = [
    'npm ci',
    'npm ci --ignore-scripts',
    'npm --prefix backend ci',
    'npm -C backend ci --ignore-scripts',
    'npm --loglevel=warn install',
    'npm i -g something',
    'npm rebuild esbuild',
    'npm exec -- something',
    'npx something',
    '(cd backend && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)'
  ];
  for (const c of installs) assert.ok(commandsOf(c).some((x) => INSTALLS.test(x)), c);
  for (const c of ['npm run build', 'npm test', 'npm audit --audit-level=high', 'npm run install-check', 'node scripts/check-lockfiles.js']) {
    assert.ok(!commandsOf(c).some((x) => INSTALLS.test(x)), c);
  }
  for (const c of ['npm ci --ignore-scripts', 'npm ci --ignore-scripts=true', 'npm ci --omit=dev --ignore-scripts --no-audit']) {
    assert.match(c, IGNORES_SCRIPTS, c);
  }
  for (const c of ['npm ci --ignore-scripts=false', 'npm ci --ignore-scriptsx', 'npm ci']) {
    assert.doesNotMatch(c, IGNORES_SCRIPTS, c);
  }
  // The flag in a comment, or on another command of the line, does not count.
  assert.deepEqual(commandsOf('npm ci # --ignore-scripts'), ['npm ci']);
  assert.deepEqual(commandsOf('echo npm ci --ignore-scripts && npm i'), ['echo npm ci --ignore-scripts', 'npm i']);
});
