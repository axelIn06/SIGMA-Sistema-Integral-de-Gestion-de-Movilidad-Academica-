# SIGMA OCRI

Sistema Integral de Gestión de Movilidad Académica de la OCRI UNSAAC.

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
npm run format:check
npm run build
```

Las migraciones están en `supabase/migrations`. Antes de desplegarlas:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
```
