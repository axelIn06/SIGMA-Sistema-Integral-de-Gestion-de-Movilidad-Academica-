// Integración real Auth → Storage → RPC → historial. Solo Supabase CLI local.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const config = JSON.parse(
  execFileSync('supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);
assert.match(config.API_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(config.DB_URL, /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):/);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const client = createClient(config.API_URL, config.ANON_KEY, options);
const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const { admin_id, admin_email, student_id } = JSON.parse(
  execFileSync(
    'psql',
    [
      config.DB_URL,
      '-At',
      '-c',
      `
    select json_build_object(
      'admin_id', (select ur.user_id from public.user_roles ur join public.roles r on r.id=ur.role_id where r.code='ADMIN_OCRI' limit 1),
      'admin_email', (select p.email from public.profiles p join public.user_roles ur on ur.user_id=p.user_id join public.roles r on r.id=ur.role_id where r.code='ADMIN_OCRI' limit 1),
      'student_id', (select ur.user_id from public.user_roles ur join public.roles r on r.id=ur.role_id where r.code='ESTUDIANTE_EXTERNO' limit 1)
    );`,
    ],
    { encoding: 'utf8' },
  ),
);
assert.ok(admin_id && admin_email && student_id, 'Se necesitan OCRI y estudiante externo locales.');
const { properties } = unwrap(
  await service.auth.admin.generateLink({ type: 'magiclink', email: admin_email }),
);
unwrap(await client.auth.verifyOtp({ type: 'magiclink', token_hash: properties.hashed_token }));
const callId = randomUUID();
const applicationId = randomUUID();
const letterPath = `${applicationId}/carta.pdf`;
const resolutionPath = `${applicationId}/RESOLUCION_MATRICULA/resolucion.pdf`;
const certificatePath = `${applicationId}/CERTIFICADO_ESTUDIOS/certificado.pdf`;
const pdf = new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'], {
  type: 'application/pdf',
});
try {
  unwrap(
    await service.from('calls').insert({
      id: callId,
      code: `TEST-${callId}`,
      title: 'Prueba HTTP SGME',
      direction: 'ENTRANTE',
      status: 'ACTIVA',
      period: '2027-I',
      closes_on: '2027-01-01',
      created_by: admin_id,
    }),
  );
  unwrap(
    await service
      .from('applications')
      .insert({ id: applicationId, call_id: callId, applicant_id: student_id, status: 'ENVIADA' }),
  );
  unwrap(await client.storage.from('acceptance-letters').upload(letterPath, pdf));
  unwrap(
    await client.rpc('admin_save_incoming_document', {
      target: applicationId,
      kind: 'ACEPTACION_UNSAAC',
      path: letterPath,
      filename: 'carta.pdf',
      note: 'Prueba HTTP de aceptación.',
    }),
  );
  assert.equal(
    unwrap(await client.from('applications').select('status').eq('id', applicationId).single())
      .status,
    'ADMITIDO_UNSAAC',
  );
  unwrap(await client.storage.from('incoming-official-documents').upload(resolutionPath, pdf));
  unwrap(
    await client.rpc('admin_save_incoming_document', {
      target: applicationId,
      kind: 'RESOLUCION_MATRICULA',
      path: resolutionPath,
      filename: 'resolucion.pdf',
      note: 'Prueba HTTP de matrícula.',
    }),
  );
  const application = unwrap(
    await client
      .from('applications')
      .select('status,student_code')
      .eq('id', applicationId)
      .single(),
  );
  assert.equal(application.status, 'MATRICULA_HABILITADA');
  assert.equal(application.student_code, null);
  unwrap(
    await client.from('applications').update({ status: 'EN_MOVILIDAD' }).eq('id', applicationId),
  );
  const blocked = await client
    .from('applications')
    .update({ status: 'FINALIZADA' })
    .eq('id', applicationId);
  assert.equal(blocked.error?.code, '22023');
  unwrap(await client.storage.from('incoming-official-documents').upload(certificatePath, pdf));
  unwrap(
    await client.rpc('admin_save_incoming_document', {
      target: applicationId,
      kind: 'CERTIFICADO_ESTUDIOS',
      path: certificatePath,
      filename: 'certificado.pdf',
    }),
  );
  unwrap(
    await client.from('applications').update({ status: 'FINALIZADA' }).eq('id', applicationId),
  );
  const history = unwrap(
    await client
      .from('application_status_history')
      .select('status,note,changed_at')
      .eq('application_id', applicationId),
  );
  assert.equal(history.length, 5);
  assert.ok(history.every((item) => item.changed_at));
  assert.ok(
    history.some(
      (item) => item.status === 'MATRICULA_HABILITADA' && item.note === 'Prueba HTTP de matrícula.',
    ),
  );
  assert.ok(unwrap(await client.storage.from('acceptance-letters').download(letterPath)).size > 0);
  assert.ok(
    unwrap(await client.storage.from('incoming-official-documents').download(resolutionPath)).size >
      0,
  );
  assert.ok(
    unwrap(await client.storage.from('incoming-official-documents').download(certificatePath))
      .size > 0,
  );
  console.log(
    'SGME HTTP OK: cierre bloqueado sin certificado, carga final por OCRI, conclusión, historial y descarga del certificado.',
  );
} finally {
  unwrap(await service.storage.from('acceptance-letters').remove([letterPath]));
  unwrap(
    await service.storage
      .from('incoming-official-documents')
      .remove([resolutionPath, certificatePath]),
  );
  unwrap(await service.from('applications').delete().eq('id', applicationId));
  unwrap(await service.from('calls').delete().eq('id', callId));
  await client.auth.signOut({ scope: 'local' });
  console.log('Datos y archivos ficticios eliminados; expedientes existentes conservados.');
}
