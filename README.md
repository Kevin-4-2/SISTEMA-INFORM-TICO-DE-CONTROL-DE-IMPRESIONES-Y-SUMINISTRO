# SISTEMA INFORMÁTICO DE CONTROL DE IMPRESIONES Y SUMINISTROS (SICIS)

Sistema integral para la gestión de suministros, mantenimientos y registros diarios de impresoras.

## 📁 Estructura del Proyecto

```
DCopy_Center/
├── backend/                 # Servidor Node.js con Express
│   ├── db.js              # Configuración de conexión PostgreSQL
│   ├── db-init.js         # Inicialización de base de datos
│   ├── index.js           # Servidor principal y API endpoints
│   ├── migrate.js         # Script de migración de base de datos
│   ├── migrar-db.js       # Script de migración adicional
│   ├── reset-database.js  # Script para limpiar base de datos
│   ├── package.json       # Dependencias de Node.js
│   └── node_modules/      # Dependencias instaladas
│
├── frontend/              # Aplicación web frontend
│   ├── img/               # Imágenes y assets
│   ├── index.html         # Página principal de la aplicación
│   ├── login.html         # Página de inicio de sesión
│   ├── login.css          # Estilos específicos de login
│   ├── logout-button.css  # Estilos del botón de cierre de sesión
│   ├── logout-button.js   # Lógica del botón de cierre de sesión
│   ├── script.js          # Lógica principal de la aplicación
│   └── styles.css         # Estilos globales de la aplicación
│
├── scripts/               # Scripts de automatización
│   ├── README.md          # Documentación de scripts
│   ├── start.bat          # Inicio completo del sistema
│   ├── reset-database.bat # Limpia base de datos
│   ├── seed-database.bat  # Carga datos de prueba
│   └── primer_inicio.bat  # Primer inicio del sistema
│
└── README.md              # Este archivo
```

## 🚀 Instalación y Configuración

### Requisitos Previos

- Node.js (v16 o superior)
- PostgreSQL (v12 o superior)
- Navegador web moderno (Chrome, Firefox, Edge)

### Configuración de Base de Datos

1. Crear la base de datos en PostgreSQL:
   ```sql
   CREATE DATABASE control_impresiones;
   CREATE USER control_impresiones WITH PASSWORD '1234';
   GRANT ALL PRIVILEGES ON DATABASE control_impresiones TO control_impresiones;
   ```

2. La configuración de conexión está en `backend/db.js`:
   ```javascript
   {
     user: '',postgres
     host: 'localhost',
     database: 'control_impresiones',
     password: '1234',
     port: 5432
   }
   ```

### Instalación de Dependencias

```bash
cd backend
npm install
```

### Comandos npm disponibles (desde backend/)

- `npm start` - Inicia el servidor backend
- `npm run init-db` - Inicializa la base de datos (crea tablas)
- `npm run migrate` - Ejecuta migraciones de columnas
- `npm run seed` - Carga datos de prueba
- `npm run reset` - Limpia la base de datos (mantiene usuarios de login)
- `npm run stop` - Detiene el servidor backend
- `npm run restart` - Reinicia el servidor backend

## 🎯 Uso del Sistema

### Primer Inicio

1. Ejecutar `npm run init-db` desde `backend/` para crear las tablas
2. Ejecutar `scripts\seed-database.bat` para cargar datos de prueba
3. Ejecutar `scripts\start.bat` para iniciar el sistema

Este flujo creará los siguientes usuarios de prueba:
- `admin / admin123` (administrador)
- `carlos / carlos123` (supervisor)
- `maria / maria123` (operario)
- `juan / juan123` (tecnico)
- `laura / laura123` (operario)

### Scripts de automatización (recomendados)

#### start.bat
Inicia el sistema SICIS. Detiene cualquier instancia previa del backend y abre el navegador en la página de login.

```bash
scripts\start.bat
```

#### reset-database.bat
Elimina todos los datos de la base de datos manteniendo solo los usuarios de login (admin, carlos, maria, juan, laura). Útil para limpiar la base de datos sin perder acceso al sistema.

```bash
scripts\reset-database.bat
```

#### seed-database.bat
Carga datos de prueba en la base de datos. Ejecuta las migraciones necesarias y luego carga los datos de prueba (impresoras, suministros, alertas, etc.).

```bash
scripts\seed-database.bat
```


### Para limpiar y recargar datos

1. Ejecutar `scripts\reset-database.bat` para limpiar datos
2. Ejecutar `scripts\seed-database.bat` para recargar datos de prueba
3. Ejecutar `scripts\start.bat` para iniciar el sistema

## 👥 Roles y Permisos

El sistema tiene 4 roles con diferentes niveles de acceso:

| Rol | Dashboard | Impresoras | Suministros | Mantenimientos | Registros | Reportes | Configuración |
|-----|-----------|------------|-------------|----------------|-----------|----------|---------------|
| Administrador | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supervisor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Operario | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Técnico | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

## 📊 Módulos del Sistema

### Dashboard
- Vista general del estado del sistema
- Estadísticas de impresoras activas, suministros bajos, mantenimientos pendientes
- Alertas de stock crítico
- Gráficos de consumo por impresora

### Impresoras
- Gestión de impresoras (crear, editar, eliminar)
- Seguimiento de contador de impresiones
- Estados: activa, inactiva, mantenimiento

### Suministros
- Control de inventario de suministros (tóner, papel, tinta)
- Registro de movimientos de entrada/salida
- Alertas de stock bajo
- Gestión de proveedores

### Mantenimientos
- Registro de mantenimientos preventivos y correctivos
- Seguimiento de estados: pendiente, en proceso, finalizado
- Asignación de técnicos

### Registros Diarios
- Registro de uso diario de impresoras
- Contador de impresiones
- Recargas de papel
- Cambios de tóner

### Reportes
- Reportes de consumo mensual
- Estadísticas de cambios de tóner
- Proyección de stock y pedidos sugeridos

### Configuración
- Gestión de usuarios
- Asignación de roles
- Activación/desactivación de cuentas

## 🎨 Características de Interfaz

- **Modo oscuro/claro**: Toggle para cambiar entre temas
- **Diseño responsive**: Adaptado para diferentes tamaños de pantalla
- **Badges de estado**: Indicadores visuales de estado de stock y mantenimientos
- **Paginación**: Tablas con paginación para mejor manejo de datos
- **Filtros de búsqueda**: Búsqueda en tiempo real en todas las tablas
- **Modales**: Formularios en ventanas modales para mejor UX

## 🗄️ Esquema de Base de Datos

El esquema completo de la base de datos se encuentra en `schema.sql` (raíz del proyecto).

Tablas principales:
- `usuarios`: Usuarios del sistema
- `impresoras`: Impresoras registradas
- `suministros`: Inventario de suministros
- `movimientos_suministros`: Historial de movimientos
- `mantenimientos`: Registro de mantenimientos
- `registros_diarios`: Registros de uso diario

## 🔧 Scripts de Base de Datos

### schema.sql
Esquema completo con todas las tablas y relaciones. Ejecutar para crear la base de datos desde cero.

### datos_prueba.sql
Datos de prueba para desarrollo (impresoras, suministros, usuarios, etc.).

### migrar_columnas.sql
Script de migración para actualizar columnas existentes sin perder datos. Incluye:
- Renombrar `password` a `contrasena`
- Agregar columnas de proveedor
- Actualizar constraints

### recrear_tablas.sql
Script para recrear las tablas (útil en desarrollo).

### Scripts de migración en backend/
- `backend/migrate.js` - Script de migración principal
- `backend/reset-database.js` - Limpia la base de datos manteniendo usuarios

## 📝 Scripts de Automatización

### Scripts recomendados (en scripts/)

#### start.bat
- Detiene el backend previo
- Inicializa tablas si es necesario
- Inicia el servidor backend
- Abre el navegador en la página de login

#### reset-database.bat
- Conecta a la base de datos
- Elimina todos los datos excepto usuarios de login
- Mantiene el sistema accesible

#### seed-database.bat
- Ejecuta migraciones necesarias
- Carga datos de prueba completos
- Genera alertas y registros de ejemplo

#### primer_inicio.bat
- Script de primer inicio completo
- Combina inicialización y carga de datos

## 🛠️ Tecnologías Utilizadas

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Base de Datos**: PostgreSQL
- **Gráficos**: Chart.js
- **Sesiones**: express-session

## 🔒 Seguridad

- Autenticación basada en sesiones
- Control de acceso por roles
- Validación de datos en backend
- Protección contra SQL injection (usando parámetros)
- CORS configurado

## 🐛 Solución de Problemas

### El backend no inicia
- Verificar que PostgreSQL esté corriendo
- Verificar las credenciales en `backend/db.js`
- Revisar que el puerto 3001 esté disponible

### Error de conexión a base de datos
- Verificar que el servicio PostgreSQL esté iniciado
- Confirmar que la base de datos control_impresiones exista
- Revisar credenciales en `backend/db.js`

### Las alertas no se muestran
- Verificar que haya suministros con stock bajo
- Revisar la configuración de stock mínimo


El sistema está listo para ser entregado y desplegado en producción.
