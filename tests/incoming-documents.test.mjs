import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function render(status, role = 'admin', uploaded = false) {
  const context = vm.createContext({
    html: (strings, ...values) => String.raw({ raw: strings }, ...values),
    esc: String,
    session: { role },
    application: {
      id: 'test',
      direction: 'ENTRANTE',
      status,
      letter: uploaded ? { file_name: 'aceptacion.pdf' } : null,
      incomingOfficialDocuments: uploaded
        ? [
            { document_type: 'RESOLUCION_MATRICULA', file_name: 'resolucion.pdf' },
            {
              document_type: 'CERTIFICADO_ESTUDIOS',
              file_name: 'certificado.pdf',
              storage_path: 'certificate.pdf',
            },
          ]
        : [],
    },
  });
  vm.runInContext(
    source.slice(
      source.indexOf('function incomingOfficialDocumentsSection('),
      source.indexOf('async function uploadIncomingOfficialDocument('),
    ),
    context,
  );
  return vm.runInContext('incomingOfficialDocumentsSection(application)', context);
}

test('SGME conserva la carga de documentos oficiales según la fase', () => {
  assert.ok(render('OBSERVADA').includes("'GUIA_SUBSANACION',this)"));
  assert.ok(render('RECHAZADA').includes("'CARTA_NO_APTO',this)"));
  const accepted = render('ADMITIDO_UNSAAC');
  assert.ok(accepted.includes("'ACEPTACION_UNSAAC',this)"));
  assert.ok(accepted.includes("'RESOLUCION_MATRICULA',this)"));
  assert.ok(!accepted.includes('incomingEnrollmentCode'));
  assert.ok(!accepted.includes('incomingDocumentNote'));
  const submitted = render('ENVIADA');
  assert.ok(submitted.includes("'ACEPTACION_UNSAAC',this)"));
  assert.ok(!submitted.includes('RESOLUCION_MATRICULA'));
  const enrolled = render('MATRICULA_HABILITADA');
  assert.ok(enrolled.includes("'RESOLUCION_MATRICULA',this)"));
  assert.ok(!enrolled.includes("'ACEPTACION_UNSAAC',this)"));
});

test('SGME mantiene los archivos disponibles y evita avisos de cierre duplicados en OCRI', () => {
  for (const role of ['admin', 'external', 'external_manager']) {
    const output = render('FINALIZADA', role, true);
    assert.equal((output.match(/downloadIncomingOfficialDocument/g) || []).length, 3);
    assert.ok(output.includes('aceptacion.pdf'));
    assert.ok(output.includes('resolucion.pdf'));
    assert.ok(output.includes('certificado.pdf'));
    assert.equal(output.includes('Expediente concluido'), role !== 'admin');
  }
});

test('estudiante externo y gestor conservan consulta sin controles de carga OCRI', () => {
  for (const role of ['external', 'external_manager']) {
    for (const status of [
      'OBSERVADA',
      'RECHAZADA',
      'ADMITIDO_UNSAAC',
      'EN_MOVILIDAD',
      'FINALIZADA',
    ]) {
      assert.ok(!render(status, role).includes('uploadIncomingOfficialDocument'));
    }
  }
});

test('OCRI adjunta el certificado al finalizar la estancia, sin agregar estados ni comentarios de documentos', () => {
  assert.ok(render('EN_MOVILIDAD').includes("'CERTIFICADO_ESTUDIOS',this)"));
  assert.ok(!render('ADMITIDO_UNSAAC').includes("'CERTIFICADO_ESTUDIOS',this)"));
  assert.ok(!render('FINALIZADA', 'admin', true).includes('uploadIncomingOfficialDocument'));
});
