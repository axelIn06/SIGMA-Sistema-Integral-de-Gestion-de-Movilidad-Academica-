# Guía técnica de SIGMA

Documento operativo vigente del repositorio. La documentación académica y los entregables se
mantienen en el segundo informe de Google Docs y no se duplican aquí.

## Arquitectura

- Frontend: aplicación web modular en JavaScript, construida con Vite.
- Backend: Supabase Auth, PostgreSQL, Row Level Security y Storage.
- Backend remoto vigente: proyecto de Supabase **SIGMA - OCRI South America**.
- Procesamiento de brochures: lectura local de PDF en el navegador con `pdfjs-dist`; no usa IA ni
  servicios de pago.
- Descarga de expedientes: generación local de archivos ZIP con `jszip`.

El archivo `src/app.js` contiene la interfaz y la coordinación con Supabase. Las reglas reutilizables
de estados y postulaciones están centralizadas en `src/utils.js`; la extracción de brochures está en
`src/brochure-parser.js`.

## Entornos

| Comando              | Archivo local        | Uso                                     |
| -------------------- | -------------------- | --------------------------------------- |
| `npm run dev`        | `.env.mailpit.local` | Supabase CLI local y correos en Mailpit |
| `npm run dev:local`  | `.env.mailpit.local` | Supabase CLI local y correos en Mailpit |
| `npm run dev:remote` | `.env.remote.local`  | Desarrollo contra Supabase Cloud        |

Los archivos `.local` contienen credenciales y están ignorados por Git. Sus plantillas versionadas
son `.env.example`, `.env.mailpit.example` y `.env.remote.example`.

El `supabase/config.toml` configura solo la pila de Supabase CLI: su URL principal es
`http://localhost:5173` para que los mensajes de Mailpit vuelvan al servidor local. **No ejecutes
`supabase config push` contra Cloud con este archivo**, pues reemplazaría la URL de producción.
Cloud mantiene su propia configuración en el panel de Supabase: URL principal
`https://sigma-ocri.vercel.app` y redirecciones permitidas para Vercel y el desarrollo remoto.
El proyecto activo es **SIGMA - OCRI South America**, `nmpuumbslvsekavngjnm`, en São Paulo
(`sa-east-1`). Su API es `https://nmpuumbslvsekavngjnm.supabase.co`. El proyecto de Canadá,
`ynytfgycflolkgjdcmkq`, queda fuera del despliegue vigente; sus datos no se sincronizan con Brasil.

Vercel almacena `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` para el proyecto activo.
Son variables de compilación de Vite: cualquier cambio requiere un nuevo despliegue. Los archivos
`.env.*.local`, la documentación, los tests y el directorio `supabase/` no se suben con la CLI de
Vercel gracias a `.vercelignore`.

Los correos locales se consultan en Mailpit (`http://127.0.0.1:54324`). El proyecto Cloud aún
necesita un SMTP personalizado para enviar confirmaciones y recuperaciones a estudiantes reales;
el SMTP incorporado de Supabase está limitado a los miembros del equipo y a 2 correos por hora.
La URL del remitente y sus credenciales se configuran solo en Supabase Cloud, nunca en variables
`VITE_` ni en el repositorio.

## Base de datos

Las migraciones de `supabase/migrations/` son acumulativas y deben conservar su orden. No se deben
renombrar ni combinar después de haber sido aplicadas en un entorno compartido.

Flujo recomendado para comprobar desde cero una base local descartable:

```bash
npx supabase start
npx supabase db reset
npm test
npm run build
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

`db reset` elimina los datos del Supabase local antes de reconstruir el esquema. No lo ejecutes si
necesitas conservar perfiles o datos de prueba locales.

Antes de ejecutar `db push`, confirma que el proyecto enlazado sea **SIGMA - OCRI South America**.
El proyecto remoto anterior no forma parte del flujo vigente.

## Datos y archivos

Los registros operativos se guardan en PostgreSQL y los documentos en buckets privados de Storage.
Las descargas se realizan mediante URLs firmadas de duración limitada. Los perfiles, roles,
universidades, dominios autorizados y catálogo académico son datos maestros; convocatorias,
postulaciones, nominaciones, documentos e historiales son datos operativos.

## Verificación antes de publicar

```bash
npm install
npm test
npm run format:check
npm run build
```

Después del despliegue conviene validar al menos estos recorridos:

1. Inicio de sesión de OCRI, estudiante UNSAAC, gestor externo y estudiante externo.
2. Creación y publicación de una convocatoria.
3. Postulación saliente, revisión, nominación, carta de aceptación y documentación de retorno.
4. Nominación entrante, registro del estudiante, revisión OCRI y resultado.
5. Descarga individual de documentos y descarga ZIP del expediente.
