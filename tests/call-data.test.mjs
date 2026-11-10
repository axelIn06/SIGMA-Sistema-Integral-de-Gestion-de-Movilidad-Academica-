import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCallNotice, orderedCallItems } from '../src/call-data.js';

test('conserva Importante y Adicionales cuando la API devuelve la relación única como objeto', () => {
  const relation = {
    description: 'Seleccione su sede y complete el formulario.',
    call_notice_links: [
      { label: 'Entrega presencial', url: null, kind: 'IMPORTANT', display_order: 2 },
      {
        label: 'Sede Bogotá',
        url: 'https://bogota.unal.edu.co/',
        kind: 'ADDITIONAL',
        display_order: 0,
      },
    ],
  };
  assert.deepEqual(mapCallNotice(relation), {
    description: relation.description,
    links: [
      { label: 'Sede Bogotá', url: 'https://bogota.unal.edu.co/', kind: 'ADDITIONAL' },
      { label: 'Entrega presencial', url: '', kind: 'IMPORTANT' },
    ],
  });
  assert.deepEqual(mapCallNotice([relation]), mapCallNotice(relation));
  assert.equal(relation.call_notice_links[0].display_order, 2);
});

test('permite convocatorias sin avisos y respuestas anteriores sin clasificación', () => {
  assert.deepEqual(mapCallNotice(null), { description: '', links: [] });
  assert.deepEqual(mapCallNotice([]), { description: '', links: [] });
  assert.deepEqual(mapCallNotice({ call_notice_links: [{ label: 'Formulario' }] }), {
    description: '',
    links: [{ label: 'Formulario', url: '', kind: 'ADDITIONAL' }],
  });
});

test('mantiene el orden registrado de requisitos, documentos y materiales sin modificar la respuesta', () => {
  const rows = [
    { display_order: 3, title: 'Último' },
    { display_order: 0, title: 'Primero' },
  ];
  assert.deepEqual(
    orderedCallItems(rows).map((row) => row.title),
    ['Primero', 'Último'],
  );
  assert.equal(rows[0].title, 'Último');
  assert.deepEqual(orderedCallItems(null), []);
});
