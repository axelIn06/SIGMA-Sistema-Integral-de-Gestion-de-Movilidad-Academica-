import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const context = vm.createContext({
  html: (strings, ...values) => String.raw({ raw: strings }, ...values),
  esc: String,
});
vm.runInContext(
  source.slice(
    source.indexOf('function adminStatusFlow('),
    source.indexOf('function statusDescription('),
  ),
  context,
);

for (const [direction, statuses, cards] of [
  [
    'SALIENTE',
    [
      'BORRADOR',
      'ENVIADA',
      'OBSERVADA',
      'RECHAZADA',
      'ADMITIDO_UNSAAC',
      'NOMINADO_UNSAAC',
      'CARTA_PENDIENTE',
      'NO_ACEPTADO_DESTINO',
      'ACEPTADO',
      'EN_MOVILIDAD',
      'DOCUMENTACION_RETORNO',
      'FINALIZADA',
    ],
    12,
  ],
  [
    'ENTRANTE',
    [
      'BORRADOR',
      'ENVIADA',
      'OBSERVADA',
      'RECHAZADA',
      'ADMITIDO_UNSAAC',
      'MATRICULA_HABILITADA',
      'EN_MOVILIDAD',
      'FINALIZADA',
    ],
    8,
  ],
]) {
  test(`mapa ${direction}: conserva todas las tarjetas y destaca solo el estado actual`, () => {
    for (const status of statuses) {
      context.application = { direction, status };
      const output = vm.runInContext('adminStatusFlow(application)', context);
      assert.equal((output.match(/aria-current="step"/g) || []).length, 1, status);
      assert.equal((output.match(/class="flow-card /g) || []).length, cards, status);
      assert.equal((output.match(/classList.toggle\('is-flipped'\)/g) || []).length, cards, status);
    }
  });
}

test('un expediente cancelado no destaca una etapa que no corresponde', () => {
  context.application = { direction: 'SALIENTE', status: 'CANCELADO' };
  assert.ok(
    !vm.runInContext('adminStatusFlow(application)', context).includes('aria-current="step"'),
  );
});
