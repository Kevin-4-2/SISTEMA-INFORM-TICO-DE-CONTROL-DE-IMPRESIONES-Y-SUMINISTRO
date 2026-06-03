import pool from './db.js';

async function resetDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🔄 Limpiando base de datos (manteniendo usuarios de login)...');

    // Eliminar datos en orden correcto (por dependencias)
    await client.query('DELETE FROM movimientos_suministros');
    console.log('  ✓ Movimientos de suministros eliminados');

    await client.query('DELETE FROM registros_diarios');
    console.log('  ✓ Registros diarios eliminados');

    await client.query('DELETE FROM mantenimientos');
    console.log('  ✓ Mantenimientos eliminados');

    await client.query('DELETE FROM suministros');
    console.log('  ✓ Suministros eliminados');

    await client.query('DELETE FROM impresoras');
    console.log('  ✓ Impresoras eliminadas');

    await client.query('DELETE FROM alertas');
    console.log('  ✓ Alertas eliminadas');

    // Mantener solo usuarios de login (admin, carlos, maria, juan, laura)
    await client.query(`
      DELETE FROM usuarios 
      WHERE usuario NOT IN ('admin', 'carlos', 'maria', 'juan', 'laura')
    `);
    console.log('  ✓ Usuarios eliminados (manteniendo login)');

    // Resetear secuencias
    await client.query('ALTER SEQUENCE usuarios_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE impresoras_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE suministros_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE movimientos_suministros_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE mantenimientos_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE registros_diarios_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE alertas_id_seq RESTART WITH 1');
    console.log('  ✓ Secuencias reseteadas');

    await client.query('COMMIT');

    console.log('\n✅ Base de datos limpiada exitosamente');
    console.log('Usuarios de login mantenidos: admin, carlos, maria, juan, laura');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error durante la limpieza:', error.message);
    console.error('Detalle:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase().then(() => process.exit(0));
