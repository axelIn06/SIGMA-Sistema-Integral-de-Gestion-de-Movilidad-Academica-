import test from 'node:test';
import assert from 'node:assert/strict';
import { callLifecycle } from '../src/call-lifecycle.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const call = { status: 'ACTIVA', end: '2026-11-03' };
test('El plazo incluye el último segundo de la fecha límite en Lima', () => {
  assert.equal(callLifecycle(call, new Date('2026-11-04T04:59:59Z')).open, true);
  assert.equal(callLifecycle(call, new Date('2026-11-04T05:00:00Z')).label, 'Plazo vencido');
  assert.equal(callLifecycle(call, new Date('2026-11-04T05:00:00Z')).open, false);
});
test('La conclusión administrativa prevalece sobre el vencimiento', () => {
  const result = callLifecycle({ ...call, concludedAt: '2026-11-04T12:00:00Z' });
  assert.equal(result.label, 'Concluida');
  assert.equal(result.open, false);
});
test('Archivar y cerrar impiden postular incluso con fechas futuras', () => {
  assert.equal(callLifecycle({ ...call, end: '2099-01-01', archivedAt: '2026-11-04' }).open, false);
  assert.equal(callLifecycle({ ...call, end: '2099-01-01', status: 'CERRADA' }).open, false);
  assert.equal(callLifecycle({ ...call, status: 'BORRADOR' }).label, 'Borrador');
});

test('Archivar y desarchivar cierran la ventana; concluir mantiene el detalle abierto', async () => {
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const handler = source.slice(
    source.indexOf('async function setCallLifecycle('),
    source.indexOf('function filterCards('),
  );
  for (const action of ['archive', 'restore', 'conclude']) {
    const events = [];
    const query = {
      update() {
        return this;
      },
      eq() {
        return this;
      },
      select() {
        return this;
      },
      async single() {
        return { data: { id: 'call' }, error: null };
      },
    };
    const context = vm.createContext({
      session: { role: 'admin' },
      state: { calls: [{ id: 'call' }] },
      supabase: { from: () => query },
      loadCallsFromDatabase: async () => events.push('load'),
      closeModal: () => events.push('close'),
      render: () => events.push('render'),
      showCallSummary: () => events.push('open'),
      toast: () => events.push('toast'),
    });
    vm.runInContext(handler, context);
    await context.setCallLifecycle('call', action);
    assert.deepEqual(
      events,
      action === 'conclude' ? ['load', 'render', 'open'] : ['load', 'close', 'render', 'toast'],
    );
  }
});
