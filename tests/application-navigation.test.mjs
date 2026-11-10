import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { callLifecycle } from '../src/call-lifecycle.js';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function renderer(complete = true) {
  const context = vm.createContext({
    html: (strings, ...values) => String.raw({ raw: strings }, ...values),
    esc: String,
    callLifecycle,
    noticeLinks: (notice) => notice?.links || [],
    applicationDraft: {
      facultyCode: complete ? 'F' : '',
      schoolCode: 'S',
      documents: [{ requirementId: 'required', required: true }],
    },
    pendingApplicationFiles: new Map([['required', { name: 'document.pdf' }]]),
  });
  vm.runInContext(
    source.slice(
      source.indexOf('function callReadingSteps('),
      source.indexOf('function changeCallReadingStep('),
    ) +
      source.slice(
        source.indexOf('function applicationProgress('),
        source.indexOf('function applicationForm('),
      ),
    context,
  );
  return context;
}

for (const additional of [false, true]) {
  test(`envío solo en el último paso ${additional ? 'con' : 'sin'} adicionales`, () => {
    const context = renderer();
    context.call = {
      id: 'call',
      status: 'ACTIVA',
      end: '2099-01-01',
      notice: { description: additional ? 'Indicaciones' : '' },
    };
    const count = additional ? 4 : 3;
    for (let index = 0; index < count; index++) {
      context.index = index;
      const output = vm.runInContext('readingControls(call, index, true)', context);
      assert.equal(output.includes('onclick="submitStudentApplication()"'), index === count - 1);
      assert.equal((output.match(/onclick="saveApplicationDraftAndExit\(\)"/g) || []).length, 1);
      if (index === count - 1) assert.ok(!output.includes('disabled'));
    }
    assert.ok(
      !vm.runInContext('readingControls(call, 0, false)', context).includes('Guardar y salir'),
    );
  });
}

test('el envío permanece deshabilitado si faltan datos académicos', () => {
  const context = renderer(false);
  context.call = { id: 'call', status: 'ACTIVA', end: '2099-01-01' };
  const output = vm.runInContext('readingControls(call, 2, true)', context);
  assert.match(output, /onclick="submitStudentApplication\(\)" disabled/);
  assert.ok(output.includes('paso Documentos'));
});

test('un borrador vencido no puede enviarse, pero sí una subsanación', () => {
  const context = renderer();
  context.call = { id: 'call', status: 'ACTIVA', end: '2000-01-01' };
  let output = vm.runInContext('readingControls(call, 2, true)', context);
  assert.match(output, /onclick="submitStudentApplication\(\)" disabled/);
  assert.ok(output.includes('ya no recibe postulaciones'));
  vm.runInContext("applicationDraft.status = 'OBSERVADA'", context);
  output = vm.runInContext('readingControls(call, 2, true)', context);
  assert.doesNotMatch(output, /onclick="submitStudentApplication\(\)" disabled/);
});
