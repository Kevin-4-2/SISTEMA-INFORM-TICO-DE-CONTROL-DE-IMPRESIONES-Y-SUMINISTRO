# SISTEMA INFORMÁTICO DE CONTROL DE IMPRESIONES Y SUMINISTROS

Backend REST desarrollado con Node.js, Express.js, PostgreSQL, Sequelize, JWT y bcrypt.

## Funcionalidades incluidas

- Autenticación con JWT, sesiones revocables, hash de contraseñas y control por roles.
- CRUD de impresoras.
- CRUD de suministros con entradas, salidas, alertas de stock bajo y búsqueda para autocompletado.
- Gestión de mantenimientos.
- Registros diarios de contador, papel y cambio de tóner.
- Reportes básicos de consumo mensual, rendimiento de tóner y proyección de pedidos.
- Validaciones con `express-validator`, manejo global de errores y respuestas JSON consistentes.

## Estructura

```text
src/
  config/
  controllers/
  middlewares/
  models/
  routes/
  services/
  utils/
  validators/
  database/
    migrations/
    seeders/
  app.js
  server.js
```

## Requisitos

- Node.js 18 o superior
- PostgreSQL 14 o superior

## Instalación

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

En PowerShell también puede usar:

```powershell
Copy-Item .env.example .env
```

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | Entorno de ejecución |
| `PORT` | Puerto HTTP |
| `DB_HOST` | Host de PostgreSQL |
| `DB_PORT` | Puerto de PostgreSQL |
| `DB_NAME` | Base de datos |
| `DB_USER` | Usuario de base de datos |
| `DB_PASSWORD` | Contraseña de base de datos |
| `JWT_SECRET` | Secreto para firmar tokens |
| `JWT_EXPIRES_IN` | Duración del token |
| `CORS_ORIGIN` | Origen permitido para React |

## Usuario inicial

```text
usuario: admin
contraseña: Admin123*
rol: administrador
```

Cambie esta contraseña antes de usar el sistema en un entorno real.

## Formato de respuesta

```json
{
  "success": true,
  "message": "",
  "data": {}
}
```

## Endpoints

### Autenticación

| Método | Ruta |
| --- | --- |
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/logout` |
| `GET` | `/api/auth/profile` |

### Impresoras

| Método | Ruta |
| --- | --- |
| `GET` | `/api/printers` |
| `GET` | `/api/printers/:id` |
| `POST` | `/api/printers` |
| `PUT` | `/api/printers/:id` |
| `DELETE` | `/api/printers/:id` |

### Suministros

| Método | Ruta |
| --- | --- |
| `GET` | `/api/supplies?q=texto` |
| `GET` | `/api/supplies/:id` |
| `POST` | `/api/supplies` |
| `PUT` | `/api/supplies/:id` |
| `DELETE` | `/api/supplies/:id` |
| `POST` | `/api/supplies/:id/movements` |

### Mantenimientos

| Método | Ruta |
| --- | --- |
| `GET` | `/api/maintenance` |
| `POST` | `/api/maintenance` |
| `PUT` | `/api/maintenance/:id` |

### Registros diarios

| Método | Ruta |
| --- | --- |
| `POST` | `/api/daily-records` |
| `GET` | `/api/daily-records` |

### Reportes

| Método | Ruta |
| --- | --- |
| `GET` | `/api/reports/monthly?year=2026&month=5` |
| `GET` | `/api/reports/toner-performance` |
| `GET` | `/api/reports/projections` |

## Roles y permisos

| Rol | Acceso principal |
| --- | --- |
| `administrador` | Acceso total |
| `supervisor` | Gestión operativa y reportes |
| `operario` | Registros diarios y movimientos de suministros |
| `tecnico` | Mantenimientos |

## Notas de diseño

- El logout revoca la sesión persistida y el frontend también debe eliminar el JWT almacenado.
- Los movimientos de suministro se ejecutan dentro de transacciones para impedir stock negativo.
- Cada impresora solo admite un registro diario por fecha.
- El backend queda preparado para integrarse con React mediante `CORS_ORIGIN`.
