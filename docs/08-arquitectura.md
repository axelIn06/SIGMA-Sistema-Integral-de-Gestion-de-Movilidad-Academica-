# Arquitectura productiva propuesta

Monolito modular con Next.js/TypeScript. Los módulos de dominio serán `auth`, `users`, `convocatorias`, `movilidad-saliente`, `movilidad-entrante`, `documentos`, `evaluacion`, `cartas`, `notificaciones` y `reportes`.

PostgreSQL será la fuente de verdad y Prisma administrará modelos y migraciones. Los archivos vivirán en almacenamiento privado S3/Supabase. Las operaciones de servidor comprobarán identidad, rol y propiedad del expediente. Un adaptador separará correo, almacenamiento y generación PDF para facilitar un despliegue institucional posterior.

## Seguridad mínima antes de producción

RBAC de servidor, RLS si se usa Supabase, rate limiting, CSP, cookies seguras, CSRF en mutaciones, validación Zod, límites de archivos, verificación de contenido, cifrado en tránsito y reposo, backups probados, logs sin datos sensibles y auditoría inmutable.
