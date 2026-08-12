# Plan general de prácticas — 21 semanas

## Enfoque de trabajo

SIGMA OCRI se desarrollará con **Scrum adaptado a prácticas preprofesionales**. El ciclo de planificación y priorización será de dos semanas; sin embargo, al terminar cada semana se realizará una demostración breve del software o de un avance verificable a la contraparte de OCRI. Así se evita esperar hasta el final para recibir observaciones.

El prototipo actual es la línea de partida. El objetivo no es desarrollar todas las funcionalidades a la vez: primero se construye una versión utilizable de SGMS, después SGME y finalmente se fortalece seguridad, calidad y despliegue.

## Participantes y responsabilidades

| Participante | Rol Scrum adaptado | Responsabilidad |
| --- | --- | --- |
| Responsable de OCRI | Product Owner | Prioriza necesidades, valida flujos y acepta entregables. |
| Practicante | Equipo de desarrollo | Analiza, diseña, implementa, prueba y documenta. |
| Asesor de prácticas | Facilitador / revisor | Da seguimiento académico, ayuda a remover impedimentos y revisa evidencias. |
| Usuarios piloto | Stakeholders | Prueban los flujos y proporcionan retroalimentación. |

## Ritmo de cada sprint

1. **Planificación (inicio de la semana impar):** revisar el backlog, seleccionar historias, definir criterio de aceptación y una meta concreta.
2. **Trabajo diario:** actualizar tareas, registrar bloqueos y mantener el código/documentación versionados.
3. **Demostración semanal:** mostrar software ejecutable, pruebas, prototipos o documentos aprobables; registrar observaciones.
4. **Revisión de sprint (fin de la semana par):** aceptar o devolver historias y reordenar el backlog con OCRI.
5. **Retrospectiva breve:** indicar qué funcionó, qué debe corregirse y una mejora accionable para el siguiente sprint.

## Esquema semanal

| Semana | Sprint / objetivo | Trabajo principal | Evidencia o demostración |
| --- | --- | --- | --- |
| 1 | S0 · Descubrimiento | Levantar procesos, actores, roles, flujos y alcance; revisar el prototipo. | Visión, flujos, modelo inicial y prototipo navegable. |
| 2 | S0 · Base preparada | Validar requerimientos con OCRI, priorizar backlog, preparar repositorio y entorno. | Backlog aprobado y entorno de desarrollo listo. |
| 3 | S1 · Fundamentos | Crear estructura Next.js/TypeScript, diseño base, PostgreSQL/Prisma y datos semilla. | Aplicación ejecutable con navegación y base de datos local. |
| 4 | S1 · Acceso seguro | Implementar autenticación, perfiles y autorización inicial por rol. | Inicio de sesión y panel protegido por rol. |
| 5 | S2 · Convocatorias | Gestionar periodos, universidades, convocatorias y requisitos documentales. | Administrador crea y publica una convocatoria. |
| 6 | S2 · Consulta pública | Mostrar convocatorias activas y detalles según movilidad saliente/entrante. | Estudiante consulta requisitos y plazos reales de prueba. |
| 7 | S3 · SGMS: postulación | Crear perfil UNSAAC y borrador de postulación saliente. | Estudiante crea, edita y guarda su expediente SGMS. |
| 8 | S3 · SGMS: envío | Validar campos, checklist y envío de postulación; registrar historial. | Expediente SGMS pasa de borrador a postulado. |
| 9 | S4 · Documentos | Carga privada, validación de formato/tamaño y metadatos de documentos. | Usuario adjunta documentos al expediente de prueba. |
| 10 | S4 · Revisión documental | Aprobar, observar o rechazar documentos; permitir subsanación y versiones. | Evaluador revisa; estudiante ve y responde observaciones. |
| 11 | S5 · Evaluación SGMS | Bandeja de evaluador, asignación, criterios y decisiones de expediente. | OCRI evalúa un expediente saliente de extremo a extremo. |
| 12 | S5 · Seguimiento SGMS | Estados, notificaciones internas y vista de seguimiento del estudiante. | Flujo SGMS demostrable desde convocatoria hasta decisión OCRI. |
| 13 | S6 · SGME: nominaciones | Registrar universidades de origen, gestor externo y nominaciones. | Gestor externo nomina un estudiante sin ver otras instituciones. |
| 14 | S6 · SGME: postulación | Registro del estudiante externo, perfil, actividad académica y expediente entrante. | Postulación SGME creada desde una nominación. |
| 15 | S7 · Validación entrante | Revisión OCRI y validación académica de facultad/escuela. | Expediente SGME con estados y responsables trazables. |
| 16 | S7 · Resultado y cartas | Confirmación, carta de aceptación con plantilla y registro de emisión. | Carta de prueba generada y disponible solo al destinatario autorizado. |
| 17 | S8 · Administración | Gestión de usuarios, roles, catálogos y auditoría de acciones sensibles. | Administrador configura catálogos y consulta auditoría. |
| 18 | S8 · Reportes | Indicadores, filtros y exportación controlada de datos institucionales. | Reportes de prueba por periodo, movilidad, estado y universidad. |
| 19 | S9 · Calidad y seguridad | Pruebas funcionales, permisos, validaciones, accesibilidad y manejo de errores. | Matriz de pruebas ejecutada y hallazgos corregidos. |
| 20 | S9 · Piloto y estabilización | Prueba con usuarios piloto, corrección de incidencias y documentación de operación. | Versión candidata y acta de retroalimentación del piloto. |
| 21 | Cierre | Despliegue o demostración final, transferencia, informe y backlog posterior. | Entrega final, manual breve, resultados y plan de continuidad. |

## Hitos de producto

- **Semana 4:** plataforma base con acceso y roles.
- **Semana 8:** primera versión demostrable de SGMS para crear y enviar postulaciones.
- **Semana 12:** SGMS completo para el circuito de OCRI.
- **Semana 16:** SGME y cartas de aceptación demostrables.
- **Semana 20:** versión piloto validada.
- **Semana 21:** cierre técnico y académico.

## Avance registrado — Sprint 1 / Día 1 y Día 2

El Sprint 1 se adelantó respecto al plan inicial: en lugar de iniciar con una simulación de acceso, se construyó y probó una base de autenticación real en Supabase local. Este avance cubre `US-01` y `US-02` en entorno de desarrollo; queda pendiente publicarlo en Supabase Cloud y ejecutar pruebas de aceptación con OCRI.

### Trabajo realizado

- Se inicializó Supabase CLI y Docker para ejecutar PostgreSQL, Auth, Studio y Mailpit localmente.
- Se creó el esquema de identidad: perfiles, roles, universidades, dominios institucionales, RLS y funciones administrativas.
- Se definieron cuatro roles operativos: `ADMIN_OCRI`, `ESTUDIANTE_UNSAAC`, `ESTUDIANTE_EXTERNO` y `GESTOR_EXTERNO`.
- Se registró el administrador funcional global `ocri@unsaac.edu.pe` mediante un bootstrap técnico único.
- Se implementó el flujo de cuenta: dominio aprobado → enlace de verificación → contraseña personal → acceso posterior con correo y contraseña.
- Se restringió el registro: Gmail y dominios sin universidad asociada no reciben enlace ni crean cuenta.
- Se automatizó el rol base de estudiante para cuentas verificadas de dominios aprobados; OCRI designa directamente a los gestores externos.
- Se creó el panel **Administración OCRI → Accesos y universidades** para registrar instituciones/dominios y designar gestores externos.
- Se separó visualmente SGMS, SGME y Administración OCRI; el gestor externo ve solo su universidad y sus procesos SGME.
- Se documentaron el flujo técnico, la seguridad y el propósito de cada migración.

### Evidencias verificadas

- `npm run build` completa sin errores.
- `supabase db lint --local` no reporta errores de esquema.
- Se crearon, confirmaron y limpiaron cuentas de prueba; solo se conserva la cuenta administradora local.
- Se verificó la creación automática de perfiles y la asignación automática de rol para el dominio UNSAAC.

### Siguiente incremento

El Sprint 2 inicia con `US-04`, `US-05` y `US-06`. Se migrarán convocatorias y requisitos del prototipo a PostgreSQL, se aplicarán políticas RLS y se mostrará a estudiantes únicamente las convocatorias publicadas, vigentes y compatibles con su tipo de movilidad.

## Qué presentar cada semana

En cada demostración se debe presentar: objetivo de la semana, historias terminadas, recorrido de usuario en el software, pruebas realizadas, observaciones recibidas, bloqueos y objetivo de la siguiente semana. Las historias no aceptadas regresan al backlog; no se consideran terminadas solo por estar programadas.

## Artefactos que se actualizarán durante las prácticas

- Product backlog: [11-product-backlog.md](11-product-backlog.md).
- Sprint backlog: tareas seleccionadas para el sprint activo, con estado y responsable.
- Incremento: versión ejecutable que cumple criterios de aceptación.
- Registro de revisión: decisiones y observaciones de OCRI por semana.
- Bitácora de prácticas: actividades realizadas, horas, evidencias y aprendizajes.

## Criterio de término del proyecto

Se considera una entrega satisfactoria si los roles autorizados pueden ejecutar los flujos priorizados de SGMS y SGME con datos de prueba, los accesos y documentos están protegidos, los resultados son trazables, la contraparte revisó el piloto y quedan documentados el uso, las limitaciones y las mejoras futuras.
