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

El proyecto remoto vigente es **SIGMA - OCRI South America**. Antes de aplicar migraciones,
comprueba con `npx supabase projects list` que el enlace local apunte a ese proyecto.
