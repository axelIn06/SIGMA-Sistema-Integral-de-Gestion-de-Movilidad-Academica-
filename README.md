# SIGMA OCRI

Sistema Integral de Gestión de Movilidad Académica de la OCRI UNSAAC.

## Seguimiento académico de prácticas

El desarrollo se documenta con dos referencias separadas: el avance técnico real del repositorio y el cronograma académico aprobado. Al 16 de septiembre de 2026, el cronograma ubica el trabajo en la **actividad 3: implementación del módulo de acceso y administración OCRI**.

- [Cronograma y seguimiento del plan](docs/plan-practicas-seguimiento.md)
- [Actividad 2: diseño funcional y arquitectura](docs/informe-actividad-02-diseno-funcional-arquitectura.md)
- [Trazabilidad del backlog por actividades](docs/backlog-planificado.md)

La clasificación académica no reemplaza la verificación técnica: una función se considera implementada únicamente cuando existe código versionado y evidencia de prueba.

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
