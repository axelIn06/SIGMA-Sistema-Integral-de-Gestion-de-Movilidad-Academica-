import assert from 'node:assert/strict';
import test from 'node:test';
import { academicPeriodForDate, parseBrochureContent } from '../src/brochure-parser.js';

const pages = [
  {
    pageNumber: 1,
    lines: [
      '2027-I',
      'Movilidad Académica',
      'CIERRE DE CONVOCATORIA',
      '28',
      'DE OCTUBRE',
      'Benemérita Universidad Autónoma de Puebla - México',
    ],
  },
  {
    pageNumber: 2,
    lines: [
      'REQUISITOS GENERALES',
      'Ser estudiante de la UNSAAC',
      'matriculado en el semestre',
      '2026-II',
      'Encontrase entre el 5to y',
      '7mo semestre',
      'Pertenecer al DÉCIMO,',
      'QUINTO SUPERIOR',
      '(promedio de 16.00) de su',
      'escuela profesional.',
      'No haber tenido un',
      'intercambio académico',
      'Internacional en anteriores',
      'semestres.',
    ],
  },
  {
    pageNumber: 3,
    lines: [
      'DOCUMENTOS a presentar',
      '1. Contrato de estudios avalado por la universidad',
      'de origen (CLICK)',
      '2. Constancia de matrícula 2026-II',
      '3. VISA (Después de su carta de aceptación)',
      'OJO: Traer los documentos de',
      'manera presencial a OCRI',
    ],
  },
  {
    pageNumber: 4,
    lines: [
      'Importante',
      '1. Adjuntar todos sus documentos en el siguiente link: (HACER CLICK)',
      '2. La nominación será enviada por la OCRI de la UNSAAC.',
    ],
  },
];

test('reconstruye el brochure BUAP sin dividir sus requisitos por renglón', () => {
  const result = parseBrochureContent(
    pages,
    [
      { pageNumber: 3, url: 'https://example.com/contrato' },
      { pageNumber: 4, url: 'https://example.com/postulacion' },
    ],
    { referenceDate: '2026-09-11T12:00:00-05:00' },
  );

  assert.equal(result.period, '2027-I');
  assert.equal(result.country, 'México');
  assert.equal(result.direction, 'SALIENTE');
  assert.equal(result.guidelines.length, 4);
  assert.equal(
    result.guidelines[0],
    'Ser estudiante de la UNSAAC matriculado en el semestre 2026-II',
  );
  assert.equal(result.documents.length, 3);
  assert.equal(result.documents[2].stage, 'AFTER_ACCEPTANCE');
  assert.equal(result.documents[2].required, false);
  assert.equal(result.closing_date, '2026-10-28');
  assert.doesNotMatch(result.warnings.join(' '), /no muestra el año/i);
  assert.ok(result.important_notices.some((notice) => notice.url.includes('postulacion')));
  assert.ok(result.important_notices.some((notice) => notice.text.includes('manera presencial')));
});

test('infiere el periodo solo cuando no aparece en el encabezado', () => {
  const withoutPublishedPeriod = structuredClone(pages);
  withoutPublishedPeriod[0].lines = withoutPublishedPeriod[0].lines.filter(
    (line) => line !== '2027-I',
  );

  const firstHalf = parseBrochureContent(withoutPublishedPeriod, [], {
    referenceDate: '2026-03-15T12:00:00-05:00',
  });
  const secondHalf = parseBrochureContent(withoutPublishedPeriod, [], {
    referenceDate: '2026-09-11T12:00:00-05:00',
  });

  assert.equal(firstHalf.period, '2026-II');
  assert.equal(secondHalf.period, '2027-I');
  assert.match(secondHalf.warnings.join(' '), /no muestra el periodo/i);
});

test('mantiene el periodo publicado aunque la fecha actual sugiera otro', () => {
  const result = parseBrochureContent(pages, [], {
    referenceDate: '2030-02-01T12:00:00-05:00',
  });
  assert.equal(result.period, '2027-I');
});

test('calcula el periodo institucional según la mitad del año', () => {
  assert.equal(academicPeriodForDate('2026-06-30T12:00:00-05:00'), '2026-II');
  assert.equal(academicPeriodForDate('2026-07-01T12:00:00-05:00'), '2027-I');
});

test('clasifica universidades peruanas desde el nombre del PDF cuando el país no aparece', () => {
  const withoutCountry = structuredClone(pages);
  withoutCountry[0].lines = withoutCountry[0].lines.filter((line) => !line.includes('México'));
  const result = parseBrochureContent(withoutCountry, [], {
    fileName: 'Brochure PUCP 2027-I.pdf',
    referenceDate: '2026-09-11T12:00:00-05:00',
  });
  assert.equal(result.mobility_scope, 'NACIONAL');
});

test('clasifica universidades extranjeras desde el nombre del PDF cuando falta el país', () => {
  const withoutCountry = structuredClone(pages);
  withoutCountry[0].lines = withoutCountry[0].lines.filter((line) => !line.includes('México'));
  const result = parseBrochureContent(withoutCountry, [], {
    fileName: 'Convocatoria BUAP 2027-I.pdf',
    referenceDate: '2026-09-11T12:00:00-05:00',
  });
  assert.equal(result.mobility_scope, 'INTERNACIONAL');
});

test('rechaza PDFs escaneados sin texto suficiente con una explicación útil', () => {
  assert.throws(
    () => parseBrochureContent([{ pageNumber: 1, lines: ['Imagen escaneada'] }]),
    /no contiene suficiente texto seleccionable/i,
  );
});
