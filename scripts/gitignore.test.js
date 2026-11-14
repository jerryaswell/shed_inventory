/**
 * Tests for .gitignore's local env exclusions (#21).
 *
 * Vite loads `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local`. The
 * `.local` forms are machine-local and stay out of git; `.env` and
 * `.env.<mode>` are shareable and must stay stageable. Asked of git itself,
 * with --no-index, so the answer is the one `git add` would get.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The subset of `paths` that .gitignore excludes. */
function ignored(paths) {
  const run = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: ROOT,
    input: paths.join('\n') + '\n',
    encoding: 'utf8'
  });
  // 0: some matched; 1: none matched; anything else is an error.
  assert.ok(run.status === 0 || run.status === 1, run.stderr);
  return run.stdout.split('\n').filter(Boolean);
}

test('machine-local env files are ignored, for every mode', () => {
  const local = [
    'site/.env.local',
    'site/.env.development.local',
    'site/.env.production.local',
    'site/.env.test.local',
    'backend/.env.development.local'
  ];
  assert.deepEqual(ignored(local), local);
});

test('shareable .env.<mode> files are not ignored', () => {
  assert.deepEqual(
    ignored(['site/.env.development', 'site/.env.production', 'site/.env.test']),
    []
  );
});
