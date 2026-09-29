import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeForMatch,
  cleanText,
  sentenceCase,
  titleCase,
  unique,
  sectionLines,
  groupNumberedLines,
  groupRequirements,
  parseDocument,
  findUniversity,
  inferMobilityScope,
  findCountry,
  findClosingDate,
  academicPeriodForDate,
} from '../src/brochure-parser.js';

test('normalizeForMatch elimina acentos y normaliza espacios', () => {
  assert.equal(normalizeForMatch('Universidad Nacional'), 'universidad nacional');
  assert.equal(normalizeForMatch('UNIVERSIDAD NACIONAL'), 'universidad nacional');
  assert.equal(normalizeForMatch('Univérsidad  Nacíonal'), 'universidad nacional');
  assert.equal(normalizeForMatch('  múltiples   espacios  '), 'multiples espacios');
  assert.equal(normalizeForMatch(null), '');
  assert.equal(normalizeForMatch(undefined), '');
});

test('cleanText limpia espacios y corrige problemas comunes de OCR', () => {
  assert.equal(cleanText('  hola   mundo  '), 'hola mundo');
  assert.equal(cleanText('hola , mundo'), 'hola, mundo');
  assert.equal(cleanText('( hola )'), '(hola)');
  assert.equal(cleanText('hola.. mundo'), 'hola. mundo');
  assert.equal(cleanText('E ncontrarse'), 'Encontrarse');
  assert.equal(cleanText('d ocente'), 'docente');
  assert.equal(cleanText('Encontrase'), 'Encontrarse');
  assert.equal(cleanText(null), '');
});

test('sentenceCase capitaliza la primera letra y mantiene el resto', () => {
  assert.equal(sentenceCase('hola mundo'), 'Hola mundo');
  assert.equal(sentenceCase('HOLA MUNDO'), 'HOLA MUNDO');
  assert.equal(sentenceCase(''), '');
  assert.equal(sentenceCase(null), '');
  assert.equal(sentenceCase('  hola  '), 'Hola');
});

test('titleCase aplica título y preserva siglas conocidas', () => {
  assert.equal(
    titleCase('universidad nacional de san antonio abad'),
    'Universidad Nacional de San Antonio Abad',
  );
  assert.equal(titleCase('universidad BUAP mexico'), 'Universidad BUAP Mexico');
  assert.equal(titleCase('pucp lima'), 'PUCP Lima');
  assert.equal(
    titleCase('universidad nacional autonoma de mexico'),
    'Universidad Nacional Autonoma de Mexico',
  );
  assert.equal(titleCase(''), '');
});

test('unique elimina duplicados y valores falsy', () => {
  assert.deepEqual(unique(['a', 'b', 'a', '', null, 'c', 'b']), ['a', 'b', 'c']);
  assert.deepEqual(unique([1, 2, 2, 3]), [1, 2, 3]);
  assert.deepEqual(unique([]), []);
});

test('sectionLines extrae líneas entre inicio y fin', () => {
  const pages = [{ pageNumber: 1, lines: ['INICIO', 'línea 1', 'línea 2', 'FIN', 'línea 3'] }];
  const result = sectionLines(
    pages,
    (line) => line === 'inicio',
    (line) => line === 'fin',
  );
  assert.deepEqual(result, ['línea 1', 'línea 2']);
});

test('sectionLines retorna vacío si no hay sección', () => {
  const pages = [{ pageNumber: 1, lines: ['otra cosa'] }];
  const result = sectionLines(
    pages,
    (line) => line === 'inicio',
    (line) => line === 'fin',
  );
  assert.deepEqual(result, []);
});

test('groupNumberedLines agrupa ítems numerados', () => {
  const lines = ['1. Primer item', 'continuación', '2. Segundo item', '3. Tercer item'];
  const { groups, numbers } = groupNumberedLines(lines);
  assert.deepEqual(groups, ['Primer item continuación', 'Segundo item', 'Tercer item']);
  assert.deepEqual(numbers, [1, 2, 3]);
});

test('groupNumberedLines maneja líneas sin número', () => {
  const lines = ['Sin número', '1. Con número', '2. Otro'];
  const { groups, numbers } = groupNumberedLines(lines);
  assert.deepEqual(groups, ['Con número', 'Otro']);
  assert.deepEqual(numbers, [1, 2]);
});

test('groupRequirements combina requisitos multilínea', () => {
  const lines = [
    'Ser estudiante regular',
    'matriculado en 2026-II',
    'No haber tenido intercambio',
    'Promedio superior a 14',
  ];
  const result = groupRequirements(lines);
  assert.equal(result.length, 3);
  assert.ok(result[0].includes('Ser estudiante regular matriculado en 2026-II'));
  assert.ok(result[1].includes('No haber tenido intercambio'));
  assert.ok(result[2].includes('Promedio superior a 14'));
});

test('groupRequirements ignora viñetas y numeración', () => {
  const lines = ['• Ser estudiante', '1. Tener promedio', '- No haber fallado'];
  const result = groupRequirements(lines);
  assert.equal(result.length, 3);
});

test('parseDocument extrae título, descripción y etapa (mantiene numeración)', () => {
  const doc = parseDocument('1. Récord académico (original y copia simple)');
  assert.equal(doc.title, '1. Récord académico');
  assert.equal(doc.description, 'Original y copia simple');
  assert.equal(doc.required, true);
  assert.equal(doc.stage, 'APPLICATION');
});

test('parseDocument detecta documento post-aceptación', () => {
  const doc = parseDocument('VISA (Después de su carta de aceptación)');
  assert.equal(doc.title, 'VISA');
  assert.equal(doc.stage, 'AFTER_ACCEPTANCE');
  assert.equal(doc.required, false);
});

test('parseDocument limpia etiquetas CLICK', () => {
  const doc = parseDocument('Contrato de estudios avalado por la universidad de origen (CLICK)');
  assert.equal(doc.title, 'Contrato de estudios avalado por la universidad de origen');
  assert.ok(!doc.description.includes('CLICK'));
});

test('findUniversity extrae universidad del contenido', () => {
  const lines = ['Universidad Nacional de San Antonio Abad del Cusco', 'Otra línea'];
  const result = findUniversity(lines, 'Brochure UNSAAC 2027-I.pdf');
  assert.ok(result.includes('Universidad Nacional de San Antonio Abad'));
});

test('findUniversity usa nombre de archivo como fallback cuando contiene universidad', () => {
  const lines = ['Sin universidad aquí'];
  const result = findUniversity(lines, 'Brochure Universidad PUCP 2027-I.pdf');
  assert.ok(result.includes('Pucp') || result.includes('Universidad'));
});

test('findUniversity ignora UNSAAC y referencias genéricas', () => {
  const lines = ['Universidad de origen', 'Universidad de destino', 'UNSAAC'];
  const result = findUniversity(lines, '');
  assert.equal(result, '');
});

test('inferMobilityScope clasifica por país', () => {
  assert.equal(inferMobilityScope('Perú', '', ''), 'NACIONAL');
  assert.equal(inferMobilityScope('México', '', ''), 'INTERNACIONAL');
  assert.equal(inferMobilityScope('', '', ''), 'UNKNOWN');
});

test('inferMobilityScope usa patrones peruanos', () => {
  assert.equal(inferMobilityScope('', 'PUCP', ''), 'NACIONAL');
  assert.equal(inferMobilityScope('', 'Universidad de Lima', ''), 'NACIONAL');
  assert.equal(inferMobilityScope('', 'Cusco', ''), 'NACIONAL');
});

test('inferMobilityScope usa patrones extranjeros conocidos', () => {
  assert.equal(inferMobilityScope('', 'BUAP', ''), 'INTERNACIONAL');
  assert.equal(inferMobilityScope('', 'TEC DE MONTERREY', ''), 'INTERNACIONAL');
});

test('findCountry detecta países en texto (retorna el primero en la lista COUNTRIES)', () => {
  assert.equal(findCountry('Universidad en México'), 'México');
  assert.equal(findCountry('Estudios en España'), 'España');
  assert.equal(findCountry('Sin país'), '');
  assert.equal(findCountry('Chile y Perú'), 'Chile');
});

test('findClosingDate extrae fecha con día y mes', () => {
  const pages = [{ pageNumber: 1, lines: ['CIERRE 28 DE OCTUBRE 2026'] }];
  const result = findClosingDate(pages, 2026);
  assert.equal(result.date, '2026-10-28');
});

test('findClosingDate usa año de fallback', () => {
  const pages = [{ pageNumber: 1, lines: ['CIERRE 15 DE MARZO'] }];
  const result = findClosingDate(pages, 2027);
  assert.equal(result.date, '2027-03-15');
});

test('findClosingDate maneja setiembre', () => {
  const pages = [{ pageNumber: 1, lines: ['Cierre 30 de setiembre'] }];
  const result = findClosingDate(pages, 2026);
  assert.equal(result.date, '2026-09-30');
});

test('findClosingDate retorna null sin fecha válida', () => {
  const pages = [{ pageNumber: 1, lines: ['Sin fecha aquí'] }];
  const result = findClosingDate(pages, 2026);
  assert.equal(result.date, null);
});

test('academicPeriodForDate calcula periodo según mitad de año (mes < 6 = II, mes >= 6 = I siguiente)', () => {
  assert.equal(academicPeriodForDate('2026-01-15T12:00:00'), '2026-II');
  assert.equal(academicPeriodForDate('2026-06-30T12:00:00'), '2026-II');
  assert.equal(academicPeriodForDate('2026-07-01T12:00:00'), '2027-I');
  assert.equal(academicPeriodForDate('2026-12-31T12:00:00'), '2027-I');
});

test('academicPeriodForDate lanza error con fecha inválida (NaN)', () => {
  assert.throws(() => academicPeriodForDate('fecha-invalida'), /no es válida/);
  assert.throws(() => academicPeriodForDate('not-a-date'), /no es válida/);
});
