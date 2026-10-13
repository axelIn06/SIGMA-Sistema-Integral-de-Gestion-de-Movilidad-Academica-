# SIGMA OCRI

Sistema Integral de Gestión de Movilidad Académica de la OCRI UNSAAC.

La guía técnica vigente está en [docs/guia-tecnica.md](docs/guia-tecnica.md). La documentación
académica del proyecto se mantiene por separado en el segundo informe de Google Docs.

## Desarrollo

```bash
npm install
npm run dev
```

La aplicación usa Vite y Supabase. Variables necesarias:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Para ejecutar contra Supabase local y Mailpit:

```bash
npm run dev:local
```

`npm run dev` también usa el entorno local. Solo `npm run dev:remote` apunta a Supabase
Cloud durante el desarrollo. En Vercel, las variables `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY` deben configurarse para Producción y el proyecto debe
volver a desplegarse después de cambiarlas; los archivos `.env.*.local` no se publican.

## Verificación

```bash
npm test
npm run format:check
npm run build
```

Las migraciones están en `supabase/migrations`. Antes de desplegarlas:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

El proyecto remoto vigente es **SIGMA - OCRI South America**, en São Paulo (`sa-east-1`),
con identificador `nmpuumbslvsekavngjnm`. La web publicada es https://sigma-ocri.vercel.app.
Antes de aplicar migraciones, comprueba con `npx supabase projects list` que el enlace local
apunte a ese proyecto. Para enlazar un nuevo equipo:

```bash
supabase link --project-ref nmpuumbslvsekavngjnm
```
