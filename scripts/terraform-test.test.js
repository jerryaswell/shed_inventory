/**
 * The plan job runs the mocked Terraform tests (#22).
 *
 * tests/*.tftest.hcl check the inputs' validation, such as a reservation of 0
 * that would disable the API. A plan of the committed values passes whether
 * or not that validation is there, so the plan is no substitute for them.
 * Read from .github/workflows/deploy.yml as text: the plan job's run steps,
 * in order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOW = fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url));
const TESTS = fileURLToPath(new URL('../tests/', import.meta.url));

/** The lines of one top-level job in deploy.yml. */
function job(name) {
  const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `deploy.yml has no ${name} job`);
  let end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  if (end === -1) end = lines.length;
  return lines.slice(start, end);
}

/** A job's single-line `- run:` commands, in order. */
function runs(name) {
  return job(name)
    .map((l) => /^ {6}- run: (.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

test('there are mocked Terraform tests to run', () => {
  const files = readdirSync(TESTS).filter((f) => f.endsWith('.tftest.hcl'));
  assert.ok(files.length > 0, 'tests/ holds no .tftest.hcl file');
  for (const f of files) {
    assert.match(readFileSync(`${TESTS}${f}`, 'utf8'), /^mock_provider "aws"/m, `${f} would call AWS`);
  }
});

test('the plan job runs terraform test after validate and before the plan', () => {
  const steps = runs('plan');
  const validate = steps.indexOf('terraform validate');
  const tftest = steps.indexOf('terraform test');
  assert.notEqual(validate, -1, 'the plan job does not run terraform validate');
  assert.notEqual(tftest, -1, 'the plan job does not run terraform test');
  assert.ok(tftest > validate, 'terraform test runs before terraform validate');
  const lines = job('plan');
  const at = lines.indexOf('      - run: terraform test');
  const plan = lines.findIndex((l) => /^ {8}run: terraform plan\b/.test(l));
  assert.ok(plan > at, 'terraform test runs after the plan, or there is no plan');
});
