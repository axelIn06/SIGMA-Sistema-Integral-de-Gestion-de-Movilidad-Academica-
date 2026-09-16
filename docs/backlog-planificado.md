# Trazabilidad del backlog por actividades

## Propósito

El backlog se utiliza como puente entre los requerimientos, el diseño y la implementación. La inclusión de una historia en una actividad significa que esa etapa la analiza, diseña o implementa según corresponda; no significa automáticamente que esté terminada.

## Agrupación de historias

| Bloque                        | Historias   | Diseño cubierto                                                  | Actividad principal de implementación |
| ----------------------------- | ----------- | ---------------------------------------------------------------- | ------------------------------------- |
| Acceso y administración       | US01 a US02 | Identidad, sesión, perfiles, roles y permisos.                   | Actividad 3                           |
| Convocatorias y configuración | US03 a US06 | Catálogos, publicación, requisitos y consulta.                   | Actividades 3 y 4                     |
| Movilidad saliente SGMS       | US07 a US15 | Perfil, postulación, documentos, revisión, cartas y seguimiento. | Actividad 4                           |
| Movilidad entrante SGME       | US16 a US19 | Nominación, postulación externa, validación y cartas.            | Actividad 5                           |
| Calidad, reportes y operación | US20 a US24 | Auditoría, reportes, seguridad, accesibilidad y operación.       | Actividades 6 y 7                     |

## Lectura por informe

- Informe 1: identifica actores, necesidades, procesos y backlog inicial.
- Informe 2: demuestra que las historias tienen roles, permisos, flujos, datos y componentes técnicos definidos.
- Informes 3, 4 y 5: adjuntan código y pruebas de las historias implementadas en acceso, SGMS y SGME.
- Informe 6: presenta reportes, seguimiento y mejoras de usabilidad.
- Informe 7: consolida pruebas, incidencias, documentación y entrega final.

## Estados recomendados

Para evitar confundir planificación con avance técnico, cada historia debería utilizar estados explícitos:

- `Planificada`: incorporada al cronograma.
- `Diseñada`: cuenta con flujo, reglas, datos y criterios de aceptación definidos.
- `En desarrollo`: existe trabajo técnico activo.
- `Implementada`: el código está versionado y la función puede ejecutarse.
- `Validada`: cuenta con evidencia de prueba y aceptación.

Al cierre de la actividad 2, el estado académico esperado es `Diseñada`. La condición `Implementada` o `Validada` debe sustentarse con código, migraciones y pruebas, aunque el desarrollo se haya adelantado respecto del cronograma.
