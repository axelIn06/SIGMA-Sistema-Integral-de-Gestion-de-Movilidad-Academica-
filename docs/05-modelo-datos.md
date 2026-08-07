# Modelo de datos objetivo

Entidades principales: `User`, `Role`, `StudentProfile`, `ExternalStudentProfile`, `University`, `Faculty`, `School`, `Program`, `Call`, `CallRequirement`, `Application`, `DocumentType`, `ApplicationDocument`, `DocumentVersion`, `DocumentReview`, `ApplicationStatusHistory`, `Nomination`, `Evaluation`, `EvaluationCriterion`, `Letter`, `Notification` y `AuditLog`.

## Reglas centrales

- Una postulación pertenece a una convocatoria y a un estudiante.
- Una convocatoria declara requisitos documentales por dirección/tipo.
- Un documento conserva múltiples versiones; solo una es actual.
- Cada revisión registra autor, fecha, resultado y comentario.
- Cada transición de estado genera historial y auditoría.
- Los archivos se almacenan de forma privada; la base solo guarda metadatos y claves de objeto.
