// Trazabilidad del plan de pruebas del Entregable I.
// Cada prueba corresponde a un caso CP-xx-nnn del archivo del plan.
// Los casos cuyo criterio es exclusivamente visual se marcan como omitidos
// con el motivo, para no dar por verificada una revisión que no se hizo.
import { startTestServer, stopTestServer } from './_server.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

let server;
let ipSeq = 0;
let seq = 0;
const RUN = Date.now().toString(36);
const cookies = {};

// Cada acceso usa una IP distinta para no consumir el límite de intentos.
function nextIp() {
  ipSeq += 1;
  return `10.88.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

function uniq(prefijo) {
  seq += 1;
  return `${prefijo}-${RUN}-${seq}`;
}

async function login(usuario, password, ip = nextIp()) {
  const res = await server.fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ usuario, password })
  });
  const setCookie = res.headers.get('set-cookie') || '';
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data, cookie: setCookie.split(';')[0], setCookie };
}

async function api(path, method, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return server.fetch(path, opts);
}

const textoMinusculas = (res) => JSON.stringify(res).toLowerCase();

// El rol "administrador" guarda su cookie bajo la clave corta "admin".
const cookieDe = (rol) => cookies[rol === 'administrador' ? 'admin' : rol];

before(async () => {
  server = await startTestServer();
  cookies.admin = (await login('admin', 'admin123')).cookie;
  cookies.supervisor = (await login('carlos', 'carlos123')).cookie;
  cookies.operario = (await login('maria', 'maria123')).cookie;
  cookies.tecnico = (await login('juan', 'juan123')).cookie;
  assert.ok(cookies.admin, 'QA requiere el usuario admin');
});

after(async () => {
  await stopTestServer();
});

async function crearImpresora(cookie, extra = {}) {
  const res = await api('/impresoras', 'POST', cookie, {
    nombre: uniq('QA-PLAN-IMP'),
    modelo: 'Modelo QA',
    ubicacion: 'Laboratorio QA',
    estado: 'activa',
    contador_actual: 0,
    ...extra
  });
  return { res, cuerpo: await res.json() };
}

async function crearSuministro(cookie, extra = {}) {
  const res = await api('/suministros', 'POST', cookie, {
    nombre: uniq('QA Suministro'),
    tipo: 'toner',
    cantidad: 10,
    stock_minimo: 3,
    stock_maximo: 30,
    codigo: uniq('QA-CODE'),
    proveedor: 'Proveedor QA',
    fecha_ingreso: '2021-03-01',
    ...extra
  });
  let cuerpo = null;
  try {
    cuerpo = await res.json();
  } catch {
    cuerpo = null;
  }
  return { res, cuerpo };
}

async function buscarImpresora(cookie, nombre) {
  const res = await api('/impresoras', 'GET', cookie);
  assert.strictEqual(res.status, 200);
  const lista = await res.json();
  return lista.find((i) => i.nombre === nombre);
}

// --- HU01: INICIO DE SESIÓN Y ACCESO ---

describe('HU01 Inicio de sesión y acceso', () => {
  test('CP-01-001 inicio de sesión correcto devuelve identidad y rol', async () => {
    const vacio = await login('', '');
    assert.strictEqual(vacio.res.status, 400, 'Sin credenciales debe rechazarse');

    const { res, data, cookie } = await login('admin', 'admin123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.rol, 'administrador');

    const sesion = await api('/sesion', 'GET', cookie);
    assert.strictEqual(sesion.status, 200);
    const cuerpo = await sesion.json();
    assert.strictEqual(cuerpo.rol, 'administrador');
    assert.strictEqual(cuerpo.usuario, 'admin');
    assert.strictEqual(cuerpo.password, undefined, 'No debe exponer la contraseña');
    assert.strictEqual(cuerpo.password_hash, undefined);
  });

  test('CP-01-002 credenciales inválidas se rechazan con mensaje genérico', async () => {
    const inexistente = await login('no-existe-qa', 'Cualquiera123');
    assert.strictEqual(inexistente.res.status, 401);
    assert.match(inexistente.data.error, /incorrectos/i);
    assert.ok(!/no existe|inexistente/i.test(inexistente.data.error));

    const malaClave = await login('admin', 'clave-equivocada');
    assert.strictEqual(malaClave.res.status, 401);

    const protegido = await api('/impresoras', 'GET', '');
    assert.strictEqual(protegido.status, 401, 'Sin sesión no debe devolver datos');
    const cuerpo = await protegido.json();
    assert.ok(!Array.isArray(cuerpo));
  });

  test('CP-01-003 cada rol conserva sus permisos en el servidor', async () => {
    const intento = { nombre: 'QA Plan', usuario: uniq('qa-plan'), password: 'QaPlan1234Aa', rol: 'operario' };
    for (const rol of ['operario', 'tecnico']) {
      const res = await api('/usuarios', 'POST', cookies[rol], intento);
      assert.strictEqual(res.status, 403, `${rol} no debe crear usuarios`);
    }
    assert.strictEqual((await api('/reportes/consumo-mensual', 'GET', cookies.operario)).status, 403);
    assert.strictEqual((await api('/reportes/consumo-mensual', 'GET', cookies.tecnico)).status, 403);
    assert.strictEqual((await api('/mantenimientos', 'GET', cookies.operario)).status, 403);
    assert.strictEqual((await api('/suministros', 'GET', cookies.tecnico)).status, 403);
    assert.strictEqual((await api('/auditoria', 'GET', cookies.supervisor)).status, 403);

    for (const rol of ['administrador', 'supervisor', 'operario', 'tecnico']) {
      const sesion = await api('/sesion', 'GET', cookieDe(rol));
      assert.strictEqual(sesion.status, 200, `Sesión de ${rol}`);
    }

    const usuarios = await (await api('/usuarios', 'GET', cookies.admin)).json();
    assert.ok(!usuarios.some((u) => u.usuario === intento.usuario), 'Ningún rol restringido creó el usuario');
  });

  test('CP-01-004 el cierre de sesión invalida el acceso', async () => {
    const { cookie } = await login('admin', 'admin123');
    assert.strictEqual((await api('/logout', 'POST', cookie)).status, 200);
    assert.strictEqual((await api('/sesion', 'GET', cookie)).status, 401);
    assert.strictEqual((await api('/impresoras', 'GET', cookie)).status, 401);
  });

  test('CP-01-005 campos vacíos y espacios no crean sesión', async () => {
    const casos = [
      {},
      { usuario: 'admin' },
      { password: 'admin123' },
      { usuario: '   ', password: 'admin123' }
    ];
    for (const cuerpo of casos) {
      const res = await api('/login', 'POST', '', cuerpo);
      assert.ok([400, 401].includes(res.status), `Cuerpo ${JSON.stringify(cuerpo)} => ${res.status}`);
      assert.ok(!(res.headers.get('set-cookie') || '').includes('sicis.sid'));
    }
  });

  test('CP-01-006 la API rechaza solicitudes sin sesión', async () => {
    const res = await api('/impresoras', 'GET', '');
    assert.strictEqual(res.status, 401);
    for (const ruta of ['/suministros', '/registros', '/dashboard/resumen', '/auditoria']) {
      assert.strictEqual((await api(ruta, 'GET', '')).status, 401, ruta);
    }
  });

  test('CP-01-007 interfaz de acceso con teclado y móvil', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-01-008 navegación y permisos no elevan privilegios', async () => {
    const sesion = await (await api('/sesion', 'GET', cookies.tecnico)).json();
    assert.strictEqual(sesion.rol, 'tecnico');
    assert.strictEqual((await api('/usuarios', 'GET', cookies.tecnico)).status, 403);
    assert.strictEqual((await api('/registros', 'GET', cookies.tecnico)).status, 403);
    assert.strictEqual((await api('/mantenimientos', 'GET', cookies.tecnico)).status, 200);
    assert.strictEqual((await api('/impresoras', 'GET', cookies.tecnico)).status, 200);
  });

  test('CP-01-009 una cuenta inactiva no puede iniciar sesión', async () => {
    const usuario = uniq('qa-inactivo');
    const creacion = await api('/usuarios', 'POST', cookies.admin, {
      nombre: 'QA Inactivo', usuario, password: 'QaInactivo123', rol: 'operario', activo: false
    });
    assert.strictEqual(creacion.status, 201);
    const inactivo = await login(usuario, 'QaInactivo123');
    assert.strictEqual(inactivo.res.status, 401, 'Cuenta inactiva debe rechazarse');
    assert.ok(!(inactivo.setCookie || '').includes('sicis.sid'));

    const activo = await login('admin', 'admin123');
    assert.strictEqual(activo.res.status, 200, 'Una cuenta activa puede reintentar');
  });
});

// --- HU02: INVENTARIO Y SUMINISTROS ---

describe('HU02 Inventario y suministros', () => {
  test('CP-02-001 consulta y actualización de un suministro', async () => {
    const { res, cuerpo } = await crearSuministro(cookies.admin);
    assert.strictEqual(res.status, 201);
    assert.ok(cuerpo.codigo && cuerpo.nombre && cuerpo.tipo);
    assert.strictEqual(Number(cuerpo.cantidad), 10);
    assert.strictEqual(Number(cuerpo.stock_minimo), 3);
    assert.strictEqual(Number(cuerpo.stock_maximo), 30);

    const nuevoNombre = uniq('Toner QA editado');
    const edicion = await api(`/suministros/${cuerpo.id}`, 'PUT', cookies.admin, {
      nombre: nuevoNombre, tipo: cuerpo.tipo, cantidad: cuerpo.cantidad,
      stock_minimo: cuerpo.stock_minimo, stock_maximo: cuerpo.stock_maximo,
      codigo: cuerpo.codigo, proveedor: cuerpo.proveedor, fecha_ingreso: '2021-03-01'
    });
    assert.strictEqual(edicion.status, 200);

    const relisto = await (await api(`/suministros/${cuerpo.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(relisto.nombre, nuevoNombre, 'El cambio debe persistir');
  });

  test('CP-02-002 cantidades no positivas se rechazan sin alterar el stock', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin, { cantidad: 10 });
    const entradaNegativa = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'entrada', cantidad: -1
    });
    assert.strictEqual(entradaNegativa.status, 400);
    const salidaCero = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'salida', cantidad: 0
    });
    assert.strictEqual(salidaCero.status, 400);

    const actual = await (await api(`/suministros/${cuerpo.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(Number(actual.cantidad), 10, 'El stock debe seguir en 10');
  });

  test('CP-02-003 movimiento sobre suministro inexistente', async () => {
    const res = await api('/suministros/999999/movimiento', 'POST', cookies.admin, {
      tipo_movimiento: 'entrada', cantidad: 1
    });
    assert.strictEqual(res.status, 404);
    assert.match((await res.json()).error, /no encontrado/i);
  });

  test('CP-02-004 entrada válida incrementa y conserva los datos del movimiento', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin, { cantidad: 10 });
    const res = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'entrada', cantidad: 5, observacion: 'Proveedor QA'
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.cantidad_actual, 15, 'Stock final 15');
    assert.strictEqual(data.movimiento.tipo_movimiento, 'entrada');
    assert.strictEqual(Number(data.movimiento.cantidad), 5);
    assert.strictEqual(data.movimiento.observacion, 'Proveedor QA');
    assert.ok(data.movimiento.fecha);
    assert.ok(data.movimiento.usuario_id);
  });

  test('CP-02-005 salida válida descuenta la existencia', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin, { cantidad: 10 });
    const res = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'salida', cantidad: 4
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.cantidad_actual, 6, 'Stock final 6');
    assert.strictEqual(data.movimiento.tipo_movimiento, 'salida');
    assert.strictEqual(Number(data.movimiento.cantidad), 4);
  });

  test('CP-02-006 salida superior a la existencia se rechaza', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin, { cantidad: 10 });
    const res = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'salida', cantidad: 11
    });
    assert.strictEqual(res.status, 400);
    const actual = await (await api(`/suministros/${cuerpo.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(Number(actual.cantidad), 10);
  });

  test('CP-02-007 búsqueda por código y nombre en la interfaz', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-02-008 entrada y salida consecutivas dejan 11 y no duplican movimientos', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin, { cantidad: 10 });
    const entrada = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'entrada', cantidad: 5
    });
    const salida = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'salida', cantidad: 4
    });
    assert.strictEqual(entrada.status, 201);
    assert.strictEqual(salida.status, 201);
    assert.strictEqual((await entrada.json()).cantidad_actual, 15);
    assert.strictEqual((await salida.json()).cantidad_actual, 11, '11 = 10 + 5 - 4');
  });

  test('CP-02-009 niveles crítico, bajo y normal en la interfaz', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-02-010 edición: duplicados, límites inválidos y rol restringido', async () => {
    const a = (await crearSuministro(cookies.admin)).cuerpo;
    const b = (await crearSuministro(cookies.admin)).cuerpo;
    const base = {
      nombre: b.nombre, tipo: b.tipo, cantidad: b.cantidad, stock_minimo: b.stock_minimo,
      stock_maximo: b.stock_maximo, codigo: b.codigo, proveedor: b.proveedor, fecha_ingreso: '2021-03-01'
    };

    const duplicado = await api(`/suministros/${b.id}`, 'PUT', cookies.admin, { ...base, codigo: a.codigo });
    assert.strictEqual(duplicado.status, 400, 'Código duplicado debe rechazarse');

    const limites = await api(`/suministros/${b.id}`, 'PUT', cookies.admin, { ...base, stock_minimo: 3, stock_maximo: 2 });
    assert.strictEqual(limites.status, 400, 'Máximo menor que mínimo debe rechazarse');

    const sinGuardar = await (await api(`/suministros/${b.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(sinGuardar.codigo, b.codigo, 'Cancelar conserva los datos');

    const tecnico = await api(`/suministros/${b.id}`, 'PUT', cookies.tecnico, base);
    assert.strictEqual(tecnico.status, 403, 'El técnico no puede editar suministros');
  });

  test('CP-02-011 eliminación: solo administrador y respuesta controlada', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin);
    assert.strictEqual((await api(`/suministros/${cuerpo.id}`, 'DELETE', cookies.supervisor)).status, 403);
    assert.strictEqual((await api(`/suministros/${cuerpo.id}`, 'DELETE', cookies.admin)).status, 204);
    assert.strictEqual((await api(`/suministros/${cuerpo.id}`, 'GET', cookies.admin)).status, 404);
    assert.strictEqual((await api('/suministros/999999', 'DELETE', cookies.admin)).status, 404);
  });

  test('CP-02-012 filtro por categoría en la interfaz', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-02-013 se respeta el stock máximo configurado', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin, { cantidad: 10, stock_minimo: 3, stock_maximo: 30 });
    const base = {
      nombre: cuerpo.nombre, tipo: cuerpo.tipo, cantidad: 10, stock_minimo: 30 - 30,
      codigo: cuerpo.codigo, proveedor: cuerpo.proveedor, fecha_ingreso: '2021-03-01'
    };
    const maximoMenor = await api(`/suministros/${cuerpo.id}`, 'PUT', cookies.admin, { ...base, stock_minimo: 3, stock_maximo: 2 });
    assert.strictEqual(maximoMenor.status, 400);

    const guardarLimites = await api(`/suministros/${cuerpo.id}`, 'PUT', cookies.admin, { ...base, stock_minimo: 3, stock_maximo: 30 });
    assert.strictEqual(guardarLimites.status, 200);
    assert.strictEqual(Number((await guardarLimites.json()).stock_maximo), 30);

    const excede = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'entrada', cantidad: 21
    });
    assert.strictEqual(excede.status, 400, 'La entrada que supera el máximo debe rechazarse');

    const justo = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'entrada', cantidad: 20
    });
    assert.strictEqual(justo.status, 201, 'Llegar exactamente al máximo es válido');
    assert.strictEqual((await justo.json()).cantidad_actual, 30);

    const unoMas = await api(`/suministros/${cuerpo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'entrada', cantidad: 1
    });
    assert.strictEqual(unoMas.status, 400);

    const actual = await (await api(`/suministros/${cuerpo.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(Number(actual.cantidad), 30, 'El stock no se modifica con entradas rechazadas');
  });

  test('CP-02-014 seleccionar una coincidencia no altera existencias', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-02-015 detalle de suministro, inexistente y rol sin acceso', async () => {
    const { cuerpo } = await crearSuministro(cookies.admin, { proveedor: 'Proveedor QA' });
    const detalle = await api(`/suministros/${cuerpo.id}`, 'GET', cookies.admin);
    assert.strictEqual(detalle.status, 200);
    const data = await detalle.json();
    assert.strictEqual(data.codigo, cuerpo.codigo);
    assert.strictEqual(data.proveedor, 'Proveedor QA');
    assert.ok(data.stock_minimo !== undefined && data.stock_maximo !== undefined);
    assert.ok(data.fecha_ingreso);

    assert.strictEqual((await api('/suministros/999999', 'GET', cookies.admin)).status, 404);
    assert.strictEqual((await api(`/suministros/${cuerpo.id}`, 'GET', cookies.tecnico)).status, 403);
  });

  test('CP-02-016 alta con proveedor, código único y rechazo de duplicados', async () => {
    const codigo = uniq('QA-NUEVO');
    const { res, cuerpo } = await crearSuministro(cookies.admin, {
      codigo, proveedor: 'Proveedor QA', cantidad: 10, stock_minimo: 3, stock_maximo: 30, fecha_ingreso: '2021-10-25'
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(cuerpo.proveedor, 'Proveedor QA');
    assert.strictEqual(cuerpo.fecha_ingreso.slice(0, 10), '2021-10-25');

    const relisto = await (await api(`/suministros/${cuerpo.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(relisto.codigo, codigo);

    const repetido = await crearSuministro(cookies.admin, { codigo, nombre: uniq('QA Duplicado') });
    assert.strictEqual(repetido.res.status, 400);

    const sinCodigo = await crearSuministro(cookies.admin, { codigo: '' });
    assert.strictEqual(sinCodigo.res.status, 400);
  });
});

// --- HU03: IMPRESORAS ---

describe('HU03 Impresoras', () => {
  test('CP-03-001 los cuatro roles consultan el listado con sus datos', async () => {
    const { cuerpo } = await crearImpresora(cookies.admin, { modelo: 'HP QA 4100' });
    for (const rol of ['administrador', 'supervisor', 'operario', 'tecnico']) {
      const res = await api('/impresoras', 'GET', cookieDe(rol));
      assert.strictEqual(res.status, 200, `${rol} debe consultar impresoras`);
      const lista = await res.json();
      const equipo = lista.find((i) => i.id === cuerpo.id);
      assert.ok(equipo, `${rol} debe ver el equipo creado`);
      assert.strictEqual(equipo.ubicacion, 'Laboratorio QA');
      assert.strictEqual(equipo.estado, 'activa');
      assert.strictEqual(Number(equipo.contador_actual), 0);
      assert.strictEqual(equipo.modelo, 'HP QA 4100');
    }
    assert.strictEqual((await api('/impresoras', 'POST', cookies.operario, {
      nombre: uniq('QA No'), ubicacion: 'QA', estado: 'activa'
    })).status, 403);
    assert.strictEqual((await api('/impresoras', 'POST', cookies.tecnico, {
      nombre: uniq('QA No'), ubicacion: 'QA', estado: 'activa'
    })).status, 403);
  });

  test('CP-03-002 el detalle corresponde al identificador solicitado', async () => {
    const { cuerpo } = await crearImpresora(cookies.admin, { modelo: 'Modelo Detalle QA' });
    const res = await api(`/impresoras/${cuerpo.id}`, 'GET', cookies.admin);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, cuerpo.id);
    assert.strictEqual(data.nombre, cuerpo.nombre);
    assert.strictEqual(data.modelo, 'Modelo Detalle QA');
    assert.strictEqual(data.ubicacion, 'Laboratorio QA');
    assert.strictEqual(data.estado, 'activa');
  });

  test('CP-03-003 supervisor y administrador crean equipos consultables', async () => {
    const nombreSup = uniq('QA-ALTA-SUP');
    const sup = await crearImpresora(cookies.supervisor, { nombre: nombreSup, modelo: '', contador_actual: 0 });
    assert.strictEqual(sup.res.status, 201);
    assert.strictEqual(sup.cuerpo.modelo, null, 'El modelo vacío es opcional');

    const recuperado = await (await api(`/impresoras/${sup.cuerpo.id}`, 'GET', cookies.supervisor)).json();
    assert.strictEqual(recuperado.nombre, nombreSup);
    assert.strictEqual(recuperado.ubicacion, 'Laboratorio QA');
    assert.strictEqual(recuperado.estado, 'activa');
    assert.strictEqual(Number(recuperado.contador_actual), 0);

    const adm = await crearImpresora(cookies.admin, { nombre: uniq('QA-ALTA-ADMIN') });
    assert.strictEqual(adm.res.status, 201);
    assert.ok(await buscarImpresora(cookies.admin, adm.cuerpo.nombre));
  });

  test('CP-03-004 campos obligatorios y contador negativo se rechazan', async () => {
    const base = { nombre: uniq('QA Req'), modelo: 'X', ubicacion: 'Lab QA', estado: 'activa', contador_actual: 0 };
    for (const campo of ['nombre', 'ubicacion', 'estado']) {
      const cuerpo = { ...base };
      delete cuerpo[campo];
      assert.strictEqual((await api('/impresoras', 'POST', cookies.admin, cuerpo)).status, 400, `Alta sin ${campo}`);
    }
    const negativo = await api('/impresoras', 'POST', cookies.admin, { ...base, contador_actual: -1 });
    assert.strictEqual(negativo.status, 400);

    const { cuerpo } = await crearImpresora(cookies.admin);
    const edicionSinNombre = await api(`/impresoras/${cuerpo.id}`, 'PUT', cookies.admin, { ...base, nombre: '  ' });
    assert.strictEqual(edicionSinNombre.status, 400);
  });

  test('CP-03-005 los roles restringidos no editan impresoras', async () => {
    const { cuerpo } = await crearImpresora(cookies.admin);
    const payload = { nombre: 'Cambio indebido', ubicacion: 'QA', estado: 'inactiva', contador_actual: 5 };
    assert.strictEqual((await api(`/impresoras/${cuerpo.id}`, 'PUT', cookies.operario, payload)).status, 403);
    assert.strictEqual((await api(`/impresoras/${cuerpo.id}`, 'PUT', cookies.tecnico, payload)).status, 403);
    const actual = await (await api(`/impresoras/${cuerpo.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(actual.nombre, cuerpo.nombre, 'Los datos permanecen sin cambios');
  });

  test('CP-03-006 estados de carga, vacío y error del listado', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-03-007 el equipo inexistente se informa de forma controlada', async () => {
    const res = await api('/impresoras/999999', 'GET', cookies.admin);
    assert.strictEqual(res.status, 404);
    assert.match((await res.json()).error, /no encontrada/i);
  });

  test('CP-03-008 la edición conserva los cambios y valida el identificador', async () => {
    const { cuerpo } = await crearImpresora(cookies.admin);
    const res = await api(`/impresoras/${cuerpo.id}`, 'PUT', cookies.supervisor, {
      nombre: cuerpo.nombre, modelo: 'X2', ubicacion: 'Laboratorio QA 2', estado: 'mantenimiento', contador_actual: 120
    });
    assert.strictEqual(res.status, 200);
    const actual = await (await api(`/impresoras/${cuerpo.id}`, 'GET', cookies.supervisor)).json();
    assert.strictEqual(actual.ubicacion, 'Laboratorio QA 2');
    assert.strictEqual(actual.estado, 'mantenimiento');
    assert.strictEqual(Number(actual.contador_actual), 120);

    const inexistente = await api('/impresoras/999999', 'PUT', cookies.admin, {
      nombre: 'X', ubicacion: 'X', estado: 'activa', contador_actual: 0
    });
    assert.strictEqual(inexistente.status, 404);
  });

  test('CP-03-009 eliminación: solo administrador y respuesta controlada', async () => {
    const { cuerpo } = await crearImpresora(cookies.admin);
    assert.strictEqual((await api(`/impresoras/${cuerpo.id}`, 'DELETE', cookies.supervisor)).status, 403);
    assert.strictEqual((await api(`/impresoras/${cuerpo.id}`, 'DELETE', cookies.admin)).status, 204);
    assert.ok(!(await buscarImpresora(cookies.admin, cuerpo.nombre)), 'Ya no aparece en el listado');
    assert.strictEqual((await api('/impresoras/999999', 'DELETE', cookies.admin)).status, 404);
  });
});

// --- HU04: MANTENIMIENTOS ---

describe('HU04 Mantenimientos', () => {
  test('CP-04-001 el técnico registra un mantenimiento completo', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const tecnicos = await (await api('/tecnicos', 'GET', cookies.admin)).json();
    const res = await api('/mantenimientos', 'POST', cookies.tecnico, {
      impresora_id: impresora.id,
      tecnico_usuario_id: tecnicos[0].id,
      fecha: '2021-10-25',
      estado: 'pendiente',
      descripcion: 'Revisión QA'
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.impresora_id, impresora.id);
    assert.strictEqual(data.tecnico_usuario_id, tecnicos[0].id);
    assert.strictEqual(data.fecha.slice(0, 10), '2021-10-25');
    assert.strictEqual(data.estado, 'pendiente');
    assert.strictEqual(data.descripcion, 'Revisión QA');

    const porId = await api(`/mantenimientos/${data.id}`, 'GET', cookies.tecnico);
    assert.strictEqual(porId.status, 200);
  });

  test('CP-04-002 sin impresora o con impresora inexistente se rechaza', async () => {
    const tecnicos = await (await api('/tecnicos', 'GET', cookies.admin)).json();
    const sinImpresora = await api('/mantenimientos', 'POST', cookies.admin, {
      tecnico_usuario_id: tecnicos[0].id, fecha: '2021-10-25', estado: 'pendiente', descripcion: 'QA'
    });
    assert.strictEqual(sinImpresora.status, 400);

    const inexistente = await api('/mantenimientos', 'POST', cookies.admin, {
      impresora_id: 999999, tecnico_usuario_id: tecnicos[0].id,
      fecha: '2021-10-25', estado: 'pendiente', descripcion: 'QA'
    });
    assert.strictEqual(inexistente.status, 400);
  });

  test('CP-04-003 datos incompletos no generan registros parciales', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const tecnicos = await (await api('/tecnicos', 'GET', cookies.admin)).json();
    const base = {
      impresora_id: impresora.id, tecnico_usuario_id: tecnicos[0].id,
      fecha: '2021-10-26', estado: 'pendiente', descripcion: 'QA'
    };
    for (const campo of ['tecnico_usuario_id', 'fecha', 'estado', 'descripcion']) {
      const cuerpo = { ...base };
      delete cuerpo[campo];
      const res = await api('/mantenimientos', 'POST', cookies.admin, cuerpo);
      assert.strictEqual(res.status, 400, `Sin ${campo} debe rechazarse`);
    }
    const fechaInvalida = await api('/mantenimientos', 'POST', cookies.admin, { ...base, fecha: '25-10-2021' });
    assert.strictEqual(fechaInvalida.status, 400, 'Fecha con formato inválido');

    const lista = await (await api('/mantenimientos', 'GET', cookies.admin)).json();
    assert.ok(!lista.some((m) => m.descripcion === 'QA' && m.impresora_id === impresora.id));
  });

  test('CP-04-004 historial por impresora incluye la solución registrada', async () => {
    const { cuerpo: imp1 } = await crearImpresora(cookies.admin);
    const { cuerpo: imp2 } = await crearImpresora(cookies.admin);
    const tecnicos = await (await api('/tecnicos', 'GET', cookies.admin)).json();
    const crear = (impresora_id, descripcion) => api('/mantenimientos', 'POST', cookies.admin, {
      impresora_id, tecnico_usuario_id: tecnicos[0].id, fecha: '2021-10-27', estado: 'pendiente', descripcion
    });
    const m1 = await (await crear(imp1.id, uniq('Intervención QA uno'))).json();
    await crear(imp2.id, uniq('Intervención QA dos'));

    const lista = await (await api('/mantenimientos', 'GET', cookies.admin)).json();
    const deImp1 = lista.filter((m) => m.impresora_id === imp1.id);
    const deImp2 = lista.filter((m) => m.impresora_id === imp2.id);
    assert.strictEqual(deImp1.length, 1);
    assert.strictEqual(deImp2.length, 1);
    assert.ok(!deImp1.some((m) => m.id === deImp2[0].id), 'Cada historial solo muestra sus intervenciones');

    const conSolucion = await api(`/mantenimientos/${m1.id}`, 'PUT', cookies.admin, {
      impresora_id: imp1.id, tecnico_usuario_id: tecnicos[0].id, fecha: '2021-10-27',
      estado: 'finalizado', descripcion: m1.descripcion, solucion: 'Solución QA'
    });
    assert.strictEqual(conSolucion.status, 200);
    const actualizado = await (await api(`/mantenimientos/${m1.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(actualizado.solucion, 'Solución QA');
    assert.strictEqual(actualizado.estado, 'finalizado');
  });

  test('CP-04-005 tres roles autorizados consultan y actualizan; operario no', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const tecnicos = await (await api('/tecnicos', 'GET', cookies.admin)).json();
    const creado = await (await api('/mantenimientos', 'POST', cookies.admin, {
      impresora_id: impresora.id, tecnico_usuario_id: tecnicos[0].id,
      fecha: '2021-10-28', estado: 'pendiente', descripcion: 'QA roles'
    })).json();

    for (const rol of ['administrador', 'supervisor', 'tecnico']) {
      assert.strictEqual((await api(`/mantenimientos/${creado.id}`, 'GET', cookieDe(rol))).status, 200, rol);
    }
    const actualizacion = await api(`/mantenimientos/${creado.id}`, 'PUT', cookies.supervisor, {
      impresora_id: impresora.id, tecnico_usuario_id: tecnicos[0].id,
      fecha: '2021-10-28', estado: 'en proceso', descripcion: 'QA roles'
    });
    assert.strictEqual(actualizacion.status, 200);

    assert.strictEqual((await api(`/mantenimientos/${creado.id}`, 'GET', cookies.operario)).status, 403);
    assert.strictEqual((await api(`/mantenimientos/${creado.id}`, 'PUT', cookies.operario, {
      impresora_id: impresora.id, tecnico_usuario_id: tecnicos[0].id,
      fecha: '2021-10-28', estado: 'finalizado', descripcion: 'QA roles'
    })).status, 403);

    const actual = await (await api(`/mantenimientos/${creado.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(actual.estado, 'en proceso', 'El operario no modificó el registro');
  });

  test('CP-04-006 el selector ofrece solo técnicos activos y los conserva', async () => {
    const usuarioActivo = uniq('qa-tec-activo');
    const usuarioInactivo = uniq('qa-tec-inactivo');
    const password = 'QaTecnico123';
    const activo = await (await api('/usuarios', 'POST', cookies.admin, {
      nombre: 'Técnico QA Activo', usuario: usuarioActivo, password, rol: 'tecnico', activo: true
    })).json();
    await api('/usuarios', 'POST', cookies.admin, {
      nombre: 'Técnico QA Inactivo', usuario: usuarioInactivo, password, rol: 'tecnico', activo: false
    });

    const lista = await (await api('/tecnicos', 'GET', cookies.admin)).json();
    assert.ok(lista.some((t) => t.id === activo.id), 'Incluye al técnico activo');
    assert.ok(!lista.some((t) => t.usuario === usuarioInactivo), 'Excluye al técnico inactivo');
    assert.ok(!lista.some((t) => t.usuario === 'maria'), 'Excluye a otros roles');

    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const creado = await api('/mantenimientos', 'POST', cookies.admin, {
      impresora_id: impresora.id, tecnico_usuario_id: activo.id,
      fecha: '2021-10-29', estado: 'pendiente', descripcion: 'QA técnico activo'
    });
    assert.strictEqual(creado.status, 201);
    assert.strictEqual((await creado.json()).tecnico_usuario_id, activo.id);
  });
});

// --- HU05: REGISTROS DIARIOS ---

describe('HU05 Registros diarios', () => {
  test('CP-05-001 registro diario válido y visible en el historial', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const res = await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-10-23',
      contador_diario: 10100, recarga_papel: 500, cambio_toner: true
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.impresora_id, impresora.id);
    assert.strictEqual(Number(data.contador_diario), 10100);
    assert.strictEqual(Number(data.recarga_papel), 500);
    assert.strictEqual(data.cambio_toner, true);

    const historial = await (await api('/registros', 'GET', cookies.operario)).json();
    const propio = historial.filter((r) => r.impresora_id === impresora.id);
    assert.strictEqual(propio.length, 1, 'El registro aparece una sola vez');
    assert.ok(propio[0].usuario_id);
  });

  test('CP-05-002 valores negativos, fecha inválida e impresora ausente se rechazan', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const base = { impresora_id: impresora.id, fecha: '2021-10-23', contador_diario: 100, recarga_papel: 10, cambio_toner: false };

    assert.strictEqual((await api('/registros', 'POST', cookies.operario, { ...base, contador_diario: -1 })).status, 400);
    assert.strictEqual((await api('/registros', 'POST', cookies.operario, { ...base, recarga_papel: -1 })).status, 400);
    assert.strictEqual((await api('/registros', 'POST', cookies.operario, { ...base, fecha: 'fecha-invalida' })).status, 400);
    assert.strictEqual((await api('/registros', 'POST', cookies.operario, { ...base, fecha: '2021-02-30' })).status, 400);
    const sinImpresora = { ...base };
    delete sinImpresora.impresora_id;
    assert.strictEqual((await api('/registros', 'POST', cookies.operario, sinImpresora)).status, 400);

    const historial = await (await api('/registros', 'GET', cookies.operario)).json();
    assert.ok(!historial.some((r) => r.impresora_id === impresora.id), 'No se guardó un registro parcial');
  });

  test('CP-05-003 los datos consultados coinciden con los ingresados', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const creado = await (await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-10-24', contador_diario: 1500, recarga_papel: 0, cambio_toner: false
    })).json();
    const historial = await (await api('/registros', 'GET', cookies.operario)).json();
    const encontrado = historial.find((r) => r.id === creado.id);
    assert.ok(encontrado);
    assert.strictEqual(encontrado.fecha.slice(0, 10), '2021-10-24');
    assert.strictEqual(encontrado.impresora_nombre, impresora.nombre);
    assert.strictEqual(Number(encontrado.contador_diario), 1500);
    assert.ok(encontrado.usuario_nombre);
  });

  test('CP-05-004 la suma mensual del conjunto QA es 750 hojas y 1 cambio de tóner', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-05-04', contador_diario: 200, recarga_papel: 500, cambio_toner: true
    });
    await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-05-05', contador_diario: 400, recarga_papel: 250, cambio_toner: false
    });

    const consumo = await (await api('/reportes/consumo-mensual?periodo=2021-05', 'GET', cookies.admin)).json();
    const fila = consumo.find((c) => c.impresora === impresora.nombre);
    assert.strictEqual(Number(fila.papel_total), 750);

    const toner = await (await api('/reportes/toner?periodo=2021-05', 'GET', cookies.admin)).json();
    const filaToner = toner.find((c) => c.impresora === impresora.nombre);
    assert.strictEqual(Number(filaToner.cambios_toner), 1);
  });

  test('CP-05-005 no se admite un segundo registro del mismo equipo y fecha', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const base = { impresora_id: impresora.id, fecha: '2021-10-23', contador_diario: 100, recarga_papel: 0, cambio_toner: false };
    assert.strictEqual((await api('/registros', 'POST', cookies.operario, base)).status, 201);
    const duplicado = await api('/registros', 'POST', cookies.operario, { ...base, contador_diario: 200 });
    assert.strictEqual(duplicado.status, 400);
    const historial = await (await api('/registros', 'GET', cookies.operario)).json();
    assert.strictEqual(historial.filter((r) => r.impresora_id === impresora.id).length, 1);
  });

  test('CP-05-006 la recarga y el técnico informado se conservan y suman al reporte', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-06-01', contador_diario: 10100,
      recarga_papel: 500, cambio_toner: true, tecnico_recarga: 'Técnico QA'
    });
    const res = await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-06-02', contador_diario: 10300,
      recarga_papel: 250, cambio_toner: false, tecnico_recarga: 'Técnico QA'
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.tecnico_recarga, 'Técnico QA');
    assert.strictEqual(Number(data.recarga_papel), 250);

    const historial = await (await api('/registros', 'GET', cookies.supervisor)).json();
    const propios = historial.filter((r) => r.impresora_id === impresora.id);
    assert.strictEqual(propios.length, 2);
    assert.ok(propios.every((r) => r.tecnico_recarga === 'Técnico QA'));

    const consumo = await (await api('/reportes/consumo-mensual?periodo=2021-06', 'GET', cookies.supervisor)).json();
    assert.strictEqual(Number(consumo.find((c) => c.impresora === impresora.nombre).papel_total), 750);
  });

  test('CP-05-007 el cambio de tóner se guarda de forma explícita', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const conCambio = await (await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-07-01', contador_diario: 100, recarga_papel: 0, cambio_toner: true
    })).json();
    const sinCambio = await (await api('/registros', 'POST', cookies.operario, {
      impresora_id: impresora.id, fecha: '2021-07-02', contador_diario: 200, recarga_papel: 0, cambio_toner: false
    })).json();
    assert.strictEqual(conCambio.cambio_toner, true);
    assert.strictEqual(sinCambio.cambio_toner, false);

    const historial = await (await api('/registros', 'GET', cookies.supervisor)).json();
    const releido = historial.find((r) => r.id === conCambio.id);
    assert.strictEqual(releido.cambio_toner, true);

    const toner = await (await api('/reportes/toner?periodo=2021-07', 'GET', cookies.supervisor)).json();
    assert.strictEqual(Number(toner.find((t) => t.impresora === impresora.nombre).cambios_toner), 1);
  });
});

// --- HU06: REPORTES ---

describe('HU06 Reportes', () => {
  test('CP-06-001 el reporte usa solo el período solicitado', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    await api('/registros', 'POST', cookies.admin, {
      impresora_id: impresora.id, fecha: '2021-01-15', contador_diario: 100, recarga_papel: 100, cambio_toner: false
    });
    await api('/registros', 'POST', cookies.admin, {
      impresora_id: impresora.id, fecha: '2021-09-30', contador_diario: 900, recarga_papel: 900, cambio_toner: true
    });

    for (const rol of ['administrador', 'supervisor']) {
      const res = await api('/reportes/consumo-mensual?periodo=2021-01', 'GET', cookieDe(rol));
      assert.strictEqual(res.status, 200, rol);
      const fila = (await res.json()).find((c) => c.impresora === impresora.nombre);
      assert.strictEqual(Number(fila.papel_total), 100, 'Excluye el registro de septiembre');
    }
  });

  test('CP-06-002 tabla y totales coinciden con los registros del período', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    await api('/registros', 'POST', cookies.admin, {
      impresora_id: impresora.id, fecha: '2021-08-01', contador_diario: 300, recarga_papel: 400, cambio_toner: true
    });
    await api('/registros', 'POST', cookies.admin, {
      impresora_id: impresora.id, fecha: '2021-08-02', contador_diario: 700, recarga_papel: 350, cambio_toner: false
    });

    const consumo = await (await api('/reportes/consumo-mensual?periodo=2021-08', 'GET', cookies.admin)).json();
    const fila = consumo.find((c) => c.impresora === impresora.nombre);
    assert.strictEqual(Number(fila.papel_total), 750);
    assert.strictEqual(Number(fila.contador_minimo), 300);
    assert.strictEqual(Number(fila.contador_maximo), 700);

    const toner = await (await api('/reportes/toner?periodo=2021-08', 'GET', cookies.admin)).json();
    assert.strictEqual(Number(toner.find((t) => t.impresora === impresora.nombre).cambios_toner), 1);
  });

  test('CP-06-003 un período sin operaciones no inventa datos', async () => {
    const consumo = await (await api('/reportes/consumo-mensual?periodo=1999-01', 'GET', cookies.admin)).json();
    assert.ok(Array.isArray(consumo));
    assert.ok(consumo.every((c) => Number(c.papel_total) === 0), 'Sin operaciones no hay papel consumido');
    const toner = await (await api('/reportes/toner?periodo=1999-01', 'GET', cookies.admin)).json();
    assert.ok(toner.every((t) => Number(t.cambios_toner) === 0));
  });

  test('CP-06-004 operario y técnico no acceden a reportes', async () => {
    for (const rol of ['operario', 'tecnico']) {
      for (const ruta of ['/reportes/consumo-mensual?periodo=2021-08', '/reportes/toner?periodo=2021-08', '/reportes/proyeccion']) {
        const res = await api(ruta, 'GET', cookies[rol]);
        assert.strictEqual(res.status, 403, `${rol} en ${ruta}`);
        assert.ok(!Array.isArray(await res.json().catch(() => ({}))));
      }
    }
  });

  test('CP-06-005 períodos inválidos se rechazan', async () => {
    for (const periodo of ['2026-13', 'abc', '2026-1']) {
      const res = await api(`/reportes/consumo-mensual?periodo=${encodeURIComponent(periodo)}`, 'GET', cookies.admin);
      assert.strictEqual(res.status, 400, `Período ${periodo}`);
      assert.match((await res.json()).error, /inválido/i);
    }
    assert.strictEqual((await api('/reportes/consumo-mensual?periodo=2021-08', 'GET', cookies.admin)).status, 200);
  });

  test('CP-06-006 lecturas por período sin mezclar meses', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    await api('/registros', 'POST', cookies.admin, {
      impresora_id: impresora.id, fecha: '2021-03-05', contador_diario: 10100, recarga_papel: 0, cambio_toner: false
    });
    await api('/registros', 'POST', cookies.admin, {
      impresora_id: impresora.id, fecha: '2021-03-06', contador_diario: 10300, recarga_papel: 0, cambio_toner: false
    });
    await api('/registros', 'POST', cookies.admin, {
      impresora_id: impresora.id, fecha: '2021-09-30', contador_diario: 10000, recarga_papel: 0, cambio_toner: false
    });

    const consumo = await (await api('/reportes/consumo-mensual?periodo=2021-03', 'GET', cookies.supervisor)).json();
    const fila = consumo.find((c) => c.impresora === impresora.nombre);
    assert.strictEqual(Number(fila.contador_minimo), 10100, 'No mezcla la lectura de septiembre');
    assert.strictEqual(Number(fila.contador_maximo), 10300);

    assert.strictEqual((await api('/reportes/consumo-mensual?periodo=2021-09', 'GET', cookies.tecnico)).status, 403);
  });

  test('CP-06-007 proyección con y sin consumo histórico', async () => {
    const { cuerpo: conConsumo } = await crearSuministro(cookies.admin, { cantidad: 40, stock_minimo: 3, stock_maximo: 30 });
    await api(`/suministros/${conConsumo.id}/movimiento`, 'POST', cookies.admin, {
      tipo_movimiento: 'salida', cantidad: 30, observacion: 'Consumo QA'
    });
    const { cuerpo: sinConsumo } = await crearSuministro(cookies.admin, { cantidad: 5, stock_minimo: 1, stock_maximo: 20 });

    const proyeccion = await (await api('/reportes/proyeccion', 'GET', cookies.supervisor)).json();
    const fila = proyeccion.find((p) => p.id === conConsumo.id);
    assert.strictEqual(Number(fila.consumo_30_dias), 30);
    assert.strictEqual(Number(fila.dias_restantes), 10, 'Cobertura de 10 días');
    assert.strictEqual(Number(fila.pedido_sugerido), 20, 'Pedido sugerido 30 - 10');
    assert.strictEqual(fila.requiere_pedido, true);

    const vacia = proyeccion.find((p) => p.id === sinConsumo.id);
    assert.strictEqual(Number(vacia.consumo_30_dias), 0);
    assert.strictEqual(vacia.dias_restantes, null, 'Sin consumo no hay estimación');
    assert.strictEqual(Number(vacia.pedido_sugerido), 0);
    assert.strictEqual(vacia.requiere_pedido, false);
  });

  test('CP-06-008 vistas, etiquetas y adaptación de reportes', { skip: 'requiere revisión visual en navegador' }, () => {});
});

// --- HU07: INTERFAZ Y ACCESIBILIDAD ---

describe('HU07 Interfaz y accesibilidad', () => {
  test('CP-07-001 los módulos visibles corresponden al rol', { skip: 'requiere revisión visual en navegador' }, () => {});
  test('CP-07-002 adaptación a escritorio, tableta y móvil', { skip: 'requiere revisión visual en navegador' }, () => {});
  test('CP-07-003 estados de carga, vacío y error', { skip: 'requiere revisión visual en navegador' }, () => {});
  test('CP-07-004 mensajes de validación en formularios', { skip: 'requiere revisión visual en navegador' }, () => {});
  test('CP-07-006 reducción de movimiento y alternativa estática', { skip: 'requiere revisión visual en navegador' }, () => {});
  test('CP-07-007 filtros de alertas y enlace al origen', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-07-005 los indicadores del dashboard corresponden a los datos del sistema', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin, { estado: 'activa' });
    const { cuerpo: suministroBajo } = await crearSuministro(cookies.admin, { cantidad: 1, stock_minimo: 5 });
    const { cuerpo: suministroAlto } = await crearSuministro(cookies.admin, { cantidad: 99, stock_minimo: 1 });

    const resumen = await (await api('/dashboard/resumen', 'GET', cookies.admin)).json();
    assert.ok(Number(resumen.impresoras_activas) >= 1);
    assert.ok(Number(resumen.suministros_bajos) >= 1);
    assert.ok(Array.isArray(resumen.alertas));

    const impresoras = await (await api('/impresoras', 'GET', cookies.admin)).json();
    const activas = impresoras.filter((i) => i.estado === 'activa').length;
    assert.strictEqual(Number(resumen.impresoras_activas), activas, 'El indicador coincide con el listado');

    const suministros = await (await api('/suministros', 'GET', cookies.admin)).json();
    const bajos = suministros.filter((s) => Number(s.cantidad) <= Number(s.stock_minimo)).length;
    assert.strictEqual(Number(resumen.suministros_bajos), bajos, 'Los suministros bajo mínimo coinciden');
    assert.ok(suministros.some((s) => s.id === suministroBajo.id));
    assert.ok(suministros.some((s) => s.id === suministroAlto.id));
    assert.ok(impresora.id);
  });
});

// --- HU08: MIGRACIÓN Y DESPLIEGUE ---

describe('HU08 Migración y despliegue', () => {
  test('CP-08-001 /health informa aplicación y base de datos', async () => {
    const res = await server.get('/health');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.database, 'connected');
  });

  test('CP-08-002 cada rol mantiene módulos y restricciones', async () => {
    for (const rol of ['administrador', 'supervisor', 'operario', 'tecnico']) {
      const cookie = cookieDe(rol);
      const sesion = await api('/sesion', 'GET', cookie);
      assert.strictEqual(sesion.status, 200, `${rol} mantiene la sesión`);
      assert.strictEqual((await api('/impresoras', 'GET', cookie)).status, 200, `${rol} consulta impresoras`);
      assert.strictEqual((await api('/usuarios', 'GET', cookie)).status, rol === 'administrador' ? 200 : 403);
    }
  });

  test('CP-08-003 los datos persisten fuera de la sesión del navegador', async () => {
    const nombre = uniq('QA-PERSISTENCIA');
    const creada = await (await api('/impresoras', 'POST', cookies.admin, {
      nombre, ubicacion: 'QA Persistencia', estado: 'activa', contador_actual: 7
    })).json();
    assert.strictEqual((await api('/logout', 'POST', cookies.admin)).status, 200);

    const nuevoAcceso = await login('admin', 'admin123');
    const recuperada = await api(`/impresoras/${creada.id}`, 'GET', nuevoAcceso.cookie);
    assert.strictEqual(recuperada.status, 200);
    const data = await recuperada.json();
    assert.strictEqual(data.nombre, nombre);
    assert.strictEqual(Number(data.contador_actual), 7);
    cookies.admin = nuevoAcceso.cookie;
  });

  test('CP-08-004 comportamiento ante fallo de comunicación', { skip: 'requiere revisión visual en navegador' }, () => {});

  test('CP-08-005 configuración de despliegue y salud verificables', async () => {
    // La configuración declarada del servicio se contrasta con el repositorio real.
    const { readFile } = await import('node:fs/promises');
    const config = await readFile(new URL('../../render.yaml', import.meta.url), 'utf8');
    assert.match(config, /branch:\s*main/, 'Render despliega la rama main');
    assert.match(config, /healthCheckPath:\s*\/health/, 'El chequeo de salud apunta a /health');
    assert.match(config, /autoDeploy:\s*true/, 'El despliegue automático está declarado');
    assert.match(config, /dockerfilePath:\s*\.\/Dockerfile/);

    const dockerfile = await readFile(new URL('../../Dockerfile', import.meta.url), 'utf8');
    assert.match(dockerfile, /npm run init-db && node migrate\.js && node index\.js/, 'Arranque documentado');

    const health = await server.get('/health');
    assert.strictEqual(health.status, 200);
  });
});

// --- HU09: SEGURIDAD ---

describe('HU09 Seguridad', () => {
  test('CP-09-001 una operación administrativa sin permiso no se ejecuta', async () => {
    const usuario = uniq('qa-seg');
    const res = await api('/usuarios', 'POST', cookies.operario, {
      nombre: 'QA Seguridad', usuario, password: 'QaSeguridad123', rol: 'administrador'
    });
    assert.strictEqual(res.status, 403);
    const usuarios = await (await api('/usuarios', 'GET', cookies.admin)).json();
    assert.ok(!usuarios.some((u) => u.usuario === usuario));
  });

  test('CP-09-002 una petición administrativa replicada por un rol restringido no cambia datos', async () => {
    const { cuerpo: impresora } = await crearImpresora(cookies.admin);
    const payloadValido = {
      nombre: 'QA Alterado', modelo: 'X', ubicacion: 'QA', estado: 'inactiva', contador_actual: 999
    };
    assert.strictEqual((await api(`/impresoras/${impresora.id}`, 'PUT', cookies.admin, payloadValido)).status, 200);

    const { cuerpo: otra } = await crearImpresora(cookies.admin);
    const replicada = await api(`/impresoras/${otra.id}`, 'PUT', cookies.operario, payloadValido);
    assert.strictEqual(replicada.status, 403);
    const actual = await (await api(`/impresoras/${otra.id}`, 'GET', cookies.admin)).json();
    assert.strictEqual(actual.nombre, otra.nombre, 'El cuerpo válido no basta para operar');
  });

  test('CP-09-003 tras cerrar sesión no se accede a rutas privadas', async () => {
    const { cookie } = await login('supervisor', 'carlos123');
    await api('/logout', 'POST', cookie);
    for (const ruta of ['/impresoras', '/suministros', '/registros', '/dashboard/resumen', '/reportes/consumo-mensual']) {
      assert.strictEqual((await api(ruta, 'GET', cookie)).status, 401, ruta);
    }
  });

  test('CP-09-004 los errores no exponen datos internos', async () => {
    const credencial = await login('admin', 'incorrecta');
    assert.strictEqual(credencial.res.status, 401);
    const texto = textoMinusculas(credencial.data);
    assert.ok(!texto.includes('$2a$') && !texto.includes('$2b$'), 'No expone el hash');
    assert.ok(!texto.includes('select ') && !texto.includes('postgres'), 'No expone SQL');

    const inexistente = await api('/impresoras/999999', 'GET', cookies.admin);
    const cuerpo = await inexistente.json();
    assert.deepStrictEqual(Object.keys(cuerpo), ['error'], 'Solo devuelve el mensaje controlado');
    assert.ok(!/at\s+\w+.*:\d+/.test(JSON.stringify(cuerpo)), 'No expone trazas');
  });

  test('CP-09-005 contraseñas con bcrypt, roles válidos y privilegios del servidor', async () => {
    const usuario = uniq('qa-bcrypt');
    const password = 'QaBcrypt1234';
    const creacion = await api('/usuarios', 'POST', cookies.admin, {
      nombre: 'QA Bcrypt', usuario, password, rol: 'tecnico', activo: true
    });
    assert.strictEqual(creacion.status, 201);
    const creado = await creacion.json();
    assert.strictEqual(creado.password, undefined, 'No devuelve la contraseña ni el hash');

    const cliente = new pg.Client({
      host: process.env.SICIS_QA_DB_HOST || '127.0.0.1',
      port: Number(process.env.SICIS_QA_DB_PORT || 5432),
      database: process.env.SICIS_QA_DB_NAME || 'sicis_qa',
      user: process.env.SICIS_QA_DB_USER || 'sicisqa',
      password: process.env.SICIS_QA_DB_PASSWORD || 'sicisqa'
    });
    await cliente.connect();
    try {
      const { rows } = await cliente.query('SELECT password FROM usuarios WHERE id = $1', [creado.id]);
      assert.ok(rows[0].password.startsWith('$2'), 'La contraseña se almacena con bcrypt');
      assert.notStrictEqual(rows[0].password, password);
    } finally {
      await cliente.end();
    }

    const rolInvalido = await api('/usuarios', 'POST', cookies.admin, {
      nombre: 'QA Rol', usuario: uniq('qa-rol'), password: 'QaRol12345', rol: 'superusuario'
    });
    assert.strictEqual(rolInvalido.status, 400);

    const sesion = await login(usuario, password);
    assert.strictEqual(sesion.res.status, 200);
    assert.strictEqual(sesion.data.rol, 'tecnico', 'El servidor usa el rol persistido');

    const intento = await api('/usuarios', 'POST', sesion.cookie, {
      nombre: 'QA Escalada', usuario: uniq('qa-escalada'), password: 'QaEscalada123', rol: 'administrador'
    });
    assert.strictEqual(intento.status, 403, 'El cliente no decide sus privilegios');
  });

  test('CP-09-006 límite de intentos, cookie de sesión y validación en servidor', async () => {
    const ip = '10.199.199.199';
    for (let intento = 1; intento <= 5; intento += 1) {
      const res = await login('admin', 'clave-equivocada', ip);
      assert.strictEqual(res.res.status, 401, `Intento ${intento}`);
    }
    const bloqueado = await login('admin', 'admin123', ip);
    assert.strictEqual(bloqueado.res.status, 429, 'El sexto intento queda limitado');
    assert.match(bloqueado.data.error, /demasiados intentos/i);

    const { setCookie } = await login('admin', 'admin123');
    assert.match(setCookie, /HttpOnly/i, 'La cookie es HttpOnly');
    assert.match(setCookie, /SameSite=Lax/i, 'La cookie declara SameSite');

    assert.strictEqual((await api('/impresoras', 'GET', '')).status, 401);
    assert.strictEqual((await api('/impresoras', 'GET', cookies.operario)).status, 200);
    assert.strictEqual((await api('/usuarios', 'GET', cookies.operario)).status, 403);
  });
});

// --- HU10: AUDITORÍA ---

describe('HU10 Auditoría', () => {
  const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  test('CP-10-001 la bitácora conserva usuario, acción, módulo, detalle y fecha', async () => {
    const nombre = uniq('QA-AUDIT');
    const creada = await (await api('/impresoras', 'POST', cookies.admin, {
      nombre, ubicacion: 'QA Auditoría', estado: 'activa', contador_actual: 0
    })).json();
    await esperar(400);

    const sesion = await (await api('/sesion', 'GET', cookies.admin)).json();
    const eventos = await (await api('/auditoria?modulo=impresoras&limit=50', 'GET', cookies.admin)).json();
    const evento = eventos.find((e) => e.detalle && e.detalle.nombre === nombre);
    assert.ok(evento, 'El evento de creación debe existir');
    assert.strictEqual(evento.usuario, 'admin');
    assert.match(evento.accion, /POST \/impresoras/);
    assert.strictEqual(evento.modulo, 'impresoras');
    assert.ok(evento.fecha);
    assert.strictEqual(creada.id, evento.detalle.id);
    assert.ok(sesion.usuario_id);
  });

  test('CP-10-002 el evento identifica el registro y el usuario autenticado', async () => {
    const nombre = uniq('QA-AUDIT-2');
    const creada = await (await api('/impresoras', 'POST', cookies.admin, {
      nombre, ubicacion: 'QA Auditoría 2', estado: 'activa', contador_actual: 0
    })).json();
    await esperar(400);

    const sesion = await (await api('/sesion', 'GET', cookies.admin)).json();
    const eventos = await (await api(`/auditoria?modulo=impresoras&desde=2020-01-01&limit=200`, 'GET', cookies.admin)).json();
    const evento = eventos.find((e) => e.detalle && e.detalle.id === creada.id);
    assert.ok(evento, 'El evento debe corresponder a la impresora creada');
    assert.strictEqual(evento.detalle.nombre, nombre);
    assert.strictEqual(evento.usuario, sesion.usuario);
    assert.strictEqual(evento.detalle.id, creada.id);
    assert.match(evento.accion, /POST \/impresoras/);
  });

  test('CP-10-003 la bitácora no se puede modificar ni eliminar', async () => {
    const eventos = await (await api('/auditoria?limit=1', 'GET', cookies.admin)).json();
    assert.ok(eventos.length > 0, 'QA requiere al menos un evento');
    const evento = eventos[0];

    const put = await api(`/auditoria/${evento.id}`, 'PUT', cookies.operario, { detalle: 'alterado' });
    assert.ok([403, 404, 405].includes(put.status), `PUT inesperado: ${put.status}`);
    const del = await api(`/auditoria/${evento.id}`, 'DELETE', cookies.operario);
    assert.ok([403, 404, 405].includes(del.status), `DELETE inesperado: ${del.status}`);

    const despues = await (await api('/auditoria?limit=200', 'GET', cookies.admin)).json();
    const mismo = despues.find((e) => e.id === evento.id);
    assert.deepStrictEqual(mismo.detalle, evento.detalle, 'El evento conserva sus datos');
  });

  test('CP-10-004 solo el administrador consulta la bitácora', async () => {
    for (const rol of ['supervisor', 'operario', 'tecnico']) {
      const res = await api('/auditoria', 'GET', cookies[rol]);
      assert.strictEqual(res.status, 403, rol);
      assert.ok(!Array.isArray(await res.json().catch(() => ({}))));
      assert.strictEqual((await api('/auditoria/exportar/csv', 'GET', cookies[rol])).status, 403, `${rol} CSV`);
    }
    assert.strictEqual((await api('/auditoria', 'GET', cookies.admin)).status, 200);
  });

  test('CP-10-005 filtros y exportación CSV corresponden al conjunto filtrado', async () => {
    const nombre = uniq('QA-AUDIT-CSV');
    await api('/impresoras', 'POST', cookies.admin, {
      nombre, ubicacion: 'QA CSV', estado: 'activa', contador_actual: 0
    });
    await esperar(400);

    const filtrado = await (await api(
      '/auditoria?modulo=impresoras&desde=2020-01-01&hasta=2099-12-31&limit=1000', 'GET', cookies.admin
    )).json();
    assert.ok(filtrado.length > 0);
    assert.ok(filtrado.every((e) => e.modulo === 'impresoras'), 'El filtro limita el módulo');

    const csv = await api('/auditoria/exportar/csv?modulo=impresoras&desde=2020-01-01&hasta=2099-12-31', 'GET', cookies.admin);
    assert.strictEqual(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const texto = await csv.text();
    const lineas = texto.trim().split('\n');
    assert.match(lineas[0], /Fecha.*Usuario.*Acción.*Módulo/);
    assert.strictEqual(lineas.length - 1, filtrado.length, 'El CSV tiene las filas del conjunto filtrado');
    assert.ok(texto.includes(nombre), 'El CSV incluye el registro de QA');
  });
});
