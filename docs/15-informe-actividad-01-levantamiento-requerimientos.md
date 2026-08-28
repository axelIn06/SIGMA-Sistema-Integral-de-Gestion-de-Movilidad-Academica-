# Informe de Actividad 01: levantamiento y análisis de requerimientos

**Proyecto:** SIGMA - Sistema Integral de Gestión de Movilidad Académica para la OCRI UNSAAC  
**Practicante:** Axel Barnaby Aranibar Rojas  
**Área:** Oficina de Cooperación y Relaciones Internacionales (OCRI)  
**Periodo de la actividad:** 07/08/2026 al 23/08/2026  
**Actividad del plan:** Levantamiento de requerimientos y análisis del proceso de movilidad académica.

## 1. Propósito

Esta primera actividad tuvo como propósito comprender y estructurar los procesos de movilidad académica saliente y entrante atendidos por la OCRI. A partir de ello se definió el alcance inicial de SIGMA, los actores, la información que se administra, los documentos requeridos y las reglas de acceso que debe respetar la futura plataforma.

El resultado no es todavía un sistema completo: es una base funcional y documental que permitirá construir los siguientes módulos de forma ordenada, verificable y segura.

## 2. Procesos analizados

### 2.1. Movilidad saliente - SGMS

Corresponde a estudiantes UNSAAC que postulan a una universidad de destino mediante una convocatoria activa.

1. El estudiante consulta las convocatorias y destinos habilitados.
2. Completa su perfil y genera una postulación en borrador.
3. El sistema presenta los requisitos documentales de la convocatoria.
4. El estudiante carga documentos y envía su expediente.
5. OCRI revisa, aprueba u observa los documentos; el estudiante puede subsanar las observaciones.
6. OCRI registra la decisión y realiza el seguimiento hasta el cierre del expediente.

Estados identificados: `BORRADOR`, `POSTULADO`, `EN_REVISION_DOCUMENTAL`, `OBSERVADO`, `SUBSANADO`, `APROBADO_OCRI`, `ENVIADO_A_UNIVERSIDAD_DESTINO`, `ACEPTADO`, `RECHAZADO` y `FINALIZADO`.

### 2.2. Movilidad entrante - SGME

Corresponde a estudiantes procedentes de universidades asociadas que son nominados para realizar movilidad en la UNSAAC.

1. El gestor externo de la universidad de origen registra una nominación.
2. El estudiante recibe la invitación y crea su cuenta con correo universitario aprobado.
3. Completa su perfil, actividad académica y documentos requeridos.
4. OCRI revisa administrativamente el expediente.
5. Se realiza la validación académica y se registra la decisión.
6. OCRI emite la carta de aceptación y realiza el seguimiento de llegada y cierre.

Estados identificados: `NOMINADO`, `REGISTRO_PENDIENTE`, `POSTULACION_ENVIADA`, `EN_REVISION_OCRI`, `OBSERVADO`, `VALIDACION_ACADEMICA`, `APROBADO`, `CARTA_ACEPTACION_EMITIDA`, `CONFIRMADO`, `EN_MOVILIDAD` y `FINALIZADO`.

## 3. Actores y necesidades

| Actor              | Necesidad principal                                                            | Respuesta planteada en SIGMA                                                                       |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Estudiante UNSAAC  | Conocer oportunidades y seguir su postulación saliente.                        | Módulo SGMS con convocatorias, requisitos, documentos, observaciones y estado del expediente.      |
| Estudiante externo | Completar su proceso entrante después de ser nominado.                         | Módulo SGME con perfil, documentos, seguimiento y notificaciones de su expediente.                 |
| Gestor externo     | Nominar estudiantes de su universidad sin acceder a otras instituciones.       | Panel limitado a nominaciones y expedientes de su propia universidad.                              |
| Administrador OCRI | Mantener el control transversal de movilidad y de los accesos institucionales. | Panel OCRI para universidades, dominios, gestores, convocatorias, requisitos, revisión y reportes. |

## 4. Información y documentos identificados

La revisión inicial identificó los siguientes grupos de información:

- Datos de identidad y contacto del estudiante.
- Universidad de origen o destino, país y periodo académico.
- Convocatoria, plazas, fechas, requisitos y estado de publicación.
- Expediente de postulación y trazabilidad de sus cambios.
- Nominación, cuando se trata de movilidad entrante.
- Historial de estados, observaciones y decisiones.

Los documentos iniciales más frecuentes son: documento de identidad o pasaporte, récord académico, constancia de matrícula, carta de motivación, carta de nominación y seguro internacional. La convocatoria definirá cuáles son obligatorios, opcionales o específicos de un destino.

## 5. Requerimientos priorizados

### Funcionales

- Registrar y autenticar cuentas con correo de universidades asociadas.
- Verificar el correo una vez y usar contraseña personal para ingresos posteriores.
- Asignar automáticamente el rol base de estudiante según el dominio aprobado.
- Permitir que OCRI registre universidades, dominios institucionales y gestores externos.
- Gestionar convocatorias diferenciadas para SGMS y SGME.
- Registrar postulaciones, documentos, observaciones e historial de estados.
- Permitir nominaciones SGME restringidas a la universidad del gestor externo.
- Generar reportes institucionales por periodo, universidad, país y estado.

### No funcionales y reglas de negocio

- Solo se aceptan registros con dominios institucionales de universidades vinculadas a la UNSAAC.
- La autorización se controla en el servidor mediante roles y políticas por fila (RLS).
- Las contraseñas no se almacenan en las tablas de SIGMA; las gestiona Supabase Auth.
- Cada modificación relevante de un expediente debe conservar trazabilidad.
- Los documentos deberán almacenarse de forma privada y con acceso temporal autorizado.
- SGMS y SGME comparten componentes institucionales, pero mantienen flujos y permisos separados.

## 6. Productos obtenidos en la actividad

1. Visión del sistema y objetivos de SIGMA.
2. Identificación de módulos compartidos, SGMS, SGME y administración OCRI.
3. Diagramación narrativa de ambos flujos operativos y sus estados.
4. Definición de actores, cuatro roles operativos y límites de acceso.
5. Modelo de datos objetivo y reglas de trazabilidad documental.
6. Backlog inicial, plan de sprints y planificación general de prácticas.
7. Prototipo inicial de autenticación con Supabase local y Mailpit para validar correos de prueba.

## 7. Conclusión y siguiente actividad

El levantamiento permitió separar claramente la movilidad saliente (SGMS) de la movilidad entrante (SGME), evitando que ambos procesos se mezclen en una misma interfaz o en permisos demasiado amplios. También definió que OCRI mantiene el control de universidades, dominios y gestores externos, mientras que los estudiantes obtienen acceso base solo después de verificar un correo universitario autorizado.

Con esta base se continúa con la siguiente actividad del plan: **diseño funcional y arquitectura de SIGMA**, donde se formalizarán las pantallas, los casos de uso, el modelo de datos y la arquitectura tecnológica antes de ampliar la implementación.

## 8. Evidencias y anexos del repositorio

| Evidencia                             | Archivo                                            |
| ------------------------------------- | -------------------------------------------------- |
| Visión y objetivos                    | `docs/01-vision.md`                                |
| Módulos y estados                     | `docs/02-modulos.md`                               |
| Flujo SGMS                            | `docs/03-flujos-sgms.md`                           |
| Flujo SGME                            | `docs/04-flujos-sgme.md`                           |
| Modelo de datos objetivo              | `docs/05-modelo-datos.md`                          |
| Roles y permisos vigentes             | `docs/06-permisos-roles.md`                        |
| Roadmap y backlog                     | `docs/07-roadmap.md`, `docs/11-product-backlog.md` |
| Guía de autenticación y entorno local | `docs/13-guia-tecnica-login-y-datos.md`            |
