@echo off
echo =====================================
echo LIMPIAR BASE DE DATOS
echo =====================================
echo.
echo Este script eliminara todos los datos de la base de datos
echo manteniendo solo los usuarios de login (admin, carlos, maria, juan, laura).
echo.

cd /d "%~dp0..\backend"

echo [1/3] Inicializando base de datos (asegurando tablas existan)...
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
echo [2/3] Ejecutando limpieza de base de datos...
node reset-database.js

if errorlevel 1 (
  echo.
  echo ERROR: No se pudo limpiar la base de datos.
  echo Verifique que:
  echo   - PostgreSQL este en ejecucion
  echo   - Node.js este instalado
  echo   - Las credenciales en db.js sean correctas
  echo.
  pause
  exit /b 1
)

echo.
echo [3/3] Ejecutando migraciones para asegurar esquema correcto...
call npm run migrate
if errorlevel 1 (
  echo ADVERTENCIA: No se pudieron ejecutar las migraciones.
)

echo.
echo =====================================
echo LIMPIEZA COMPLETADA
echo =====================================
echo.
echo Todos los datos han sido eliminados.
echo Usuarios de login mantenidos: admin, carlos, maria, juan, laura
echo.
pause
