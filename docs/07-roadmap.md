# Roadmap de implementación

## Entrega actual — prototipo navegable

Dashboard por rol, convocatorias, SGMS, SGME, nominaciones, revisión documental, historial, reportes CSV y persistencia local.

## Etapa 1 — base productiva

Instalar Node.js LTS y Git; migrar vistas a Next.js con TypeScript; PostgreSQL y Prisma; Auth.js o Supabase Auth; migraciones, seed y pruebas. Criterio de salida: acceso real, RBAC del servidor y CRUD persistente.

## Etapa 2 — documentos

Storage privado, validación MIME/tamaño, antivirus, carga con URL firmada, versiones, revisión y subsanación. Criterio de salida: ningún archivo público y auditoría completa.

## Etapa 3 — SGMS/SGME completos

Evaluaciones, nominaciones institucionales, validación académica, cartas PDF, correo y estados finales.

## Etapa 4 — operación institucional

Excel/PDF, tableros históricos, QR verificable, copias de seguridad, observabilidad, pruebas de seguridad, accesibilidad y despliegue Docker.

## Decisiones pendientes con OCRI

- Fuente oficial de identidad institucional.
- Catálogo real de facultades, escuelas, convenios y periodos.
- Requisitos y transiciones autorizadas por tipo de movilidad.
- Política de retención documental y tratamiento de datos personales.
- Firmantes, numeración y plantillas oficiales de cartas.
