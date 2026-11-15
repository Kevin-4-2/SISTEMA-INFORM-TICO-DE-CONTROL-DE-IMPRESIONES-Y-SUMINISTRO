# SICIS: estado del ajuste adaptable

Fecha: 15 de noviembre de 2026.

## Cambios realizados en esta sesión

- Se agregó `frontend/src/responsive.css` y se carga al final de los estilos desde `frontend/src/polish.js`.
- En pantallas de hasta 760 px, la navegación pasa a ocupar el ancho inferior y permite desplazarse horizontalmente para llegar a los ocho módulos. Se respeta el área segura del dispositivo.
- Se quitó el margen lateral duplicado del área principal entre 761 y 1120 px.
- Se ajustaron los márgenes, encabezados, filtros, tablas y diálogos para anchos pequeños. Las tablas conservan sus columnas y se desplazan dentro de su contenedor.
- Se corrigió el inicio de sesión temprano: el botón se habilita al cargar la lógica y el formulario usa POST como respaldo, evitando que las credenciales terminen en la URL si se envía antes de que JavaScript esté listo.

## Verificación

- `npm run build` en `frontend/`: correcto.
- Inspección visual en Brave con un escenario estático a 320 y 390 px: barra inferior visible, contenido dentro del ancho y tabla desplazable. Mediciones también a 768 y 1280 px, sin desbordamiento del documento.
- La auditoría automatizada de todos los módulos con sesión simulada no pudo completarse: Brave se quedó atascado durante la animación de acceso en esta máquina. Por ello todavía no se afirma cobertura visual completa de todos los módulos ni de datos reales.

## Estado del repositorio y siguientes pasos

- Publicar este cambio y comprobar el despliegue y `/health` en Render.
- Probar en un teléfono real o en el navegador autenticado los ocho módulos, formularios y diálogos, especialmente en orientación horizontal.
- No se incorporaron cambios locales ajenos a esta tarea en `backend/` ni el cambio previo aún sin confirmar de `frontend/public/app-data.js` para el selector de técnicos. Preservarlos para revisión independiente.
