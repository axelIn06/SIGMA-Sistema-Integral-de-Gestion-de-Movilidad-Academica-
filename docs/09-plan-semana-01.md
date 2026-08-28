# Planificación de prácticas — Semana 1

## Contexto

Esta primera semana establece la base funcional y técnica de **SIGMA OCRI** (Sistema Integral de Gestión de Movilidad Académica), proyecto de prácticas preprofesionales para la Oficina de Cooperación y Relaciones Internacionales (OCRI) de la UNSAAC.

El trabajo se concentra en entender el proceso actual de movilidad académica, validar el alcance institucional y dejar un prototipo navegable que permita conversar con los usuarios antes de implementar la versión productiva.

## Objetivo de la semana

Levantar y organizar los requerimientos iniciales de movilidad saliente (SGMS) y entrante (SGME), definiendo roles, flujos, datos mínimos y un primer prototipo funcional para su validación con OCRI.

## Actividades planificadas

| Día | Actividad                                                                                                                            | Resultado esperado                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1   | Inducción al contexto de OCRI y revisión del proceso actual de movilidad.                                                            | Comprensión inicial de actores, documentos, convocatorias y puntos de control.                   |
| 2   | Identificación de usuarios, roles y permisos: administrador OCRI, evaluador, estudiante UNSAAC, gestor externo y estudiante externo. | Matriz preliminar de accesos y responsabilidades.                                                |
| 3   | Modelado de los flujos SGMS y SGME, desde la convocatoria/nominación hasta el cierre del expediente.                                 | Estados y transiciones iniciales por tipo de movilidad.                                          |
| 4   | Organización de módulos, entidades y reglas de negocio; definición de una arquitectura objetivo de monolito modular.                 | Especificación funcional y modelo de datos inicial.                                              |
| 5   | Construcción y revisión de un prototipo navegable con datos de demostración.                                                         | Prototipo para validar navegación, paneles, convocatorias, postulaciones, documentos y reportes. |

## Entregables y evidencias

- Documento de visión y alcance del sistema.
- Mapa de módulos compartidos y módulos SGMS/SGME.
- Flujos de movilidad saliente y entrante.
- Modelo de datos inicial y matriz de roles/permisos.
- Prototipo navegable de SIGMA OCRI con persistencia local de demostración.
- Registro de decisiones pendientes que deben validarse con OCRI.

Las evidencias se encuentran en los documentos `01` a `08` de este directorio y en el prototipo ubicado en la raíz del repositorio.

## Criterios de cierre

La semana se considera cerrada cuando OCRI pueda revisar el alcance inicial, los roles y flujos estén documentados, y exista una lista priorizada de validaciones para iniciar la implementación productiva.

## Riesgos y validaciones necesarias

- Confirmar la fuente de identidad institucional y el procedimiento de acceso de usuarios externos.
- Validar requisitos documentales, plazos y estados autorizados para cada tipo de convocatoria.
- Obtener los catálogos oficiales de facultades, escuelas, universidades con convenio y periodos académicos.
- Definir responsables de revisión, firma y emisión de cartas.
- Acordar la política de tratamiento, retención y acceso a documentos personales.

## Próxima semana propuesta

Priorizar los requisitos validados con OCRI, instalar y configurar el entorno productivo (Next.js, TypeScript, PostgreSQL y Prisma), y transformar el modelo inicial en una primera base de datos con autenticación y permisos del lado del servidor.
