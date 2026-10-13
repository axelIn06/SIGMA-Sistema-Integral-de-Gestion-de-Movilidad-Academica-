import assert from 'node:assert/strict';
import test from 'node:test';
import { answerHelpQuestion } from '../src/help-assistant.js';

test('responde en español y sin depender de tildes', () => {
  assert.match(answerHelpQuestion('Que hago al volver de movilidad'), /12 créditos/);
});

test('explica el estado actual del expediente', () => {
  const answer = answerHelpQuestion('¿Qué significa mi estado?', {
    status: 'OBSERVADA',
    statusNote: 'Adjunta el pasaporte vigente',
  });
  assert.match(answer, /Subsanación requerida/);
  assert.match(answer, /Adjunta el pasaporte vigente/);
});

test('explica el resultado no apto sin ocultar el expediente del historial', () => {
  assert.match(answerHelpQuestion('¿Qué significa no apto?'), /permanece en tu historial/);
});

test('resume de forma distinta los flujos entrante y saliente', () => {
  assert.match(
    answerHelpQuestion('Explícame los pasos', { direction: 'ENTRANTE' }),
    /universidad de origen nomina/,
  );
  assert.match(
    answerHelpQuestion('Explícame los pasos', { direction: 'SALIENTE' }),
    /estudiante completa y envía/,
  );
});

test('lista requisitos pendientes del expediente cuando hay contexto', () => {
  const answer = answerHelpQuestion('¿Qué documentos debo subir?', {
    documents: [
      { name: 'Pasaporte', required: true, storagePath: '' },
      { name: 'Foto', required: true, storagePath: 'user/photo.jpg' },
    ],
  });
  assert.match(answer, /Pasaporte/);
  assert.doesNotMatch(answer, /Foto/);
});

test('la ayuda entrante conserva la explicación del expediente y no pide una carta de destino', () => {
  const answer = answerHelpQuestion('¿Qué significa mi estado?', {
    direction: 'ENTRANTE',
    status: 'ADMITIDO_UNSAAC',
    statusLabel: 'Aceptado por UNSAAC',
    statusDescription: 'OCRI adjunta la carta de aceptación y la resolución de matrícula.',
  });
  assert.match(answer, /Aceptado por UNSAAC/);
  assert.doesNotMatch(answer, /formalizar la nominación/);
  assert.match(
    answerHelpQuestion('carta de aceptación', { direction: 'ENTRANTE' }),
    /OCRI registra/,
  );
  assert.match(
    answerHelpQuestion('nominación', { direction: 'ENTRANTE' }),
    /universidad de origen/,
  );
  assert.match(answerHelpQuestion('al volver', { direction: 'ENTRANTE' }), /coordina con OCRI/);
});

test('usa una respuesta segura para consultas fuera de los temas previstos', () => {
  assert.match(answerHelpQuestion('¿Cuánto mide la universidad?'), /comunícate con OCRI/);
  assert.match(answerHelpQuestion(''), /Escribe tu duda/);
});
