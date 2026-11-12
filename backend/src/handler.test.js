import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from './handler.js';

test('GET /health answers ok', async () => {
  const res = await handler({ routeKey: 'GET /health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('any other route is a 404', async () => {
  for (const routeKey of ['GET /items', 'POST /health', '$default', undefined]) {
    const res = await handler({ routeKey });
    assert.equal(res.statusCode, 404, String(routeKey));
  }
});

test('an event with no routeKey at all is a 404, not a crash', async () => {
  assert.equal((await handler(undefined)).statusCode, 404);
});
