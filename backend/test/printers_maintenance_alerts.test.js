// Tests de impresoras, mantenimientos y alertas
import { startTestServer, stopTestServer } from './_server.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

let server;
let printerId;

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

describe('Impresoras, mantenimientos y alertas', () => {
  before(async () => {
    server = await startTestServer();
    const { cookie } = await login('admin', 'admin123', '10.0.30.100');
    const response = await authFetch('/impresoras', 'GET', cookie);
    assert.strictEqual(response.status, 200);
    const printers = await response.json();
    assert.ok(printers.length > 0, 'QA requiere una impresora');
    printerId = printers[0].id;
  });

  after(async () => {
    await stopTestServer();
  });

  test('POST /impresoras válido => 201 (administrador)', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.30.1');
    const res = await authFetch('/impresoras', 'POST', cookie, {
      nombre: `QA Impresora ${Date.now()}`,
      modelo: 'HP Test',
      ubicacion: 'QA Lab',
      estado: 'activa',
      contador_actual: 0
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.id);
  });

  test('contador_actual negativo => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.30.2');
    const res = await authFetch('/impresoras', 'POST', cookie, {
      nombre: `QA Neg ${Date.now()}`,
      modelo: 'X', ubicacion: 'Lab', estado: 'activa', contador_actual: -1
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('estado inválido => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.30.3');
    const res = await authFetch('/impresoras', 'POST', cookie, {
      nombre: `QA Bad ${Date.now()}`,
      modelo: 'X', ubicacion: 'Lab', estado: 'explodida', contador_actual: 0
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('Falta nombre/ubicacion => 400', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.30.4');
    const res = await authFetch('/impresoras', 'POST', cookie, {
      modelo: 'X', estado: 'activa'
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('PUT /impresoras/:id => 200; id inexistente => 404', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.30.5');
    const createRes = await authFetch('/impresoras', 'POST', cookie, {
      nombre: `QA Put ${Date.now()}`, modelo: 'X', ubicacion: 'Lab', estado: 'activa', contador_actual: 0
    });
    assert.strictEqual(createRes.status, 201);
    const creado = await createRes.json();

    const putRes = await authFetch(`/impresoras/${creado.id}`, 'PUT', cookie, {
      nombre: `QA Put ${Date.now()} Updated`, modelo: 'X2', ubicacion: 'Lab2', estado: 'inactiva', contador_actual: 10
    });
    assert.strictEqual(putRes.status, 200, `Expected 200, got ${putRes.status}`);

    const noExist = await authFetch('/impresoras/999999', 'PUT', cookie, {
      nombre: 'X', modelo: 'X', ubicacion: 'X', estado: 'activa'
    });
    assert.strictEqual(noExist.status, 404, `Expected 404, got ${noExist.status}`);
  });

  test('DELETE /impresoras/:id con supervisor => 403; con administrador => 204', async () => {
    const { cookie: supCookie } = await login('carlos', 'carlos123', '10.0.30.6');
    const createRes = await authFetch('/impresoras', 'POST', supCookie, {
      nombre: `QA Del ${Date.now()}`, modelo: 'X', ubicacion: 'Lab', estado: 'activa', contador_actual: 0
    });
    assert.strictEqual(createRes.status, 201);
    const creado = await createRes.json();

    const delSup = await authFetch(`/impresoras/${creado.id}`, 'DELETE', supCookie);
    assert.strictEqual(delSup.status, 403, `Supervisor DELETE: expected 403, got ${delSup.status}`);

    // Crear otra para borrar con admin
    const createRes2 = await authFetch('/impresoras', 'POST', supCookie, {
      nombre: `QA Del2 ${Date.now()}`, modelo: 'X', ubicacion: 'Lab', estado: 'activa', contador_actual: 0
    });
    assert.strictEqual(createRes2.status, 201);
    const creado2 = await createRes2.json();

    const { cookie: admCookie } = await login('admin', 'admin123', '10.0.30.7');
    const delAdm = await authFetch(`/impresoras/${creado2.id}`, 'DELETE', admCookie);
    assert.strictEqual(delAdm.status, 204, `Administrador DELETE: expected 204, got ${delAdm.status}`);
  });

  test('POST /mantenimientos válido => 201; impresora inexistente => 400; estado inválido => 400', async () => {
    const { cookie } = await login('carlos', 'carlos123', '10.0.30.8');
    const res = await authFetch('/mantenimientos', 'POST', cookie, {
      impresora_id: printerId,
      tecnico: 'Juan Técnico',
      fecha: '2025-06-01',
      estado: 'pendiente',
      descripcion: 'Mantenimiento QA'
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);

    const badImp = await authFetch('/mantenimientos', 'POST', cookie, {
      impresora_id: 99999,
      tecnico: 'Juan Técnico',
      fecha: '2025-06-01',
      estado: 'pendiente',
      descripcion: 'QA'
    });
    assert.strictEqual(badImp.status, 400, `Expected 400, got ${badImp.status}`);

    const badEst = await authFetch('/mantenimientos', 'POST', cookie, {
      impresora_id: printerId,
      tecnico: 'Juan Técnico',
      fecha: '2025-06-01',
      estado: 'explodido',
      descripcion: 'QA'
    });
    assert.strictEqual(badEst.status, 400, `Expected 400, got ${badEst.status}`);
  });

  test('PUT /mantenimientos/:id => 200', async () => {
    const { cookie } = await login('carlos', 'carlos123', '10.0.30.9');
    const createRes = await authFetch('/mantenimientos', 'POST', cookie, {
      impresora_id: printerId,
      tecnico: 'Juan Técnico',
      fecha: '2025-06-01',
      estado: 'pendiente',
      descripcion: 'QA Mantenimiento'
    });
    assert.strictEqual(createRes.status, 201);
    const creado = await createRes.json();

    const putRes = await authFetch(`/mantenimientos/${creado.id}`, 'PUT', cookie, {
      impresora_id: printerId,
      tecnico: 'Juan Técnico Actualizado',
      fecha: '2025-06-02',
      estado: 'finalizado',
      descripcion: 'QA Mantenimiento Finalizado',
      solucion: 'Se reparó'
    });
    assert.strictEqual(putRes.status, 200, `Expected 200, got ${putRes.status}`);
  });

  test('POST /alertas válido => 201; tipo/gravedad inválido => 400; operario => 403', async () => {
    const { cookie: supCookie } = await login('carlos', 'carlos123', '10.0.30.10');
    const res = await authFetch('/alertas', 'POST', supCookie, {
      tipo: 'suministro',
      gravedad: 'alto',
      titulo: 'QA Alerta',
      descripcion: 'Alerta de prueba QA'
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);

    const badTipo = await authFetch('/alertas', 'POST', supCookie, {
      tipo: 'inexistente', gravedad: 'alto', titulo: 'QA'
    });
    assert.strictEqual(badTipo.status, 400, `Expected 400, got ${badTipo.status}`);

    const badGrav = await authFetch('/alertas', 'POST', supCookie, {
      tipo: 'suministro', gravedad: 'mortal', titulo: 'QA'
    });
    assert.strictEqual(badGrav.status, 400, `Expected 400, got ${badGrav.status}`);

    const { cookie: opCookie } = await login('maria', 'maria123', '10.0.30.11');
    const opRes = await authFetch('/alertas', 'POST', opCookie, {
      tipo: 'suministro', gravedad: 'bajo', titulo: 'QA Op'
    });
    assert.strictEqual(opRes.status, 403, `Operario POST /alertas: expected 403, got ${opRes.status}`);
  });

  test('DELETE /alertas/:id => 204 (soft delete) con supervisor', async () => {
    const { cookie } = await login('carlos', 'carlos123', '10.0.30.12');
    const createRes = await authFetch('/alertas', 'POST', cookie, {
      tipo: 'sistema', gravedad: 'bajo', titulo: 'QA Borrar', descripcion: 'QA'
    });
    assert.strictEqual(createRes.status, 201);
    const creado = await createRes.json();

    const delRes = await authFetch(`/alertas/${creado.id}`, 'DELETE', cookie);
    assert.strictEqual(delRes.status, 204, `Expected 204, got ${delRes.status}`);
  });

  test('GET /mantenimientos con operario => 403', async () => {
    const { cookie } = await login('maria', 'maria123', '10.0.30.13');
    const res = await authFetch('/mantenimientos', 'GET', cookie);
    assert.strictEqual(res.status, 403, `Operario GET /mantenimientos: expected 403, got ${res.status}`);
  });
});
