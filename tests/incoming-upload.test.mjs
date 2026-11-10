import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function setup({ rpcError = null } = {}) {
  const calls = [];
  const input = {
    files: [{ name: 'carta.pdf', type: 'application/pdf', size: 100 }],
    disabled: false,
    value: 'carta.pdf',
    closest: () => ({ setAttribute() {}, removeAttribute() {} }),
  };
  const context = vm.createContext({
    window: {},
    input,
    crypto: { randomUUID: () => 'unique' },
    toast: (message) => calls.push(['toast', message]),
    refreshLetterView: async (id) => calls.push(['refresh', id]),
    supabase: {
      storage: {
        from: (bucket) => ({
          upload: async (path, file) => {
            calls.push(['upload', bucket, path, file.name]);
            return { error: null };
          },
        }),
      },
      rpc: async (name, payload) => {
        calls.push(['rpc', name, payload]);
        return { error: rpcError };
      },
    },
  });
  const registry = source.slice(
    source.indexOf('Object.assign(window, {'),
    source.lastIndexOf('boot();'),
  );
  for (const match of registry.matchAll(/^\s*([$\w]+),?\s*$/gm)) {
    if (!(match[1] in context)) context[match[1]] = () => {};
  }
  vm.runInContext(
    source.slice(
      source.indexOf('async function uploadIncomingOfficialDocument('),
      source.indexOf('async function downloadIncomingOfficialDocument('),
    ),
    context,
  );
  vm.runInContext(registry, context);
  return { calls, input, context };
}

test('el control público de carga SGME llega a Storage y RPC y refresca el expediente', async () => {
  const { context, calls } = setup();
  assert.equal(typeof context.window.uploadIncomingOfficialDocument, 'function');
  await vm.runInContext(
    "window.uploadIncomingOfficialDocument('application','ACEPTACION_UNSAAC',input)",
    context,
  );
  assert.equal(calls.find((item) => item[0] === 'upload')[1], 'acceptance-letters');
  const rpc = calls.find((item) => item[0] === 'rpc');
  assert.equal(rpc[1], 'admin_save_incoming_document');
  assert.equal(rpc[2].note, '');
  assert.ok(calls.some((item) => item[0] === 'refresh'));
});

test('la resolución se adjunta sin transcribir el código contenido en el PDF', async () => {
  const { context, calls } = setup();
  await vm.runInContext(
    "window.uploadIncomingOfficialDocument('application','RESOLUCION_MATRICULA',input)",
    context,
  );
  assert.ok(calls.some((item) => item[0] === 'upload'));
  const rpc = calls.find((item) => item[0] === 'rpc');
  assert.equal(rpc[2].kind, 'RESOLUCION_MATRICULA');
  assert.equal(rpc[2].enrollment_code, undefined);
  assert.ok(calls.some((item) => item[0] === 'refresh'));
});

test('una falla de guardado se muestra y permite seleccionar el archivo otra vez', async () => {
  const { context, calls, input } = setup({ rpcError: { message: 'Error de prueba' } });
  await vm.runInContext(
    "window.uploadIncomingOfficialDocument('application','ACEPTACION_UNSAAC',input)",
    context,
  );
  assert.equal(input.disabled, false);
  assert.equal(input.value, '');
  assert.ok(calls.some((item) => item[0] === 'toast' && item[1].includes('Error de prueba')));
  assert.ok(!calls.some((item) => item[0] === 'refresh'));
});
