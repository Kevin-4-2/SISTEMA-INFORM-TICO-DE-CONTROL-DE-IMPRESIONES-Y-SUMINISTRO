#!/usr/bin/env node
/**
 * Carga de datos de demostración contra un SICIS desplegado — SOLO vía API REST.
 *
 * Uso:
 *   node scripts/seed-produccion.mjs [url] [usuario] [password]
 *   node scripts/seed-produccion.mjs https://sicis.onrender.com admin admin123
 *
 * Seguro por diseño:
 *  - No ejecuta SQL directo; usa los mismos endpoints que la interfaz web
 *    (las validaciones, llaves foráneas y bitácora de auditoría quedan intactas).
 *  - Idempotente: si un registro ya existe (por nombre/código/fecha), se salta.
 *  - Los movimientos de suministros solo se agregan si el insumo no tiene
 *    consumos en los últimos 30 días (consultando el reporte de proyección).
 */

const BASE = (process.argv[2] || process.env.SICIS_URL || 'https://sicis.onrender.com').replace(/\/+$/, '');
const ADMIN_USER = process.argv[3] || process.env.SICIS_USER || 'admin';
const ADMIN_PASS = process.argv[4] || process.env.SICIS_PASS || 'admin123';

let cookie = '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, { method = 'GET', body, retries = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const setCookie = (res.headers.getSetCookie?.() || []).concat(
        res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []
      );
      if (setCookie.length) cookie = setCookie.map(c => c.split(';')[0]).join('; ');
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} en ${path}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
        err.status = res.status;
        throw err;
      }
      return json;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const retryable = !error.status || error.status === 429 || error.status >= 500;
      if (!retryable || attempt === retries) throw error;
      console.log(`    ↻ reintento ${attempt}/3 (${error.message})`);
      await sleep(2500 * attempt);
    }
  }
  throw lastError;
}

// ---------- Datos a cargar ----------

const USUARIOS = [
  { nombre: 'Rosa Medina', usuario: 'rmedina', password: 'Supervisor2026A', rol: 'supervisor', activo: true },
  { nombre: 'Luis García', usuario: 'lgarcia', password: 'Operario2026B', rol: 'operario', activo: true },
  { nombre: 'Ana Torres', usuario: 'atorres', password: 'Tecnico2026C', rol: 'tecnico', activo: true }
];

const IMPRESORAS = [
  { nombre: 'Xerox VersaLink C405 - Recursos Humanos', modelo: 'Xerox VersaLink C405', ubicacion: 'Recursos Humanos', estado: 'activa', contador_actual: 22450 },
  { nombre: 'Ricoh IM C3000 - Finanzas', modelo: 'Ricoh IM C3000', ubicacion: 'Finanzas', estado: 'activa', contador_actual: 31200 },
  { nombre: 'Brother HL-L3210CW - Sala de Juntas', modelo: 'Brother HL-L3210CW', ubicacion: 'Sala de Juntas', estado: 'activa', contador_actual: 8760 },
  { nombre: 'Epson EcoTank ET-4760 - Departamento TI', modelo: 'Epson EcoTank ET-4760', ubicacion: 'Departamento TI', estado: 'activa', contador_actual: 5670 },
  { nombre: 'Canon imageRUNNER C3226i - Comunicaciones', modelo: 'Canon imageRUNNER C3226i', ubicacion: 'Comunicaciones', estado: 'activa', contador_actual: 19320 },
  { nombre: 'HP Color LaserJet M480f - Dirección General', modelo: 'HP Color LaserJet M480f', ubicacion: 'Dirección General', estado: 'activa', contador_actual: 11280 },
  { nombre: 'Kyocera ECOSYS M3645idn - Bodega Central', modelo: 'Kyocera ECOSYS M3645idn', ubicacion: 'Bodega Central', estado: 'mantenimiento', contador_actual: 76500 },
  { nombre: 'Xerox VersaLink C7000 - Producción', modelo: 'Xerox VersaLink C7000', ubicacion: 'Área de Producción', estado: 'mantenimiento', contador_actual: 89340 },
  { nombre: 'HP LaserJet Enterprise M507 - Archivo Central', modelo: 'HP LaserJet Enterprise M507', ubicacion: 'Archivo Central', estado: 'inactiva', contador_actual: 45670 },
  { nombre: 'Lexmark MX431adn - Ventanilla Única', modelo: 'Lexmark MX431adn', ubicacion: 'Ventanilla Única', estado: 'inactiva', contador_actual: 41860 }
];

const SUMINISTROS = [
  { nombre: 'Tóner Negro HP 58A (CF258A)', tipo: 'toner', cantidad: 14, stock_minimo: 5, stock_maximo: 30, codigo: 'TON-HP-058A', proveedor: 'Distribuidora Central', fecha_ingreso: '2026-09-05' },
  { nombre: 'Tóner Negro HP 87A (CF287A)', tipo: 'toner', cantidad: 4, stock_minimo: 5, stock_maximo: 20, codigo: 'TON-HP-087A', proveedor: 'Distribuidora Central', fecha_ingreso: '2026-08-20' },
  { nombre: 'Tóner Canon 057 Negro', tipo: 'toner', cantidad: 9, stock_minimo: 4, stock_maximo: 20, codigo: 'TON-CA-057', proveedor: 'Suministros del Valle', fecha_ingreso: '2026-09-01' },
  { nombre: 'Tóner Canon 052 Negro', tipo: 'toner', cantidad: 2, stock_minimo: 3, stock_maximo: 12, codigo: 'TON-CA-052', proveedor: 'Suministros del Valle', fecha_ingreso: '2026-08-12' },
  { nombre: 'Tóner Kyocera TK-3160', tipo: 'toner', cantidad: 6, stock_minimo: 3, stock_maximo: 15, codigo: 'TON-KY-3160', proveedor: 'Insumos Ofipro', fecha_ingreso: '2026-09-03' },
  { nombre: 'Tóner Xerox 106R03530', tipo: 'toner', cantidad: 11, stock_minimo: 4, stock_maximo: 18, codigo: 'TON-XR-03530', proveedor: 'Insumos Ofipro', fecha_ingreso: '2026-09-08' },
  { nombre: 'Tóner Epson 016 Negro', tipo: 'toner', cantidad: 7, stock_minimo: 3, stock_maximo: 15, codigo: 'TON-EP-016', proveedor: 'Distribuidora Central', fecha_ingreso: '2026-08-28' },
  { nombre: 'Papel Carta A4 80g (caja x5 resmas)', tipo: 'papel', cantidad: 24, stock_minimo: 10, stock_maximo: 60, codigo: 'PAP-A4-80', proveedor: 'Papeles del Centro', fecha_ingreso: '2026-09-02' },
  { nombre: 'Papel Oficio 75g (paquete x500)', tipo: 'papel', cantidad: 8, stock_minimo: 10, stock_maximo: 40, codigo: 'PAP-OF-75', proveedor: 'Papeles del Centro', fecha_ingreso: '2026-08-15' },
  { nombre: 'Unidad de imagen Canon C3226', tipo: 'otro', cantidad: 3, stock_minimo: 2, stock_maximo: 8, codigo: 'ACC-CA-UI', proveedor: 'Servicio Técnico Yamana', fecha_ingreso: '2026-08-25' }
];

// Referencia las impresoras por nombre; se resuelven a IDs después de crearlas.
const MANTENIMIENTOS = [
  { impresora: 'Kyocera ECOSYS M3645idn - Bodega Central', tecnico: 'Ana Torres', fecha: '2026-09-12', estado: 'en proceso', descripcion: 'Cambio de rodillos de alimentación y limpieza interna del equipo', solucion: null },
  { impresora: 'Xerox VersaLink C7000 - Producción', tecnico: 'Ana Torres', fecha: '2026-09-14', estado: 'pendiente', descripcion: 'Error de fusión intermitente, requiere diagnóstico completo', solucion: null },
  { impresora: 'HP LaserJet Enterprise M507 - Archivo Central', tecnico: 'Juan Tecnico', fecha: '2026-09-08', estado: 'finalizado', descripcion: 'Reemplazo de tóner y limpieza de unidad de corona', solucion: 'Equipo operando correctamente tras el servicio' },
  { impresora: 'Lexmark MX431adn - Ventanilla Única', tecnico: 'Juan Tecnico', fecha: '2026-09-05', estado: 'finalizado', descripcion: 'Mantenimiento preventivo trimestral programado', solucion: 'Se cambiaron consumibles y se calibró la calidad de impresión' },
  { impresora: 'Epson EcoTank ET-4760 - Departamento TI', tecnico: 'Ana Torres', fecha: '2026-09-15', estado: 'pendiente', descripcion: 'Atascos de papel recurrentes en la bandeja 2', solucion: null }
];

// Movimientos: si un insumo ya tiene consumo en 30 días, se omite (idempotencia).
const MOVIMIENTOS = [
  { codigo: 'TON-HP-058A', tipo_movimiento: 'salida', cantidad: 2, observacion: 'Recarga HP Biblioteca Central' },
  { codigo: 'TON-HP-087A', tipo_movimiento: 'salida', cantidad: 1, observacion: 'Recarga HP Archivo Central' },
  { codigo: 'TON-CA-057', tipo_movimiento: 'salida', cantidad: 1, observacion: 'Recarga Canon Comunicaciones' },
  { codigo: 'TON-CA-052', tipo_movimiento: 'salida', cantidad: 1, observacion: 'Recarga Canon Atención Ciudadana' },
  { codigo: 'TON-KY-3160', tipo_movimiento: 'salida', cantidad: 2, observacion: 'Recarga Kyocera Bodega' },
  { codigo: 'TON-XR-03530', tipo_movimiento: 'salida', cantidad: 1, observacion: 'Recarga Xerox Recursos Humanos' },
  { codigo: 'TON-EP-016', tipo_movimiento: 'salida', cantidad: 1, observacion: 'Recarga Epson Departamento TI' },
  { codigo: 'PAP-A4-80', tipo_movimiento: 'salida', cantidad: 12, observacion: 'Reposición semanal de escritorios' },
  { codigo: 'PAP-OF-75', tipo_movimiento: 'salida', cantidad: 6, observacion: 'Impresión de oficios de dirección' },
  { codigo: 'PAP-A4-80', tipo_movimiento: 'entrada', cantidad: 20, observacion: 'Factura 45821 - Papeles del Centro' }
];

// ---------- Registros diarios (septiembre 2026) ----------
// Deterministas (semilla fija) para poder reproducir la misma carga.

function crearGenerador(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

function generarRegistros(impresoras) {
  const rand = crearGenerador(20260915);
  const activas = impresoras.filter(i => i.estado === 'activa');
  const finesDeSemana = new Set([5, 6, 12, 13]); // sept 2026
  const filas = [];
  activas.forEach((imp, idx) => {
    for (let dia = 1; dia <= 15; dia++) {
      const finDe = finesDeSemana.has(dia);
      const base = finDe ? 70 : 240;
      const techo = finDe ? 210 : 680;
      const contadorDiario = Math.round(base + rand() * (techo - base) * (0.8 + (idx % 3) * 0.12));
      const recarga = rand() < 0.35 ? Math.round(150 + rand() * 1050) : 0;
      const cambioToner = rand() < 0.08;
      filas.push({
        impresora_id: imp.id,
        fecha: `2026-09-${String(dia).padStart(2, '0')}`,
        contador_diario: contadorDiario,
        recarga_papel: recarga,
        cambio_toner: cambioToner,
        tecnico_recarga: cambioToner || recarga > 600 ? (rand() < 0.5 ? 'Luis García' : 'Ana Torres') : null
      });
    }
  });
  return filas;
}

// ---------- Ejecución ----------

async function pool(items, worker, concurrency = 3) {
  const cola = [...items];
  const trabajadores = Array.from({ length: Math.min(concurrency, cola.length) }, async () => {
    while (cola.length) {
      const item = cola.shift();
      await worker(item);
    }
  });
  await Promise.all(trabajadores);
}

async function main() {
  console.log(`\n=== SICIS · carga de datos vía API ===`);
  console.log(`Destino: ${BASE}\n`);

  const resLogin = await call('/login', { method: 'POST', body: { usuario: ADMIN_USER, password: ADMIN_PASS } });
  if (!resLogin?.ok) throw new Error('No se pudo iniciar sesión con las credenciales indicadas');
  console.log(`✓ Sesión iniciada como ${resLogin.nombre} (${resLogin.rol})\n`);

  let creados = { usuarios: 0, impresoras: 0, suministros: 0, mantenimientos: 0, registros: 0, movimientos: 0 };
  let saltados = 0;

  // 1) Usuarios
  console.log('👥 Usuarios…');
  const usuariosExistentes = new Set((await call('/usuarios')).map(u => u.usuario));
  for (const u of USUARIOS) {
    if (usuariosExistentes.has(u.usuario)) { console.log(`  • ${u.usuario} ya existe`); saltados++; continue; }
    await call('/usuarios', { method: 'POST', body: u });
    console.log(`  ✓ ${u.nombre} (${u.usuario}, ${u.rol})`);
    creados.usuarios++;
  }

  // 2) Impresoras
  console.log('\n🖨️  Impresoras…');
  let impresoras = await call('/impresoras');
  const nombresImpresoras = new Set(impresoras.map(i => i.nombre));
  for (const imp of IMPRESORAS) {
    if (nombresImpresoras.has(imp.nombre)) { console.log(`  • ${imp.nombre} ya existe`); saltados++; continue; }
    await call('/impresoras', { method: 'POST', body: imp });
    console.log(`  ✓ ${imp.nombre} [${imp.estado}]`);
    creados.impresoras++;
  }
  impresoras = await call('/impresoras');

  // 3) Suministros
  console.log('\n📦 Suministros…');
  const suministrosExistentes = new Set((await call('/suministros')).map(s => s.codigo));
  for (const s of SUMINISTROS) {
    if (suministrosExistentes.has(s.codigo)) { console.log(`  • ${s.codigo} ya existe`); saltados++; continue; }
    await call('/suministros', { method: 'POST', body: s });
    console.log(`  ✓ ${s.nombre} (${s.codigo})`);
    creados.suministros++;
  }

  // 4) Mantenimientos
  console.log('\n🔧 Mantenimientos…');
  const mapaImpresoras = new Map(impresoras.map(i => [i.nombre, i.id]));
  const mantenimientosExistentes = await call('/mantenimientos');
  const claveMant = new Set(mantenimientosExistentes.map(m => `${m.impresora_id}|${m.fecha}|${m.descripcion}`));
  for (const m of MANTENIMIENTOS) {
    const impresora_id = mapaImpresoras.get(m.impresora);
    if (!impresora_id) { console.log(`  ! impresora no encontrada: ${m.impresora}`); continue; }
    if (claveMant.has(`${impresora_id}|${m.fecha}|${m.descripcion}`)) { console.log(`  • ${m.impresora} (${m.fecha}) ya existe`); saltados++; continue; }
    await call('/mantenimientos', { method: 'POST', body: { ...m, impresora_id } });
    console.log(`  ✓ ${m.impresora} · ${m.fecha} · ${m.estado}`);
    creados.mantenimientos++;
  }

  // 5) Registros diarios de septiembre
  console.log('\n📄 Registros diarios (1–15 sep 2026)…');
  const registrosExistentes = new Set((await call('/registros')).map(r => `${r.impresora_id}|${r.fecha}`));
  const registrosNuevos = generarRegistros(impresoras).filter(r => {
    if (registrosExistentes.has(`${r.impresora_id}|${r.fecha}`)) { saltados++; return false; }
    return true;
  });
  console.log(`  ${registrosNuevos.length} registros por crear…`);
  let erroresRegistros = 0;
  await pool(registrosNuevos, async r => {
    try {
      await call('/registros', { method: 'POST', body: r });
      creados.registros++;
      if (creados.registros % 25 === 0) console.log(`    … ${creados.registros}/${registrosNuevos.length}`);
    } catch (error) {
      erroresRegistros++;
      console.log(`  ! ${r.impresora_id} ${r.fecha}: ${error.message}`);
    }
  }, 3);
  console.log(`  ✓ ${creados.registros} registros creados${erroresRegistros ? ` (${erroresRegistros} fallidos)` : ''}`);

  // 6) Movimientos de suministros (solo si el insumo no tiene consumo reciente)
  console.log('\n🔁 Movimientos de suministros…');
  const suministros = await call('/suministros');
  const mapaSuministros = new Map(suministros.map(s => [s.codigo, s.id]));
  const proyeccion = await call('/reportes/proyeccion');
  const conConsumo = new Set(proyeccion.filter(p => p.consumo_30_dias > 0).map(p => mapaSuministros.get(p.suministro)));
  for (const mov of MOVIMIENTOS) {
    const suministro_id = mapaSuministros.get(mov.codigo);
    if (!suministro_id) { console.log(`  ! suministro no encontrado: ${mov.codigo}`); continue; }
    if (conConsumo.has(suministro_id)) { console.log(`  • ${mov.codigo} ya tiene movimientos recientes`); saltados++; continue; }
    await call(`/suministros/${suministro_id}/movimiento`, { method: 'POST', body: mov });
    conConsumo.add(suministro_id); // evita duplicar si hay dos del mismo insumo
    console.log(`  ✓ ${mov.tipo_movimiento} ${mov.cantidad} · ${mov.codigo}`);
    creados.movimientos++;
  }

  // 7) Resumen + estado del dashboard
  console.log('\n=== Resumen ===');
  console.log(`Usuarios: ${creados.usuarios} · Impresoras: ${creados.impresoras} · Suministros: ${creados.suministros}`);
  console.log(`Mantenimientos: ${creados.mantenimientos} · Registros: ${creados.registros} · Movimientos: ${creados.movimientos} · Saltados (ya existían): ${saltados}`);

  const resumen = await call('/dashboard/resumen');
  console.log('\n=== Dashboard en producción ===');
  console.log(`Impresoras activas: ${resumen.impresoras_activas} · Inactivas: ${resumen.impresoras_inactivas} · En mantenimiento: ${resumen.impresoras_mantenimiento}`);
  console.log(`Suministros bajos: ${resumen.suministros_bajos} · Mantenimientos pendientes: ${resumen.mantenimientos_pendientes}`);
  console.log(`Consumo del mes: ${resumen.consumo_mensual} impresiones · Alertas activas: ${resumen.alertas.length}`);

  await call('/logout', { method: 'POST' });
  console.log('\n✅ Carga finalizada.');
}

main().catch(error => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
