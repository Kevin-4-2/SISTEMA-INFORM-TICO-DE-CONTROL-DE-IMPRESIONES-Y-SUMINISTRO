import { startTestServer, stopTestServer } from './_server.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

let server;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await stopTestServer();
});

describe('Smoke tests', () => {
  test('GET /health => 200 and database connected', async () => {
    const res = await server.get('/health');
    assert.strictEqual(res.status, 200, 'Expected status 200');
    const body = await res.json();
    assert.strictEqual(body.status, 'ok', 'Expected status ok');
    assert.strictEqual(body.database, 'connected', 'Expected database connected');
  });

  test('GET /sesion without cookie => 401', async () => {
    const res = await server.get('/sesion');
    assert.strictEqual(res.status, 401, 'Expected status 401');
    const body = await res.json();
    assert.ok(body.error, 'Expected error message');
    assert.match(body.error, /No autenticado|Unauthorized/i, 'Expected authentication error');
  });
});
