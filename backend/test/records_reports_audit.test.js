// Tests de registros diarios, reportes y auditoría
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

async function getPrinterId(adminCookie) {
  assert.ok(adminCookie);
  return printerId;
}

describe('Registros diarios, reportes y auditoría', () => {
  before(async () => {
    server = await startTestServer();
    const { cookie } = await login('admin', 'admin123', '10.0.20.100');
    const res = await authFetch('/impresoras', 'POST', cookie, {
      nombre: `QA Registros ${Date.now()}`,
      modelo: 'QA', ubicacion: 'QA Lab', estado: 'activa', contador_actual: 0
    });
    assert.strictEqual(res.status, 201);
    printerId = (await res.json()).id;
  });

  after(async () => {
    await stopTestServer();
  });

  test('POST /registros válido => 201 (operario)', async () => {
    const { cookie: admCookie } = await login('admin', 'admin123', '10.0.20.1');
    const impresoraId = await getPrinterId(admCookie);
    const { cookie } = await login('maria', 'maria123', '10.0.20.1');
    const res = await authFetch('/registros', 'POST', cookie, {
      impresora_id: impresoraId,
      fecha: '2025-06-01',
      contador_diario: 100,
      recarga_papel: 50,
      cambio_toner: false,
      tecnico_recarga: 'Juan Pérez'
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.id);
    assert.strictEqual(body.contador_diario, 100);
    assert.strictEqual(body.cambio_toner, false);
  });

  test('Registro duplicado misma impresora+fecha => 400', async () => {
    const { cookie: admCookie } = await login('admin', 'admin123', '10.0.20.2');
    const impresoraId = await getPrinterId(admCookie);
    const { cookie } = await login('maria', 'maria123', '10.0.20.2');
    const res = await authFetch('/registros', 'POST', cookie, {
      impresora_id: impresoraId,
      fecha: '2025-06-01',
      contador_diario: 101,
      recarga_papel: 10,
      cambio_toner: false
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('contador_diario negativo => 400', async () => {
    const { cookie: admCookie } = await login('admin', 'admin123', '10.0.20.3');
    const impresoraId = await getPrinterId(admCookie);
    const { cookie } = await login('maria', 'maria123', '10.0.20.3');
    const res = await authFetch('/registros', 'POST', cookie, {
      impresora_id: impresoraId,
      fecha: '2025-06-02',
      contador_diario: -5,
      recarga_papel: 0,
      cambio_toner: false
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('cambio_toner ausente => 400', async () => {
    const { cookie: admCookie } = await login('admin', 'admin123', '10.0.20.4');
    const impresoraId = await getPrinterId(admCookie);
    const { cookie } = await login('maria', 'maria123', '10.0.20.4');
    const res = await authFetch('/registros', 'POST', cookie, {
      impresora_id: impresoraId,
      fecha: '2025-06-03',
      contador_diario: 50,
      recarga_papel: 0
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('Impresora inexistente => 400', async () => {
    const { cookie } = await login('maria', 'maria123', '10.0.20.5');
    const res = await authFetch('/registros', 'POST', cookie, {
      impresora_id: 99999,
      fecha: '2025-06-04',
      contador_diario: 10,
      recarga_papel: 0,
      cambio_toner: false
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  test('GET /registros con rol operario => 200; con rol técnico => 403', async () => {
    const { cookie: opCookie } = await login('maria', 'maria123', '10.0.20.6');
    const opRes = await authFetch('/registros', 'GET', opCookie);
    assert.strictEqual(opRes.status, 200, `Operario GET /registros: expected 200, got ${opRes.status}`);

    const { cookie: techCookie } = await login('juan', 'juan123', '10.0.20.7');
    const techRes = await authFetch('/registros', 'GET', techCookie);
    assert.strictEqual(techRes.status, 403, `Técnico GET /registros: expected 403, got ${techRes.status}`);
  });

  test('GET /reportes/consumo-mensual?periodo=AAAA-MM => 200; periodo inválido => 400', async () => {
    const { cookie } = await login('carlos', 'carlos123', '10.0.20.8');
    const okRes = await authFetch('/reportes/consumo-mensual?periodo=2025-06', 'GET', cookie);
    assert.strictEqual(okRes.status, 200, `Expected 200, got ${okRes.status}`);

    const badRes = await authFetch('/reportes/consumo-mensual?periodo=invalido', 'GET', cookie);
    assert.strictEqual(badRes.status, 400, `Expected 400, got ${badRes.status}`);
  });

  test('GET /reportes/toner y /reportes/proyeccion supervisor => 200; operario => 403', async () => {
    const { cookie: supCookie } = await login('carlos', 'carlos123', '10.0.20.9');
    const tonerRes = await authFetch('/reportes/toner?periodo=2025-06', 'GET', supCookie);
    assert.strictEqual(tonerRes.status, 200, `Supervisor GET /reportes/toner: expected 200, got ${tonerRes.status}`);

    const projRes = await authFetch('/reportes/proyeccion', 'GET', supCookie);
    assert.strictEqual(projRes.status, 200, `Supervisor GET /reportes/proyeccion: expected 200, got ${projRes.status}`);

    const { cookie: opCookie } = await login('maria', 'maria123', '10.0.20.10');
    const opToner = await authFetch('/reportes/toner', 'GET', opCookie);
    assert.strictEqual(opToner.status, 403, `Operario GET /reportes/toner: expected 403, got ${opToner.status}`);

    const opProj = await authFetch('/reportes/proyeccion', 'GET', opCookie);
    assert.strictEqual(opProj.status, 403, `Operario GET /reportes/proyeccion: expected 403, got ${opProj.status}`);
  });

  test('GET /auditoria con rol operario => 403; con administrador => 200 y filtros', async () => {
    const { cookie: opCookie } = await login('maria', 'maria123', '10.0.20.11');
    const opRes = await authFetch('/auditoria', 'GET', opCookie);
    assert.strictEqual(opRes.status, 403, `Operario GET /auditoria: expected 403, got ${opRes.status}`);

    const { cookie: admCookie } = await login('admin', 'admin123', '10.0.20.12');
    const admRes = await authFetch('/auditoria', 'GET', admCookie);
    assert.strictEqual(admRes.status, 200, `Administrador GET /auditoria: expected 200, got ${admRes.status}`);

    const filtrosRes = await authFetch('/auditoria?accion=LOGIN&desde=2025-01-01&hasta=2026-12-31&limit=10', 'GET', admCookie);
    assert.strictEqual(filtrosRes.status, 200, `GET /auditoria con filtros: expected 200, got ${filtrosRes.status}`);
  });

  test('GET /auditoria/exportar/csv con administrador => 200 CSV', async () => {
    const { cookie } = await login('admin', 'admin123', '10.0.20.13');
    const res = await authFetch('/auditoria/exportar/csv', 'GET', cookie);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/csv'), `Expected text/csv, got ${contentType}`);
  });
});
