import express from 'express';
import cors from 'cors';
import session from 'express-session';
import pool, { testConnection } from './db.js';
import { initializeDatabase } from './db-init.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(session({
  secret: 'sicis-control-impresiones-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: false
  }
}));

const ROLES = ['administrador', 'supervisor', 'operario', 'tecnico'];

function normalizarRol(rol) {
  if (!rol) return null;
  const r = String(rol).toLowerCase().trim();
  if (r === 'admin') return 'administrador';
  if (r === 'cajer@s' || r === 'cajero' || r === 'cajera') return 'operario';
  return r;
}

function requireAuth(req, res, next) {
  console.log(`Auth check - Method: ${req.method}, Path: ${req.path}, Session:`, req.session);
  if (!req.session?.usuario_id) {
    console.log('Auth failed: No usuario_id in session');
    return res.status(401).json({ error: 'No autenticado' });
  }
  console.log('Auth passed');
  next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    const rol = normalizarRol(req.session?.rol);
    const permitidos = roles.map(normalizarRol);
    console.log(`Role check - User rol: ${rol}, Required roles: ${permitidos}`);
    if (!rol || !permitidos.includes(rol)) {
      console.log('Role check failed');
      return res.status(403).json({ error: 'No autorizado' });
    }
    console.log('Role check passed');
    next();
  };
}

function puedeVerModulo(rol, modulo) {
  const r = normalizarRol(rol);
  const acceso = {
    dashboard: ['administrador', 'supervisor', 'operario', 'tecnico'],
    impresoras: ['administrador', 'supervisor', 'operario', 'tecnico'],
    suministros: ['administrador', 'supervisor', 'operario'],
    mantenimientos: ['administrador', 'supervisor', 'tecnico'],
    registros: ['administrador', 'supervisor', 'operario'],
    reportes: ['administrador', 'supervisor'],
    configuracion: ['administrador']
  };
  return (acceso[modulo] || []).includes(r);
}

app.get('/health', async (req, res) => {
  try {
    await testConnection();
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: error.message });
  }
});

// --- AUTENTICACIÓN Y SESIÓN ---

app.get('/sesion', (req, res) => {
  if (!req.session?.usuario_id) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  res.json({
    usuario_id: req.session.usuario_id,
    nombre: req.session.nombre,
    usuario: req.session.usuario,
    rol: normalizarRol(req.session.rol)
  });
});

app.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    }

    const result = await pool.query(
      'SELECT id, nombre, usuario, rol, activo FROM usuarios WHERE usuario = $1 AND password = $2 AND activo = true',
      [usuario, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos. Verifica tus datos e inténtalo nuevamente.' });
    }

    const user = result.rows[0];
    const rol = normalizarRol(user.rol);

    req.session.usuario_id = user.id;
    req.session.nombre = user.nombre;
    req.session.usuario = user.usuario;
    req.session.rol = rol;

    res.json({
      ok: true,
      rol,
      nombre: user.nombre
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Sesión cerrada' });
  });
});

// --- DASHBOARD ---

app.get('/dashboard/resumen', requireAuth, requireRoles('administrador', 'supervisor', 'operario', 'tecnico'), async (req, res) => {
  try {
    const [impresorasActivas, suministrosBajos, mantenimientosPendientes, consumoMensual, alertas, consumoPorImpresora, impresorasInactivas, impresorasMantenimiento] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM impresoras WHERE estado = 'activa'"),
      pool.query('SELECT COUNT(*)::int AS total FROM suministros WHERE cantidad <= stock_minimo'),
      pool.query("SELECT COUNT(*)::int AS total FROM mantenimientos WHERE estado IN ('pendiente', 'en proceso')"),
      pool.query(`
        SELECT COALESCE(SUM(contador_diario), 0)::int AS total
        FROM registros_diarios
        WHERE EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
      `),
      pool.query(`
        SELECT id, tipo, gravedad, titulo, descripcion, referencia_id, fecha_creacion
        FROM alertas
        WHERE activa = true
        ORDER BY
          CASE gravedad
            WHEN 'crítico' THEN 0
            WHEN 'alto' THEN 1
            WHEN 'medio' THEN 2
            WHEN 'bajo' THEN 3
          END,
          fecha_creacion DESC
        LIMIT 20
      `),
      pool.query(`
        SELECT i.nombre AS impresora,
               COALESCE(SUM(r.recarga_papel), 0)::int AS papel,
               COALESCE(SUM(r.contador_diario), 0)::int AS contador
        FROM impresoras i
        LEFT JOIN registros_diarios r ON r.impresora_id = i.id
          AND EXTRACT(YEAR FROM r.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND EXTRACT(MONTH FROM r.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
        GROUP BY i.id, i.nombre
        ORDER BY i.nombre
      `),
      pool.query("SELECT COUNT(*)::int AS total FROM impresoras WHERE estado = 'inactiva'"),
      pool.query("SELECT COUNT(*)::int AS total FROM impresoras WHERE estado = 'mantenimiento'")
    ]);

    res.json({
      impresoras_activas: impresorasActivas.rows[0].total,
      impresoras_inactivas: impresorasInactivas.rows[0].total,
      impresoras_mantenimiento: impresorasMantenimiento.rows[0].total,
      suministros_bajos: suministrosBajos.rows[0].total,
      mantenimientos_pendientes: mantenimientosPendientes.rows[0].total,
      consumo_mensual: consumoMensual.rows[0].total,
      alertas: alertas.rows,
      consumo_por_impresora: consumoPorImpresora.rows
    });
  } catch (error) {
    console.error('Error dashboard:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- IMPRESORAS ---

app.get('/impresoras', requireAuth, requireRoles('administrador', 'supervisor', 'operario', 'tecnico'), async (req, res) => {
  try {
    const { estado } = req.query;
    let query = 'SELECT * FROM impresoras';
    const params = [];
    if (estado) {
      query += ' WHERE estado = $1';
      params.push(estado);
    }
    query += ' ORDER BY nombre';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando impresoras:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/impresoras/:id', requireAuth, requireRoles('administrador', 'supervisor', 'operario', 'tecnico'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM impresoras WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Impresora no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo impresora:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.post('/impresoras', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    console.log('POST /impresoras - Body:', req.body);
    console.log('POST /impresoras - Session:', req.session);
    
    const { nombre, modelo, ubicacion, estado, contador_actual } = req.body;
    if (!nombre?.trim() || !ubicacion?.trim() || !estado) {
      return res.status(400).json({ error: 'Nombre, ubicación y estado son obligatorios' });
    }
    if (contador_actual !== undefined && Number(contador_actual) < 0) {
      return res.status(400).json({ error: 'Contador actual debe ser >= 0' });
    }
    const result = await pool.query(
      `INSERT INTO impresoras (nombre, modelo, ubicacion, estado, contador_actual)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre.trim(), modelo?.trim() || null, ubicacion.trim(), estado, contador_actual ?? 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando impresora:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.put('/impresoras/:id', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    const { nombre, modelo, ubicacion, estado, contador_actual } = req.body;
    if (!nombre?.trim() || !ubicacion?.trim() || !estado) {
      return res.status(400).json({ error: 'Nombre, ubicación y estado son obligatorios' });
    }
    const result = await pool.query(
      `UPDATE impresoras SET nombre=$1, modelo=$2, ubicacion=$3, estado=$4, contador_actual=$5
       WHERE id=$6 RETURNING *`,
      [nombre.trim(), modelo?.trim() || null, ubicacion.trim(), estado, contador_actual ?? 0, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Impresora no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando impresora:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.delete('/impresoras/:id', requireAuth, requireRoles('administrador'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM impresoras WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Impresora no encontrada' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error eliminando impresora:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

// --- SUMINISTROS ---

app.get('/suministros', requireAuth, requireRoles('administrador', 'supervisor', 'operario'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suministros ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando suministros:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.get('/suministros/:id', requireAuth, requireRoles('administrador', 'supervisor', 'operario'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suministros WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Suministro no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo suministro:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.post('/suministros', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    const { nombre, tipo, cantidad, stock_minimo, stock_maximo, codigo, proveedor, fecha_ingreso } = req.body;
    if (!nombre?.trim() || !tipo || !codigo?.trim() || !fecha_ingreso) {
      return res.status(400).json({ error: 'Campos obligatorios incompletos' });
    }
    if (stock_maximo != null && Number(stock_maximo) < Number(stock_minimo ?? 0)) {
      return res.status(400).json({ error: 'Stock máximo debe ser >= stock mínimo' });
    }
    const result = await pool.query(
      `INSERT INTO suministros (nombre, tipo, cantidad, stock_minimo, stock_maximo, codigo, proveedor, fecha_ingreso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [nombre.trim(), tipo, cantidad ?? 0, stock_minimo ?? 0, stock_maximo ?? null, codigo.trim(), proveedor?.trim() || null, fecha_ingreso]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código ya existe' });
    }
    console.error('Error creando suministro:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.put('/suministros/:id', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    const { nombre, tipo, cantidad, stock_minimo, stock_maximo, codigo, proveedor, fecha_ingreso } = req.body;
    if (!nombre?.trim() || !tipo || !codigo?.trim() || !fecha_ingreso) {
      return res.status(400).json({ error: 'Campos obligatorios incompletos' });
    }
    if (stock_maximo != null && Number(stock_maximo) < Number(stock_minimo ?? 0)) {
      return res.status(400).json({ error: 'Stock máximo debe ser >= stock mínimo' });
    }
    const result = await pool.query(
      `UPDATE suministros SET nombre=$1, tipo=$2, cantidad=$3, stock_minimo=$4, stock_maximo=$5, codigo=$6, proveedor=$7, fecha_ingreso=$8
       WHERE id=$9 RETURNING *`,
      [nombre.trim(), tipo, cantidad ?? 0, stock_minimo ?? 0, stock_maximo ?? null, codigo.trim(), proveedor?.trim() || null, fecha_ingreso, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Suministro no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código ya existe' });
    }
    console.error('Error actualizando suministro:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.delete('/suministros/:id', requireAuth, requireRoles('administrador'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM suministros WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Suministro no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error eliminando suministro:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

app.post('/suministros/:id/movimiento', requireAuth, requireRoles('administrador', 'supervisor', 'operario'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { tipo_movimiento, cantidad, observacion, proveedor } = req.body;
    const suministroId = req.params.id;

    if (!tipo_movimiento || !['entrada', 'salida'].includes(tipo_movimiento)) {
      return res.status(400).json({ error: 'Tipo de movimiento inválido' });
    }
    if (!cantidad || Number(cantidad) <= 0) {
      return res.status(400).json({ error: 'Cantidad debe ser > 0' });
    }

    await client.query('BEGIN');

    const stockResult = await client.query('SELECT cantidad FROM suministros WHERE id = $1 FOR UPDATE', [suministroId]);
    if (stockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Suministro no encontrado' });
    }

    const stockActual = stockResult.rows[0].cantidad;
    const delta = tipo_movimiento === 'entrada' ? Number(cantidad) : -Number(cantidad);
    const nuevoStock = stockActual + delta;

    if (nuevoStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Stock insuficiente para esta salida' });
    }

    await client.query('UPDATE suministros SET cantidad = $1 WHERE id = $2', [nuevoStock, suministroId]);
    const movResult = await client.query(
      `INSERT INTO movimientos_suministros (suministro_id, tipo_movimiento, cantidad, observacion, proveedor, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [suministroId, tipo_movimiento, cantidad, observacion || null, proveedor?.trim() || null, req.session.usuario_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ movimiento: movResult.rows[0], cantidad_actual: nuevoStock });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registrando movimiento:', error);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// --- MANTENIMIENTOS ---

app.get('/mantenimientos', requireAuth, requireRoles('administrador', 'supervisor', 'tecnico'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, i.nombre AS impresora_nombre
      FROM mantenimientos m
      JOIN impresoras i ON i.id = m.impresora_id
      ORDER BY m.fecha DESC, m.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando mantenimientos:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/mantenimientos/:id', requireAuth, requireRoles('administrador', 'supervisor', 'tecnico'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, i.nombre AS impresora_nombre
      FROM mantenimientos m
      JOIN impresoras i ON i.id = m.impresora_id
      WHERE m.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo mantenimiento:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/mantenimientos', requireAuth, requireRoles('administrador', 'supervisor', 'tecnico'), async (req, res) => {
  try {
    const { impresora_id, tecnico, fecha, estado, descripcion, solucion } = req.body;
    if (!impresora_id || !tecnico?.trim() || !fecha || !estado || !descripcion?.trim()) {
      return res.status(400).json({ error: 'Campos obligatorios incompletos' });
    }
    const result = await pool.query(
      `INSERT INTO mantenimientos (impresora_id, tecnico, fecha, estado, descripcion, solucion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [impresora_id, tecnico.trim(), fecha, estado, descripcion.trim(), solucion?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando mantenimiento:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.put('/mantenimientos/:id', requireAuth, requireRoles('administrador', 'supervisor', 'tecnico'), async (req, res) => {
  try {
    const { impresora_id, tecnico, fecha, estado, descripcion, solucion } = req.body;
    if (!impresora_id || !tecnico?.trim() || !fecha || !estado || !descripcion?.trim()) {
      return res.status(400).json({ error: 'Campos obligatorios incompletos' });
    }
    const result = await pool.query(
      `UPDATE mantenimientos SET impresora_id=$1, tecnico=$2, fecha=$3, estado=$4, descripcion=$5, solucion=$6
       WHERE id=$7 RETURNING *`,
      [impresora_id, tecnico.trim(), fecha, estado, descripcion.trim(), solucion?.trim() || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando mantenimiento:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- REGISTROS DIARIOS ---

app.get('/registros', requireAuth, requireRoles('administrador', 'supervisor', 'operario'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, i.nombre AS impresora_nombre, u.nombre AS usuario_nombre
      FROM registros_diarios r
      JOIN impresoras i ON i.id = r.impresora_id
      JOIN usuarios u ON u.id = r.usuario_id
      ORDER BY r.fecha DESC, r.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando registros:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/registros', requireAuth, requireRoles('administrador', 'supervisor', 'operario'), async (req, res) => {
  try {
    const { impresora_id, fecha, contador_diario, recarga_papel, cambio_toner, tecnico_recarga } = req.body;
    if (!impresora_id || !fecha || contador_diario === undefined) {
      return res.status(400).json({ error: 'Impresora, fecha y contador son obligatorios' });
    }
    const result = await pool.query(
      `INSERT INTO registros_diarios (impresora_id, fecha, contador_diario, recarga_papel, cambio_toner, tecnico_recarga, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [impresora_id, fecha, contador_diario, recarga_papel ?? 0, cambio_toner ?? false, tecnico_recarga?.trim() || null, req.session.usuario_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un registro para esta impresora en la fecha indicada' });
    }
    console.error('Error creando registro:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- REPORTES ---

app.get('/reportes/consumo-mensual', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.nombre AS impresora,
             COALESCE(SUM(r.recarga_papel), 0)::int AS papel_total,
             COALESCE(MIN(r.contador_diario), 0)::int AS contador_minimo,
             COALESCE(MAX(r.contador_diario), 0)::int AS contador_maximo
      FROM impresoras i
      LEFT JOIN registros_diarios r ON r.impresora_id = i.id
        AND EXTRACT(YEAR FROM r.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM r.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
      GROUP BY i.id, i.nombre
      ORDER BY i.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error reporte consumo:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/reportes/toner', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.nombre AS impresora,
             COUNT(r.id) FILTER (WHERE r.cambio_toner = true)::int AS cambios_toner
      FROM impresoras i
      LEFT JOIN registros_diarios r ON r.impresora_id = i.id
        AND EXTRACT(YEAR FROM r.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM r.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
      GROUP BY i.id, i.nombre
      ORDER BY i.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error reporte toner:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/reportes/proyeccion', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.nombre AS suministro, s.cantidad AS cantidad_actual, s.stock_maximo,
             COALESCE(m.consumo_30, 0)::int AS consumo_30_dias,
             CASE
               WHEN COALESCE(m.consumo_30, 0) = 0 THEN NULL
               ELSE ROUND(s.cantidad::numeric / (m.consumo_30::numeric / 30))
             END AS dias_restantes,
             CASE
               WHEN COALESCE(m.consumo_30, 0) = 0 THEN 0
               WHEN ROUND(s.cantidad::numeric / (m.consumo_30::numeric / 30)) < 15
                 THEN GREATEST(COALESCE(s.stock_maximo, 0) - s.cantidad, 0)
               ELSE 0
             END AS pedido_sugerido,
             CASE
               WHEN COALESCE(m.consumo_30, 0) = 0 THEN false
               WHEN ROUND(s.cantidad::numeric / (m.consumo_30::numeric / 30)) < 15 THEN true
               ELSE false
             END AS requiere_pedido
      FROM suministros s
      LEFT JOIN (
        SELECT suministro_id, SUM(cantidad) AS consumo_30
        FROM movimientos_suministros
        WHERE tipo_movimiento = 'salida'
          AND fecha >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        GROUP BY suministro_id
      ) m ON m.suministro_id = s.id
      ORDER BY s.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error reporte proyección:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- USUARIOS ---

app.get('/usuarios', requireAuth, requireRoles('administrador'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios ORDER BY id'
    );
    res.json(result.rows.map(u => ({ ...u, rol: normalizarRol(u.rol) })));
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/usuarios', requireAuth, requireRoles('administrador'), async (req, res) => {
  try {
    const { nombre, usuario, password, rol, activo } = req.body;
    if (!nombre?.trim() || !usuario?.trim() || !password || !rol) {
      return res.status(400).json({ error: 'Faltan datos para crear el usuario' });
    }
    if (!ROLES.includes(normalizarRol(rol))) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, usuario, password, rol, activo) VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, usuario, rol, activo, creado_en',
      [nombre.trim(), usuario.trim(), password, normalizarRol(rol), activo !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    console.error('Error creando usuario:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.put('/usuarios/:id', requireAuth, requireRoles('administrador'), async (req, res) => {
  try {
    const { nombre, usuario, password, rol, activo } = req.body;
    if (!nombre?.trim() || !usuario?.trim() || !rol) {
      return res.status(400).json({ error: 'Faltan datos para actualizar el usuario' });
    }
    if (!ROLES.includes(normalizarRol(rol))) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    let query, params;
    if (password) {
      query = 'UPDATE usuarios SET nombre=$1, usuario=$2, password=$3, rol=$4, activo=$5 WHERE id=$6 RETURNING id, nombre, usuario, rol, activo, creado_en';
      params = [nombre.trim(), usuario.trim(), password, normalizarRol(rol), activo !== false, req.params.id];
    } else {
      query = 'UPDATE usuarios SET nombre=$1, usuario=$2, rol=$3, activo=$4 WHERE id=$5 RETURNING id, nombre, usuario, rol, activo, creado_en';
      params = [nombre.trim(), usuario.trim(), normalizarRol(rol), activo !== false, req.params.id];
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.delete('/usuarios/:id', requireAuth, requireRoles('administrador'), async (req, res) => {
  try {
    if (Number(req.params.id) === req.session.usuario_id) {
      return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
    }
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.delete('/alertas/:id', requireAuth, requireRoles('administrador', 'supervisor'), async (req, res) => {
  try {
    const result = await pool.query('UPDATE alertas SET activa = false, fecha_resolucion = NOW() WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error cerrando alerta:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

async function startServer() {
  try {
    console.log('Conectando a PostgreSQL (localhost:5432 / control_impresiones)...');
    await testConnection();
    // Temporalmente desactivamos la inicialización automática
    // await initializeDatabase();

    const server = app.listen(PORT, () => {
      console.log(`Servidor SICIS escuchando en http://localhost:${PORT}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`\nEl puerto ${PORT} ya está en uso.`);
        console.error('Cierre la otra ventana del backend o ejecute: npm run stop');
        process.exit(1);
      }
      console.error('Error al iniciar el servidor:', error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('\nNo se pudo iniciar SICIS:');
    console.error(error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\nPostgreSQL no está en ejecución. Inicie el servicio e intente de nuevo.');
    } else if (error.code === '28P01') {
      console.error('\nCredenciales incorrectas en backend/db.js');
    } else if (error.code === '3D000') {
      console.error('\nLa base de datos "control_impresiones" no existe. Créela en pgAdmin o con createdb.');
    }
    process.exit(1);
  }
}

startServer();

export { normalizarRol, puedeVerModulo };
