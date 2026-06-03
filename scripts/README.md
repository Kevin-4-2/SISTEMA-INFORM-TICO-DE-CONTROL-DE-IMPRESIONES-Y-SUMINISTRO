# Scripts de SICIS - SISTEMA INFORMÁTICO DE CONTROL DE IMPRESIONES Y SUMINISTROS

## Scripts disponibles

### start.bat
Inicia el sistema SICIS. Detiene cualquier instancia previa del backend y abre el navegador en la página de login.

### reset-database.bat
Elimina todos los datos de la base de datos manteniendo solo los usuarios de login (admin, carlos, maria, juan, laura). Útil para limpiar la base de datos sin perder acceso al sistema.

### seed-database.bat
Carga datos de prueba en la base de datos. Ejecuta las migraciones necesarias y luego carga los datos de prueba (impresoras, suministros, alertas, etc.).

## Comandos npm (desde backend/)

- `npm start` - Inicia el servidor backend
- `npm run init-db` - Inicializa la base de datos (crea tablas)
- `npm run migrate` - Ejecuta migraciones de columnas
- `npm run seed` - Carga datos de prueba
- `npm run reset` - Limpia la base de datos (mantiene usuarios de login)
- `npm run stop` - Detiene el servidor backend
- `npm run restart` - Reinicia el servidor backend

## Flujo de trabajo recomendado

### Primer inicio
1. Ejecutar `npm run init-db` desde backend/ para crear las tablas
2. Ejecutar `scripts\seed-database.bat` para cargar datos de prueba
3. Ejecutar `scripts\start.bat` para iniciar el sistema

### Para limpiar y recargar datos
1. Ejecutar `scripts\reset-database.bat` para limpiar datos
2. Ejecutar `scripts\seed-database.bat` para recargar datos de prueba
3. Ejecutar `scripts\start.bat` para iniciar el sistema

## Usuarios de prueba

- admin / admin123 (administrador)
- carlos / carlos123 (supervisor)
- maria / maria123 (operario)
- juan / juan123 (tecnico)
- laura / laura123 (operario)
