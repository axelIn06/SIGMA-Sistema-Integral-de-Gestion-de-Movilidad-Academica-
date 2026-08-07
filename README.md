# SIGMA OCRI

Sistema Integral de Gestión de Movilidad Académica para la OCRI UNSAAC.

Esta primera entrega es un prototipo funcional sin dependencias externas. Incluye los módulos SGMS (movilidad saliente), SGME (movilidad entrante) y Panel OCRI, con persistencia en `localStorage`. Se puede ejecutar aun cuando el equipo no tenga Node.js instalado.

## Ejecutar

Abra `index.html` en un navegador moderno. En Windows también puede hacer doble clic en el archivo.

Perfiles de demostración disponibles desde la pantalla de acceso:

- Administrador OCRI
- Evaluador OCRI
- Alumno UNSAAC
- Estudiante externo

Los cambios de convocatorias y postulaciones quedan guardados localmente en el navegador. El botón **Restablecer demo** recupera los datos iniciales.

## Alcance implementado

- Acceso simulado por rol y panel adaptado al perfil.
- Dashboard institucional con indicadores.
- CRUD local de convocatorias.
- SGMS: creación, listado, detalle, documentos y seguimiento.
- SGME: nominaciones, postulaciones entrantes y seguimiento.
- Revisión documental con aprobación y observaciones.
- Historial de estados por postulación.
- Reportes visuales y exportación CSV.
- Diseño adaptable a móvil y escritorio.
- Documentación funcional, modelo de datos, permisos y roadmap.
- Planificación de 21 semanas, metodología Scrum y product backlog en `docs/09-plan-semana-01.md`, `docs/10-plan-general-21-semanas.md` y `docs/11-product-backlog.md`.
- Informe de planificación de sprints en `docs/12-plan-de-sprints-sigma-ocri.docx`.

## Limitaciones de esta entrega

El equipo no dispone actualmente de Node.js, npm ni Git. Por ello, autenticación real, PostgreSQL/Prisma, almacenamiento privado, envío de correos y generación PDF quedan definidos como siguiente etapa de integración. El prototipo no debe usarse con documentos personales reales: todo se almacena únicamente en el navegador.

## Estructura

```text
index.html              Aplicación
src/styles.css          Sistema visual
src/app.js              Estado, vistas y flujos
docs/                   Especificación funcional y técnica
  09-plan-semana-01.md  Planificación de prácticas — Semana 1
  10-plan-general-21-semanas.md  Plan de producto y sprints
  11-product-backlog.md Product backlog inicial
  12-plan-de-sprints-sigma-ocri.docx  Informe de planificación de sprints
```
