@echo off
echo =====================================
echo CARGAR DATOS DE PRUEBA
echo =====================================
echo.
echo Este script inicializara la base de datos y cargara datos de prueba.
echo.

cd /d "%~dp0..\backend"

echo [1/3] Inicializando base de datos (creando tablas)...
call npm run init-db
if errorlevel 1 (
  echo.
  echo ERROR: No se pudo inicializar la base de datos.
  echo Verifique que:
  echo   - PostgreSQL este en ejecucion
  echo   - La base de datos 'control_impresiones' exista
  echo   - Node.js este instalado
  echo   - Las credenciales en db.js sean correctas
  echo.
  pause
  exit /b 1
)

echo.
echo [2/3] Ejecutando migraciones de columnas...
call npm run migrate
if errorlevel 1 (
  echo ADVERTENCIA: No se pudieron ejecutar las migraciones.
)

echo.
echo [3/3] Cargando datos de prueba...
call npm run seed
if errorlevel 1 (
  echo.
  echo ERROR: No se pudieron cargar los datos de prueba.
  echo Verifique que:
  echo   - PostgreSQL este en ejecucion
  echo   - Node.js este instalado
  echo   - Las credenciales en db.js sean correctas
  echo.
  pause
  exit /b 1
)

echo.
echo =====================================
echo DATOS DE PRUEBA CARGADOS
echo =====================================
echo.
echo Usuarios creados:
echo   admin / admin123 (administrador)
echo   carlos / carlos123 (supervisor)
echo   maria / maria123 (operario)
echo   juan / juan123 (tecnico)
echo   laura / laura123 (operario)
echo.
echo Se han creado impresoras, suministros y alertas de prueba.
echo.
pause
