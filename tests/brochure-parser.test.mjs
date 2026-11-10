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
  assert.ok(result.important_notices.some((notice) => notice.kind === 'IMPORTANT'));
});

test('separa viñetas importantes aunque el PDF corte cada aviso en varias líneas', () => {
  const variant = structuredClone(pages);
  variant[2].lines = variant[2].lines.slice(0, 4);
  variant[3].lines = [
    'IMPORTANTE',
    '• Consulta el programa académico de la sede elegida',
    'antes de completar la solicitud.',
    '• Presenta los documentos también en la oficina',
    'si el brochure exige entrega presencial.',
  ];
  const result = parseBrochureContent(variant, [], {
    referenceDate: '2026-09-11T12:00:00-05:00',
  });
  const important = result.important_notices.filter((item) => item.kind === 'IMPORTANT');
  assert.equal(important.length, 2);
  assert.match(important[0].text, /antes de completar la solicitud/i);
  assert.match(important[1].text, /entrega presencial/i);
  assert.equal(result.important_notices.filter((item) => item.kind === 'ADDITIONAL').length, 0);

  variant[3].lines[0] = 'Consideraciones importantes';
  const alternateHeading = parseBrochureContent(variant, [], {
    referenceDate: '2026-09-11T12:00:00-05:00',
  });
  assert.equal(
    alternateHeading.important_notices.filter((item) => item.kind === 'IMPORTANT').length,
    2,
  );
  assert.equal(
    alternateHeading.important_notices.filter((item) => item.kind === 'ADDITIONAL').length,
    0,
  );
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

test('recupera requisitos y documentos no numerados del brochure de Colombia', () => {
  const colombiaPages = [
    {
      pageNumber: 1,
      lines: [
        'MOVILIDAD',
        'ACADÉMICA',
        '2027-I',
        'COLOMBIA',
        'CIERRE DE POSTULACIÓN',
        'DE noviembre',
        'DEl 2026 hasta',
        '4 el medio dia',
      ],
    },
    {
      pageNumber: 2,
      lines: [
        '¿CÓMO APLICAR PARA MOVILIDAD',
        'ACADÉMICA?',
        'El alumno debe estar matriculado como estudiante regular en la',
        'UNSAAC 2026-ii.',
        'REQUISITOS Ser tercio, quinto o décimo superior.',
        'Reunir toda la documentación requerida.',
        'TENER MINIMO 12 CRÉDITOS CONVALIDABLES.',
        'eSTAR ENTRE EL 5TO Y 8VO SEMESTRE.',
        'El estudiante visitante podrá realizar movilidad académica en',
        'MODALIDADES',
        'la Universidad Nacional de Colombia en la modalidad de :',
      ],
    },
    {
      pageNumber: 3,
      lines: [
        'DOCUMENTOS A presentar',
        'Carta de presentación de la UNSAAC (Con membrete y/o',
        'sello)( ojo : completa el formulario para que ocri elabore',
        'tu carta) (VER AQUI)',
        'Carta de motivación ( mAX. 1 HOJA; 1er PARRAFO RAZONES',
        'ACADEMICAS Y 2DO PARRAFO RAZONES CULTURALES)',
        'HISTORIAL ACADEMICO O FICHA DE SEGUIMIENTO.',
        'copia de pasaporte y foto tamaño carnet.',
        'Carta de respaldo económico en la que indique que',
        'puede asumir financieramente su intercambio.',
        'Constancia de tercio, quinto o décimo',
        'superior.',
        'Constancia dE MATRICULA 2026-iI y carta de',
        'recomendación de un docente.',
        'formato de responsabilidad individual estudiantes',
        'en movilidad en tramite : (VER AQUI)',
        'MOVILIDAD',
        'FORMATO DE AUTORIZACIIÓN Tratamiento DE DATOS',
        'PERSONALES, DILIGENCIADO Y FIRMADO: (VER AQUI)',
        'ACADÉMICA',
      ],
    },
    { pageNumber: 4, lines: ['proceso de postulación', 'Complete el formulario de solicitud.'] },
    {
      pageNumber: 5,
      lines: ['IMPORTANTE', 'PARA MÁS edificio administrativo de la universidad,'],
    },
  ];
  const result = parseBrochureContent(colombiaPages, [], {
    fileName: 'BrochureColombia_27-1.pdf',
    referenceDate: '2030-01-10T12:00:00-05:00',
  });

  assert.equal(result.university_name, 'Universidad Nacional de Colombia');
  assert.equal(result.country, 'Colombia');
  assert.equal(result.period, '2027-I');
  assert.equal(result.closing_date, '2026-11-04');
  assert.equal(result.direction, 'SALIENTE');
  assert.equal(result.mobility_scope, 'INTERNACIONAL');
  assert.equal(result.guidelines.length, 5);
  assert.equal(result.documents.length, 9);
  assert.match(result.documents[8].title, /Formato de autorizaci/i);
  assert.doesNotMatch(result.documents[0].description, /VER AQUI/i);
  assert.match(result.warnings.join(' '), /no expone la numeración/i);
  assert.match(result.warnings.join(' '), /fecha de cierre aparece separada/i);
  assert.doesNotMatch(
    result.warnings.join(' '),
    /No se reconocieron requisitos|No se reconocieron documentos/i,
  );
});

test('asocia cada enlace al documento o paso visible en la página', () => {
  const positionedPages = [
    {
      pageNumber: 1,
      lines: ['Movilidad académica 2027-I', 'Colombia', 'Universidad Nacional de Colombia'],
    },
    {
      pageNumber: 2,
      lines: ['REQUISITOS', 'Ser estudiante regular de la UNSAAC.', 'Tener 12 créditos.'],
    },
    {
      pageNumber: 3,
      lines: ['DOCUMENTOS A PRESENTAR', 'Carta de presentación (VER AQUI)', 'Pasaporte vigente.'],
      lineEntries: [
        { text: 'DOCUMENTOS A PRESENTAR', y: 470, x: 30 },
        { text: 'Carta de presentación (VER AQUI)', y: 420, x: 30 },
        { text: 'Pasaporte vigente.', y: 350, x: 30 },
      ],
    },
    {
      pageNumber: 6,
      lines: ['Información adicional', 'La universidad brinda orientación antes del viaje.'],
    },
    {
      pageNumber: 4,
      width: 700,
      lines: ['Proceso de postulación', 'Ver los cursos: (CLICK)'],
      lineEntries: [
        { text: 'Proceso de postulación', y: 460, x: 170 },
        {
          text: 'Ver los cursos: (CLICK)',
          y: 400,
          x: 460,
          items: [
            { x: 460, text: 'Ver los cursos:' },
            { x: 570, text: '(CLICK)' },
          ],
        },
      ],
    },
    {
      pageNumber: 5,
      lines: [
        'IMPORTANTE',
        'En la pagina de la sede de su interés, identifique el programa académico',
        'en el siguiente link: (CLICK)',
      ],
      lineEntries: [
        { text: 'IMPORTANTE', y: 460, x: 30 },
        {
          text: 'En la pagina de la sede de su interés, identifique el programa académico',
          y: 300,
          x: 30,
        },
        { text: 'en el siguiente link: (CLICK)', y: 280, x: 30 },
      ],
    },
  ];
  const result = parseBrochureContent(
    positionedPages,
    [
      { pageNumber: 3, rect: [120, 385, 200, 405], url: 'https://example.org/carta' },
      { pageNumber: 4, rect: [570, 390, 630, 410], url: 'https://example.org/cursos' },
      { pageNumber: 5, rect: [150, 267, 210, 287], url: 'https://example.org/programas' },
    ],
    { referenceDate: '2026-09-01T12:00:00-05:00' },
  );

  assert.equal(result.documents[0].url, 'https://example.org/carta');
  assert.equal(result.documents[1].url, '');
  assert.ok(
    result.important_notices.some(
      (item) => item.text === 'Ver los cursos' && item.url === 'https://example.org/cursos',
    ),
  );
  assert.ok(!result.important_notices.some((item) => item.url === 'https://example.org/carta'));
  assert.ok(
    result.important_notices.some(
      (item) =>
        item.url === 'https://example.org/programas' &&
        item.text.includes('identifique el programa académico') &&
        item.text.includes('siguiente link'),
    ),
  );
  assert.ok(
    result.important_notices.some((item) =>
      item.text.includes('La universidad brinda orientación antes del viaje.'),
    ),
  );
});
