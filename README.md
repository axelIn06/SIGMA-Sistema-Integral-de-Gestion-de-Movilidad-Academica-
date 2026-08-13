# SIGMA OCRI

Sistema Integral de Gestión de Movilidad Académica para la OCRI UNSAAC.

Esta primera entrega incluye el prototipo funcional de SGMS, SGME y Panel OCRI. La autenticación real se integra con Supabase; los demás flujos conservan datos de demostración temporalmente.

## Ejecutar

Con Docker Desktop y Supabase local iniciados, cree el archivo de variables y ejecute el servidor:

```bash
cp .env.example .env.local
# Complete VITE_SUPABASE_PUBLISHABLE_KEY con la clave pública local.
npm run dev
```

Abra la dirección que indique Vite, normalmente `http://localhost:5173`.

Las cuentas usan Supabase Auth con este flujo:

1. La persona crea su cuenta con su correo universitario.
2. SIGMA envía un enlace de verificación para comprobar que controla ese correo.
3. Tras verificarlo, la persona define una contraseña personal.
4. Los siguientes ingresos se realizan con correo y contraseña.
5. Si el dominio está aprobado, SIGMA asigna automáticamente el rol base de estudiante; OCRI designa directamente a los gestores externos. El administrador global es `ocri@unsaac.edu.pe` mediante un bootstrap técnico único.

El enlace por correo también se usa únicamente para recuperar una contraseña olvidada.

Mientras se desarrolla localmente, los enlaces no llegan a una bandeja de correo real: se revisan en Mailpit en `http://localhost:54324`. Este buzón de pruebas es parte de Supabase local y evita enviar correos reales durante las pruebas.

La explicación del flujo, roles, migraciones y responsabilidades de cada archivo está en [docs/13-guia-tecnica-login-y-datos.md](docs/13-guia-tecnica-login-y-datos.md).

La explicación detallada, migración por migración, está en [docs/14-diccionario-de-migraciones.md](docs/14-diccionario-de-migraciones.md).

Los cambios de convocatorias y postulaciones quedan guardados localmente en el navegador. El botón **Restablecer demo** recupera los datos iniciales.

## Alcance implementado

- Acceso simulado por rol y panel adaptado al perfil.
- Dashboard institucional con indicadores.
- CRUD local de convocatorias.
- SGMS: creación, listado, detalle, documentos y seguimiento.
- SGME: nominaciones, postulaciones entrantes y seguimiento.
- Revisión documental con aprobación y observaciones.
- Historial de estados por postulación.
- Reportes visuales y exportación CSV.
- Diseño adaptable a móvil y escritorio.
- Documentación funcional, modelo de datos, permisos y roadmap.
- Planificación de 21 semanas, metodología Scrum y product backlog en `docs/09-plan-semana-01.md`, `docs/10-plan-general-21-semanas.md` y `docs/11-product-backlog.md`.
- Informe de planificación de sprints en `docs/12-plan-de-sprints-sigma-ocri.docx`.

## Limitaciones de esta entrega

El inicio de sesión ya usa Supabase local. Las convocatorias, postulaciones y documentos todavía son datos de demostración guardados en el navegador; su migración a PostgreSQL y Storage corresponde a los siguientes sprints. No use documentos personales reales durante esta etapa.

## Estructura

```text
index.html              Aplicación
src/styles.css          Sistema visual
src/app.js              Estado, vistas y flujos
docs/                   Especificación funcional y técnica
  09-plan-semana-01.md  Planificación de prácticas — Semana 1
  10-plan-general-21-semanas.md  Plan de producto y sprints
  11-product-backlog.md Product backlog inicial
  12-plan-de-sprints-sigma-ocri.docx  Informe de planificación de sprints
```
