# SIGMA OCRI

Sistema Integral de Gestión de Movilidad Académica para la OCRI UNSAAC.

Esta entrega incluye autenticación, perfiles, convocatorias y borradores de postulación SGMS conectados a Supabase. Las nominaciones SGME y la revisión administrativa continúan como prototipo hasta sus siguientes historias de usuario.

## Entornos local y remoto

SIGMA usa el mismo código y las mismas migraciones en dos entornos separados:

| Entorno          | Frontend          | Base de datos y Auth             | Variables                      |
| ---------------- | ----------------- | -------------------------------- | ------------------------------ |
| Desarrollo local | Vite en el equipo | Supabase CLI en Docker y Mailpit | `.env.mailpit.local`           |
| Remoto           | Vercel            | Proyecto Supabase Cloud          | Variables de entorno de Vercel |

Los registros de la base local nunca se copian a GitHub. Git contiene las
migraciones que permiten reproducir el esquema; cada migración se aplica al
entorno remoto de forma deliberada después de probarla localmente.

## Ejecutar en local

Para trabajar sin límites de correo, use el stack local de Supabase y Mailpit:

```bash
cp .env.mailpit.example .env.mailpit.local
supabase start
npm run dev:local
```

Abra la dirección que indique Vite, normalmente `http://localhost:5173`, y
revise los correos de registro o recuperación en Mailpit:
`http://localhost:54324`.

Para probar desde el equipo contra Supabase Cloud (sin Mailpit), copie
`.env.remote.example` como `.env.remote.local`, complete sus valores y ejecute
`npm run dev:remote`. Vercel utiliza esas mismas dos variables configuradas en
su panel y no lee los archivos `.env.*.local` del equipo.

El repositorio está vinculado al proyecto remoto mediante Supabase CLI. Los
cambios permanentes del esquema deben guardarse como migraciones y desplegarse
de forma explícita:

```bash
supabase migration new nombre_del_cambio
supabase db push --dry-run
supabase db push
```

`git push` actualiza GitHub y puede activar una nueva compilación de Vercel,
pero **no copia la base local ni aplica por sí solo las migraciones a Supabase
Cloud**. Ese despliegue de esquema se revisa y ejecuta por separado.

Docker es necesario únicamente para `dev:local`; puede detener el stack al
terminar:

```bash
supabase stop
```

Las cuentas usan Supabase Auth con este flujo:

1. La persona crea su cuenta con su correo universitario.
2. SIGMA envía un enlace de verificación para comprobar que controla ese correo.
3. Tras verificarlo, la persona define una contraseña personal.
4. Los siguientes ingresos se realizan con correo y contraseña.
5. Si el dominio está aprobado, SIGMA asigna automáticamente el rol base de estudiante; OCRI designa directamente a los gestores externos. El administrador global es `ocri@unsaac.edu.pe` mediante un bootstrap técnico único.

El enlace por correo también se usa únicamente para recuperar una contraseña olvidada.

Cuando se utiliza el stack local, los enlaces no llegan a una bandeja de correo
real: se revisan en Mailpit en `http://localhost:54324`. En el proyecto remoto,
Supabase Auth utiliza su proveedor de correo configurado y las URL permitidas
en el panel de autenticación.

La explicación del flujo, roles, migraciones y responsabilidades de cada archivo está en [docs/13-guia-tecnica-login-y-datos.md](docs/13-guia-tecnica-login-y-datos.md).

La explicación detallada, migración por migración, está en [docs/14-diccionario-de-migraciones.md](docs/14-diccionario-de-migraciones.md).

## Alcance implementado

- Acceso real con Supabase Auth y panel adaptado al rol.
- Perfil editable con foto privada, teléfono y dirección.
- Dashboard institucional con indicadores.
- Creación, edición, publicación y eliminación de convocatorias en PostgreSQL.
- Portadas y materiales descargables almacenados en Supabase Storage.
- Consulta estudiantil de convocatorias, requisitos, materiales y enlaces.
- Borradores privados de postulación SGMS que pueden continuarse posteriormente.
- Carga privada de documentos y validación del expediente antes de enviarlo a OCRI.
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

Las postulaciones salientes y sus documentos ya se almacenan en Supabase con RLS y un bucket privado. Las nominaciones SGME, las postulaciones entrantes y la revisión administrativa todavía conservan partes de prototipo local y no deben utilizarse como flujo operativo final.

## Estructura

```text
index.html              Aplicación
src/styles.css          Sistema visual
src/app.js              Estado, vistas y flujos
src/assets/             Imágenes institucionales utilizadas por Vite
supabase/migrations/    Esquema reproducible de identidad, convocatorias y postulaciones
docs/                   Especificación funcional y técnica
  09-plan-semana-01.md  Planificación de prácticas — Semana 1
  10-plan-general-21-semanas.md  Plan de producto y sprints
  11-product-backlog.md Product backlog inicial
  12-plan-de-sprints-sigma-ocri.docx  Informe de planificación de sprints
output/primera-etapa/   Entregables editables del primer informe de prácticas
```
