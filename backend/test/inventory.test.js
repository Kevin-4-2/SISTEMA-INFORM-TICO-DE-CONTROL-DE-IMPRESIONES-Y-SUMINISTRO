// Tests de inventario: suministros y movimientos
import { startTestServer, stopTestServer } from './_server.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

let server;

// Usuarios QA: maria (operario), juan (tecnico), admin (administrador)

async function login(usuario, password, ip) {
  const res = await server.fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ usuario, password })
  });
  const cookie = res.headers.get('set-cookie') || '';
  return { res, cookie };
}

async function authFetch(path, method, cookie, body = null) {
  const headers = { Cookie: cookie };
  const opts = { method, headers };
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return server.fetch(path, opts);
}

describe('Inventario: suministros y movimientos', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await stopTestServer();
  });

  test('POST /suministros válido => 201 (admin)', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.1');
    const res = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA-Toner Test',
      tipo: 'toner',
      cantidad: 10,
      stock_minimo: 3,
      stock_maximo: 30,
      codigo: `QA-TONER-${Date.now()}`,
      fecha_ingreso: '2025-01-15'
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.id);
  });

  test('Código duplicado => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.2');
    const codigo = `QA-DUP-${Date.now()}`;
    // Crear uno primero
    await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Duplicado', tipo: 'otro', cantidad: 1, stock_minimo: 0, stock_maximo: 10,
      codigo, fecha_ingreso: '2025-01-01'
    });
    const res = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Duplicado 2', tipo: 'otro', cantidad: 1, stock_minimo: 0, stock_maximo: 10,
      codigo, fecha_ingreso: '2025-01-02'
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('Cantidad negativa => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.3');
    const res = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Negativo', tipo: 'otro', cantidad: -5, stock_minimo: 0, stock_maximo: 10,
      codigo: `QA-NEG-${Date.now()}`, fecha_ingreso: '2025-01-01'
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('Tipo inválido => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.4');
    const res = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Tipo Malo', tipo: 'inexistente', cantidad: 1, stock_minimo: 0, stock_maximo: 10,
      codigo: `QA-TIPO-${Date.now()}`, fecha_ingreso: '2025-01-01'
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('stock_maximo < stock_minimo => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.5');
    const res = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Stock Mal', tipo: 'otro', cantidad: 1, stock_minimo: 10, stock_maximo: 5,
      codigo: `QA-STOCK-${Date.now()}`, fecha_ingreso: '2025-01-01'
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('POST /suministros/:id/movimiento entrada => 201 y cantidad_actual incrementada', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.6');
    const codigo = `QA-MOV-${Date.now()}`;
    const createRes = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Movimiento', tipo: 'otro', cantidad: 5, stock_minimo: 0, stock_maximo: 100,
      codigo, fecha_ingreso: '2025-01-01'
    });
    assert.strictEqual(createRes.status, 201);
    const suministro = await createRes.json();
    const suministroId = suministro.id;

    const movRes = await authFetch(`/suministros/${suministroId}/movimiento`, 'POST', cookie, {
      tipo_movimiento: 'entrada', cantidad: 10, observacion: 'QA entrada', proveedor: 'QA Proveedor'
    });
    assert.strictEqual(movRes.status, 201, `Expected 201, got ${movRes.status}`);
    const movBody = await movRes.json();
    assert.strictEqual(movBody.cantidad_actual, 15, 'La cantidad actual debería ser 15 (5 + 10)');
  });

  test('Salida con cantidad > stock => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.7');
    const codigo = `QA-OUT-${Date.now()}`;
    const createRes = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Salida', tipo: 'otro', cantidad: 3, stock_minimo: 0, stock_maximo: 100,
      codigo, fecha_ingreso: '2025-01-01'
    });
    assert.strictEqual(createRes.status, 201);
    const suministro = await createRes.json();

    const movRes = await authFetch(`/suministros/${suministro.id}/movimiento`, 'POST', cookie, {
      tipo_movimiento: 'salida', cantidad: 10, observacion: 'QA salida excesiva'
    });
    assert.strictEqual(movRes.status, 400, `Expected 400, got ${movRes.status}`);
  });

  test('Salida con cantidad 0 => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.10.8');
    const codigo = `QA-ZERO-${Date.now()}`;
    const createRes = await authFetch('/suministros', 'POST', cookie, {
      nombre: 'QA Zero', tipo: 'otro', cantidad: 5, stock_minimo: 0, stock_maximo: 100,
      codigo, fecha_ingreso: '2025-01-01'
    });
    assert.strictEqual(createRes.status, 201);
    const suministro = await createRes.json();

    const movRes = await authFetch(`/suministros/${suministro.id}/movimiento`, 'POST', cookie, {
      tipo_movimiento: 'salida', cantidad: 0, observacion: 'QA salida cero'
    });
    assert.strictEqual(movRes.status, 400, `Expected 400, got ${movRes.status}`);
  });

  test('GET /suministros con rol operario => 200; con rol técnico => 403', async () => {
    const { cookie: opCookie } = await login('maria', 'maria123', '10.0.10.9');
    const opRes = await authFetch('/suministros', 'GET', opCookie);
    assert.strictEqual(opRes.status, 200, `Operario GET /suministros: expected 200, got ${opRes.status}`);

    const { cookie: techCookie } = await login('juan', 'juan123', '10.0.10.10');
    const techRes = await authFetch('/suministros', 'GET', techCookie);
    assert.strictEqual(techRes.status, 403, `Técnico GET /suministros: expected 403, got ${techRes.status}`);
  });
});
