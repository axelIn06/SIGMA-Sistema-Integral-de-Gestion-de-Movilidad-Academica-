import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function setup(status, credits = 12) {
  const context = vm.createContext({
    html: (strings, ...values) => String.raw({ raw: strings }, ...values),
    esc: String,
    badge: String,
    adminStatusFlow: () => '<details>Mapa</details>',
    session: { role: 'admin' },
    application: {
      id: 'test',
      direction: 'SALIENTE',
      status,
      returnDocuments: [
        {
          document_type: 'CONVALIDACION_CURSOS',
          status: 'VALIDADA',
          validated_credits: credits,
          file_name: 'resolucion.pdf',
          storage_path: 'resolution',
        },
        {
          document_type: 'CERTIFICADO_ESTUDIOS',
          status: 'VALIDADA',
          file_name: 'certificado.pdf',
          storage_path: 'certificate',
        },
      ],
    },
  });
  vm.runInContext(
    source.slice(
      source.indexOf('function returnDocumentationSection('),
      source.indexOf('async function uploadReturnDocument('),
    ),
    context,
  );
  return context;
}

test('el expediente concluido conserva ambos archivos sin repetir el aviso de cierre', () => {
  const context = setup('FINALIZADA');
  const output = vm.runInContext('returnDocumentationSection(application)', context);
  assert.ok(output.includes('Resolución de convalidación de cursos de la UNSAAC'));
  assert.ok(output.includes('resolucion.pdf'));
  assert.ok(output.includes('certificado.pdf'));
  assert.equal((output.match(/downloadReturnDocument/g) || []).length, 2);
  assert.ok(!output.includes('reviewReturnDocument'));
  assert.ok(!output.includes('Expediente concluido'));
});

test('el cierre exige ambos documentos validados y al menos 12 créditos', () => {
  const context = setup('DOCUMENTACION_RETORNO', 11);
  const render = () => vm.runInContext('returnConclusionActions(application)', context);
  assert.ok(render().includes('disabled'));
  context.application.returnDocuments[0].validated_credits = 12;
  assert.ok(!render().includes('disabled'));
  context.application.returnDocuments[1].status = 'PENDIENTE';
  assert.ok(render().includes('disabled'));
  context.application.returnDocuments = [];
  assert.ok(render().includes('disabled'));
});
