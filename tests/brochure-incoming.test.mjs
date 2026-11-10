import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBrochureContent } from '../src/brochure-parser.js';

// Texto representativo del brochure UNSAAC 2026-II: marcas de agua y saltos reales.
const pages = [
  {
    pageNumber: 1,
    lines: [
      'CONVOCATORIA',
      'PROGRAMA DE',
      'MOVILIDAD',
      'ESTUDIANTIL ENTRANTE',
      'NACIONAL',
      '2026-II',
      'U N S A A C U N S A A C',
      'OCRI',
    ],
  },
  {
    pageNumber: 2,
    lines: [
      'REQUISITOS',
      'Estar matriculado en la',
      'universidad de origen y',
      'ser alumno regular.',
      'U N S A A C',
      'Encontrarse entre el',
      'Quinto y el Octavo ciclo',
      'de su carrera.',
      'Pertenecer como',
      'mínimo al Tercio',
      'Superior de su facultad',
      'o especialidad.',
      'OCRI',
      'OFICINA DE COOPERACIÓN',
      'Y RELACIONES',
      'INTERNACIONALES UNSAAC',
    ],
  },
  {
    pageNumber: 3,
    lines: [
      'DOCUMENTOS',
      'Certificado, récord o histórico de notas U N S A A C',
      'dur ante la etapa universitaria (Historial',
      'Académico).',
      'Constancia de ser alumno de alto',
      'rendimiento académico, debe pertenecer al',
      'tercio superior como mínimo.',
      'Carta de presentación de la universidad de',
      'origen.',
      'Cart a de Recomendación Académica emitida',
      'por una o un docente de la universidad de',
      'origen.',
      'Carta de exposición de motivos en que la',
      'señale las razones para realizar la movilidad',
      '(debidamente firmado)',
      'Curriculum vitae (max.02 hoja)',
      'Carta de motivación (max.01 hoja)',
      'Ficha de cursos (FORMATO AQUÍ)',
      'Constancia de cobertura de seguro de salud.',
      'Pasaporte vigente. (si es internacional)',
      'OJO: PRESENTAR SU POSTULACION HASTA EL 18',
      'DE AGOSTO 2026',
      'ENVIAR SU NOMINACION DEL ESTUDIANTE A:',
      'ocri@unsaac.edu.pe',
      'MAYOR',
      'INFORMACIÓN',
    ],
  },
];

test('SGME separa requisitos y documentos sin marcas de agua ni pie institucional', () => {
  const before = JSON.stringify(pages);
  const result = parseBrochureContent(pages, [], { direction: 'ENTRANTE' });
  assert.equal(result.direction, 'ENTRANTE');
  assert.equal(result.period, '2026-II');
  assert.equal(result.mobility_scope, 'NACIONAL');
  assert.equal(result.closing_date, '2026-08-18');
  assert.equal(result.guidelines.length, 3);
  assert.equal(result.documents.length, 10);
  assert.ok(result.guidelines[0].endsWith('y ser alumno regular.'));
  assert.ok(!result.guidelines.join(' ').includes('DOCUMENTOS'));
  assert.ok(!result.guidelines.join(' ').includes('U N S A A C'));
  assert.ok(result.documents[3].title.endsWith('universidad de origen.'));
  assert.equal(result.documents[9].required, false);
  assert.ok(result.important_notices.some((item) => item.text.includes('ocri@unsaac.edu.pe')));
  assert.equal(JSON.stringify(pages), before);
});

test('SGME internacional no se clasifica nacional por tener destino Perú', () => {
  const international = structuredClone(pages);
  international[0].lines[4] = 'INTERNACIONAL';
  const result = parseBrochureContent(international, [], { direction: 'ENTRANTE' });
  assert.equal(result.mobility_scope, 'INTERNACIONAL');
  assert.equal(result.documents[9].required, true);
});

test('respeta el flujo elegido y detecta entrantes cuando no se proporciona contexto', () => {
  assert.equal(parseBrochureContent(pages).direction, 'ENTRANTE');
  assert.equal(parseBrochureContent(pages, [], { direction: 'SALIENTE' }).direction, 'SALIENTE');
});
