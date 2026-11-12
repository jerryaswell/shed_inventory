/**
 * The bundle's target and the function's runtime name one Node major, and so
 * does .nvmrc, the toolchain. A Node bump that moves one and not the others
 * fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the esbuild target, the Lambda runtime and .nvmrc name the same Node major', () => {
  const target = /target: 'node(\d+)'/.exec(read('./esbuild.config.js'))?.[1];
  const runtime = /runtime\s*=\s*"nodejs(\d+)\.x"/.exec(read('../modules/aws/lambda/main.tf'))?.[1];
  const nvmrc = read('../.nvmrc').trim();
  assert.ok(target, 'no node target in esbuild.config.js');
  assert.ok(runtime, 'no nodejs runtime in modules/aws/lambda/main.tf');
  assert.equal(target, runtime);
  assert.equal(nvmrc, runtime);
});
