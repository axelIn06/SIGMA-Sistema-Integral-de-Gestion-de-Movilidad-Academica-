# Product backlog inicial — SIGMA OCRI

## Uso del backlog

Este es el backlog inicial, no un contrato cerrado. El Product Owner (OCRI) lo debe reordenar después de cada revisión de sprint. Las historias se consideran terminadas solo cuando cumplen sus criterios de aceptación, están probadas y pueden demostrarse.

Prioridad: **P0** imprescindible para la primera versión utilizable; **P1** importante; **P2** mejora posterior.

| ID    | Épica          | Historia de usuario                                                                    | Prioridad | Sprint objetivo | Criterio de aceptación resumido                                                                              |
| ----- | -------------- | -------------------------------------------------------------------------------------- | --------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| US-01 | Acceso         | Como usuario, quiero iniciar sesión para acceder solo a mis funciones.                 | P0        | S1              | **Hecho localmente:** identidad autenticada, sesión, cierre, verificación inicial de correo y contraseña.    |
| US-02 | Acceso         | Como administrador, quiero asignar roles para controlar el acceso.                     | P0        | S1              | **Hecho localmente:** roles automáticos por dominio, administración OCRI y funciones protegidas en servidor. |
| US-03 | Catálogos      | Como administrador, quiero administrar periodos, universidades, facultades y escuelas. | P1        | S2/S8           | CRUD validado; catálogos disponibles en formularios.                                                         |
| US-04 | Convocatorias  | Como administrador, quiero crear convocatorias por tipo de movilidad.                  | P0        | S2              | **Implementada localmente:** periodo, fecha límite, portada, dirección, estado y edición posterior.          |
| US-05 | Requisitos     | Como administrador, quiero definir requisitos por convocatoria.                        | P0        | S2              | **Implementada localmente:** condiciones, documentos solicitados, materiales OCRI y enlaces.                 |
| US-06 | Consulta       | Como estudiante, quiero ver convocatorias activas y sus requisitos.                    | P0        | S2              | **Hecho localmente:** catálogo por rol, detalle, materiales, enlaces y acceso directo a postular.            |
| US-07 | SGMS           | Como estudiante UNSAAC, quiero completar mi perfil académico.                          | P0        | S3              | **Parcial:** foto y contacto en perfil; datos académicos se capturan en el borrador y falta su catálogo.     |
| US-08 | SGMS           | Como estudiante UNSAAC, quiero crear un borrador de postulación saliente.              | P0        | S3              | **Hecho localmente:** borrador privado en Supabase, cuatro etapas, documentos y continuación posterior.      |
| US-09 | SGMS           | Como estudiante UNSAAC, quiero enviar mi postulación al completar requisitos.          | P0        | S3              | El sistema bloquea envío si faltan datos/documentos obligatorios.                                            |
| US-10 | Documentos     | Como postulante, quiero cargar documentos privados.                                    | P0        | S4              | Se validan tipo/tamaño; archivo no es público.                                                               |
| US-11 | Documentos     | Como evaluador, quiero revisar cada documento y dejar observaciones.                   | P0        | S4              | Quedan resultado, comentario, fecha y responsable.                                                           |
| US-12 | Documentos     | Como postulante, quiero subsanar un documento observado.                               | P0        | S4              | Se conserva la versión anterior y se registra la nueva.                                                      |
| US-13 | Evaluación     | Como evaluador OCRI, quiero ver expedientes asignados y emitir decisión.               | P0        | S5              | Solo accede a los asignados; decisión queda trazable.                                                        |
| US-14 | Seguimiento    | Como estudiante UNSAAC, quiero consultar el estado e historial de mi expediente.       | P0        | S5              | Ve estado actual, fechas y observaciones autorizadas.                                                        |
| US-15 | Notificaciones | Como usuario, quiero recibir avisos sobre acciones importantes.                        | P1        | S5              | Se genera aviso por observación, decisión y cambio de estado.                                                |
| US-16 | SGME           | Como gestor externo, quiero registrar nominaciones de mi universidad.                  | P0        | S6              | Solo puede ver y administrar nominaciones de su institución.                                                 |
| US-17 | SGME           | Como estudiante externo, quiero completar una postulación desde mi nominación.         | P0        | S6              | Invitación vinculada a nominación; no permite duplicados.                                                    |
| US-18 | SGME           | Como facultad/evaluador, quiero validar académicamente una postulación entrante.       | P0        | S7              | Registra responsable, decisión, comentario y transición válida.                                              |
| US-19 | Cartas         | Como OCRI, quiero emitir una carta de aceptación desde una plantilla.                  | P1        | S7              | Carta contiene datos del expediente, numeración y trazabilidad.                                              |
| US-20 | Administración | Como administrador, quiero consultar la auditoría de acciones sensibles.               | P1        | S8              | Registra autor, fecha, acción y entidad afectada.                                                            |
| US-21 | Reportes       | Como administrador, quiero filtrar y exportar indicadores institucionales.             | P1        | S8              | Reporte por periodo/dirección/estado; exportación autorizada.                                                |
| US-22 | Seguridad      | Como institución, quiero proteger datos y documentos personales.                       | P0        | S9              | Pruebas de autorización, validación y acceso privado superadas.                                              |
| US-23 | Calidad        | Como usuario, quiero una interfaz accesible y clara en móvil y escritorio.             | P1        | S9              | Flujo crítico probado en ambos tamaños y sin errores bloqueantes.                                            |
| US-24 | Operación      | Como OCRI, quiero una guía de uso y respaldo del sistema.                              | P1        | S9/Cierre       | Manual, procedimiento de respaldo y recuperación documentados.                                               |

## Orden sugerido para la primera planificación

`US-01`, `US-02`, `US-04`, `US-05`, `US-06` y `US-08` están implementadas y verificadas localmente. El siguiente refinamiento corresponde a `US-07` (catálogos académicos) y `US-09` (reglas finales de envío y recepción administrativa).

## Plantilla de sprint backlog

Al iniciar cada sprint, copiar solo las historias seleccionadas a una tabla de trabajo como esta:

| Historia | Tarea técnica                          | Estado                                     | Evidencia                            |
| -------- | -------------------------------------- | ------------------------------------------ | ------------------------------------ |
| US-XX    | Describir tarea pequeña y verificable. | Pendiente / En curso / En revisión / Hecho | Enlace a PR, prueba, captura o acta. |
