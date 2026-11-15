// Tests for authentication and role-based authorization
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

// Helper to perform login with custom X-Forwarded-For to avoid rate limit
async function login(usuario, password, ip) {
  const res = await server.fetch('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip
    },
    body: JSON.stringify({ usuario, password })
  });
  const data = await res.json();
  const cookie = res.headers.get('set-cookie') || '';
  return { res, data, cookie };
}

// Helper to make an authorized request using cookie
async function authFetch(path, method, cookie, extra = {}) {
  const sessionCookie = cookie.split(';')[0];
  const headers = { Cookie: sessionCookie, ...(extra.headers || {}) };
  const opts = { method, headers };
  if (extra.body !== undefined) opts.body = extra.body;
  return server.fetch(path, opts);
}

describe('Authentication and Authorization', () => {
  test('Valid admin login returns rol administrador', async () => {
    const { res, data, cookie } = await login('admin', 'admin123', '10.0.0.1');
    assert.strictEqual(res.status, 200);
    assert.ok(data.ok);
    assert.strictEqual(data.rol, 'administrador');
    assert.ok(cookie.includes('sicis.sid'));
  });

  test('Login with wrong password returns 401', async () => {
    const { res } = await login('admin', 'wrongpass', '10.0.0.2');
    assert.strictEqual(res.status, 401);
  });

  test('Logout destroys session; subsequent /sesion is 401', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.0.3');
    const logoutRes = await authFetch('/logout', 'POST', cookie);
    assert.strictEqual(logoutRes.status, 200);
    const sesRes = await authFetch('/sesion', 'GET', cookie);
    assert.strictEqual(sesRes.status, 401);
  });

  test('GET /dashboard/resumen without session returns 401', async () => {
    const res = await server.get('/dashboard/resumen');
    assert.strictEqual(res.status, 401);
  });

  test('Operario cannot create usuarios (403)', async () => {
    const { cookie } = await login('maria', 'maria123', '10.0.0.4');
    const res = await authFetch('/usuarios', 'POST', cookie, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Test', usuario: 'testuser', password: 'Test1234Aa', rol: 'operario', activo: true })
    });
    assert.strictEqual(res.status, 403);
  });

  test('Operario cannot access reportes (403)', async () => {
    const { cookie } = await login('maria', 'maria123', '10.0.0.5');
    const res = await authFetch('/reportes/consumo-mensual', 'GET', cookie);
    assert.strictEqual(res.status, 403);
  });

  test('Tecnico cannot list usuarios (403)', async () => {
    const { cookie } = await login('juan', 'juan123', '10.0.0.6');
    const res = await authFetch('/usuarios', 'GET', cookie);
    assert.strictEqual(res.status, 403);
  });

  test('Operario cannot create suministros (403)', async () => {
    const { cookie } = await login('maria', 'maria123', '10.0.0.7');
    const res = await authFetch('/suministros', 'POST', cookie, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Test', tipo: 'otro', cantidad: 1, stock_minimo: 0, stock_maximo: 10, codigo: 'TEST-001', fecha_ingreso: '2025-01-01' })
    });
    assert.strictEqual(res.status, 403);
  });

  test('Tecnico cannot create impresoras (403)', async () => {
    const { cookie } = await login('juan', 'juan123', '10.0.0.8');
    const res = await authFetch('/impresoras', 'POST', cookie, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Test Imp', modelo: 'X', ubicacion: 'Lab', estado: 'activa', contador_actual: 0 })
    });
    assert.strictEqual(res.status, 403);
  });
});
