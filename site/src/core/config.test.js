import { expect, test } from 'vitest';
import { loadConfig } from './config.js';
import { checkHealth } from './api.js';

const reply = (status, body, type = 'application/json') => async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });

test('a deployed config.json gives the API base', async () => {
  expect(await loadConfig(reply(200, { apiBase: 'https://abc123.execute-api.us-east-2.amazonaws.com' }))).toEqual({
    apiBase: 'https://abc123.execute-api.us-east-2.amazonaws.com'
  });
});

test('no config is sample mode: a 404, the dev server\'s index.html, a network error', async () => {
  expect(await loadConfig(reply(404, 'not found', 'text/plain'))).toBeNull();
  expect(await loadConfig(reply(200, '<!doctype html>', 'text/html'))).toBeNull();
  expect(await loadConfig(async () => { throw new TypeError('offline'); })).toBeNull();
});

test('a config with no usable apiBase is sample mode', async () => {
  for (const body of [{}, { apiBase: '' }, { apiBase: 'http://insecure.example' }, { apiBase: 'https://x.example/path' }]) {
    expect(await loadConfig(reply(200, body))).toBeNull();
  }
});

test('checkHealth is true only for {"ok": true}', async () => {
  expect(await checkHealth('https://api', reply(200, { ok: true }))).toBe(true);
  expect(await checkHealth('https://api', reply(200, { ok: 'yes' }))).toBe(false);
  expect(await checkHealth('https://api', reply(503, { error: 'backend not yet deployed' }))).toBe(false);
  expect(await checkHealth('https://api', async () => { throw new TypeError('offline'); })).toBe(false);
});
