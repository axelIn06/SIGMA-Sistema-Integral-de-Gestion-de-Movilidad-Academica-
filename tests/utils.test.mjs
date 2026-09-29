import assert from 'node:assert/strict';
import test from 'node:test';
import {
  esc,
  shortDate,
  fullDateTime,
  isUuid,
  badge,
  isClosedApplication,
  isOperationalApplication,
  successfulMobilityHistory,
  mobilityEligibility,
  canStudentWithdrawApplication,
  opportunityLabel,
  filteredApps,
  getActiveStudentApplication,
  getActiveMobilityApplication,
  pendingApplications,
  applicationsInMobility,
} from '../src/utils.js';

const sampleApplication = (overrides = {}) => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  applicantId: 'user-123',
  direction: 'SALIENTE',
  activityType: 'MOVILIDAD',
  mobilityScope: 'INTERNACIONAL',
  period: '2027-I',
  status: 'ENVIADA',
  ...overrides,
});

const sampleSession = (overrides = {}) => ({
  userId: 'user-123',
  role: 'student',
  university: 'UNSAAC',
  ...overrides,
});

test('esc escapa caracteres HTML especiales', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
  assert.equal(esc('"comillas"'), '&quot;comillas&quot;');
  assert.equal(esc("'apostrofe'"), '&#39;apostrofe&#39;');
  assert.equal(esc('&'), '&amp;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('shortDate formatea fechas correctamente', () => {
  assert.equal(shortDate('2026-10-28'), '28/10/26');
  assert.equal(shortDate('2027-01-15'), '15/01/27');
  assert.equal(shortDate(''), 'Por definir');
  assert.equal(shortDate(null), 'Por definir');
  assert.equal(shortDate('invalido'), 'Por definir');
});

test('fullDateTime formatea fecha y hora en locale es-PE', () => {
  const result = fullDateTime('2026-10-28T15:30:00');
  assert.ok(result.includes('28'));
  assert.ok(result.includes('oct'));
  assert.ok(result.includes('2026'));
  assert.equal(fullDateTime(null), 'Sin fecha registrada');
  assert.equal(fullDateTime(''), 'Sin fecha registrada');
});

test('isUuid valida UUIDs v4', () => {
  assert.ok(isUuid('123e4567-e89b-12d3-a456-426614174000'));
  assert.ok(isUuid('550e8400-e29b-41d4-a716-446655440000'));
  assert.ok(!isUuid('not-a-uuid'));
  assert.ok(!isUuid('123e4567-e89b-12d3-a456-42661417400'));
  assert.ok(!isUuid(''));
  assert.ok(!isUuid(null));
});

test('badge retorna objeto con label, description y class', () => {
  const result = badge('ACEPTADO');
  assert.equal(result.label, 'Aceptado');
  assert.ok(result.description.includes('carta'));
  assert.equal(result.class, 'ok');
});

test('badge clasifica estados correctamente', () => {
  assert.equal(badge('APROBADO').class, 'ok');
  assert.equal(badge('RECHAZADO').class, 'bad');
  // OBSERVADA contiene RECHAZAD en el regex -> 'bad'
  assert.equal(badge('OBSERVADA').class, 'bad');
  assert.equal(badge('PENDIENTE').class, 'warn');
  assert.equal(badge('DESCONOCIDO').class, 'neutral');
});

test('isClosedApplication detecta estados finales', () => {
  assert.ok(isClosedApplication(sampleApplication({ status: 'RECHAZADA' })));
  assert.ok(isClosedApplication(sampleApplication({ status: 'NO_ACEPTADO_DESTINO' })));
  assert.ok(isClosedApplication(sampleApplication({ status: 'FINALIZADA' })));
  assert.ok(isClosedApplication(sampleApplication({ status: 'CONCLUIDO' })));
  assert.ok(isClosedApplication(sampleApplication({ status: 'CANCELADO' })));
  assert.ok(!isClosedApplication(sampleApplication({ status: 'ENVIADA' })));
  assert.ok(!isClosedApplication(sampleApplication({ status: 'ACEPTADO' })));
  assert.ok(!isClosedApplication(sampleApplication({ status: 'EN_MOVILIDAD' })));
});

test('isOperationalApplication excluye borradores y cerradas', () => {
  assert.ok(!isOperationalApplication(sampleApplication({ status: 'BORRADOR' })));
  assert.ok(!isOperationalApplication(sampleApplication({ status: 'RECHAZADA' })));
  assert.ok(isOperationalApplication(sampleApplication({ status: 'ENVIADA' })));
  assert.ok(isOperationalApplication(sampleApplication({ status: 'ACEPTADO' })));
  assert.ok(isOperationalApplication(sampleApplication({ status: 'EN_MOVILIDAD' })));
});

test('successfulMobilityHistory filtra movilidades exitosas salientes', () => {
  const apps = [
    sampleApplication({
      id: '1',
      applicantId: 'user-1',
      status: 'ACEPTADO',
      direction: 'SALIENTE',
      activityType: 'MOVILIDAD',
    }),
    sampleApplication({
      id: '2',
      applicantId: 'user-1',
      status: 'EN_MOVILIDAD',
      direction: 'SALIENTE',
      activityType: 'MOVILIDAD',
    }),
    sampleApplication({
      id: '3',
      applicantId: 'user-1',
      status: 'FINALIZADA',
      direction: 'SALIENTE',
      activityType: 'MOVILIDAD',
    }),
    sampleApplication({
      id: '4',
      applicantId: 'user-1',
      status: 'RECHAZADA',
      direction: 'SALIENTE',
      activityType: 'MOVILIDAD',
    }),
    sampleApplication({
      id: '5',
      applicantId: 'user-1',
      status: 'ACEPTADO',
      direction: 'ENTRANTE',
      activityType: 'MOVILIDAD',
    }),
    sampleApplication({
      id: '6',
      applicantId: 'user-1',
      status: 'ACEPTADO',
      direction: 'SALIENTE',
      activityType: 'PROGRAMA',
    }),
    sampleApplication({
      id: '7',
      applicantId: 'user-2',
      status: 'ACEPTADO',
      direction: 'SALIENTE',
      activityType: 'MOVILIDAD',
    }),
  ];
  const current = sampleApplication({ id: 'current', applicantId: 'user-1' });
  const result = successfulMobilityHistory(current, apps);
  assert.equal(result.length, 3);
  assert.ok(result.every((a) => a.applicantId === 'user-1'));
  assert.ok(result.every((a) => a.direction === 'SALIENTE'));
  assert.ok(result.every((a) => a.activityType === 'MOVILIDAD'));
});

test('mobilityEligibility detecta conflictos de año y ámbito', () => {
  const apps = [
    sampleApplication({
      id: '1',
      applicantId: 'user-1',
      status: 'ACEPTADO',
      period: '2027-I',
      mobilityScope: 'INTERNACIONAL',
      direction: 'SALIENTE',
      activityType: 'MOVILIDAD',
    }),
  ];
  const current = sampleApplication({
    id: '2',
    applicantId: 'user-1',
    period: '2027-I',
    mobilityScope: 'INTERNACIONAL',
    direction: 'SALIENTE',
    activityType: 'MOVILIDAD',
  });
  const result = mobilityEligibility(current, apps);
  assert.ok(result.applies);
  assert.ok(result.conflicts.some((c) => c.includes('2027')));
  assert.ok(result.conflicts.some((c) => c.includes('internacional')));
});

test('mobilityEligibility no aplica a entrantes ni programas especiales', () => {
  const apps = [sampleApplication({ id: '1', applicantId: 'user-1', status: 'ACEPTADO' })];
  assert.deepEqual(mobilityEligibility(sampleApplication({ direction: 'ENTRANTE' }), apps), {
    applies: false,
    conflicts: [],
  });
  assert.deepEqual(mobilityEligibility(sampleApplication({ activityType: 'PROGRAMA' }), apps), {
    applies: false,
    conflicts: [],
  });
  assert.deepEqual(mobilityEligibility(sampleApplication({ activityType: 'PASANTIA' }), apps), {
    applies: false,
    conflicts: [],
  });
});

test('canStudentWithdrawApplication solo permite retiro en estado ENVIADA', () => {
  const session = sampleSession();
  assert.ok(canStudentWithdrawApplication(session, sampleApplication({ status: 'ENVIADA' })));
  assert.ok(!canStudentWithdrawApplication(session, sampleApplication({ status: 'ACEPTADO' })));
  assert.ok(!canStudentWithdrawApplication(session, sampleApplication({ status: 'BORRADOR' })));
  assert.ok(
    !canStudentWithdrawApplication(
      { ...session, role: 'admin' },
      sampleApplication({ status: 'ENVIADA' }),
    ),
  );
  assert.ok(
    !canStudentWithdrawApplication(
      { ...session, userId: 'other' },
      sampleApplication({ status: 'ENVIADA' }),
    ),
  );
  assert.ok(
    !canStudentWithdrawApplication(
      session,
      sampleApplication({ direction: 'ENTRANTE', status: 'ENVIADA' }),
    ),
  );
});

test('opportunityLabel retorna etiqueta según tipo y ámbito', () => {
  assert.equal(
    opportunityLabel(sampleApplication({ activityType: 'PROGRAMA' })),
    'Programa especial · sin restricciones',
  );
  assert.equal(
    opportunityLabel(sampleApplication({ activityType: 'PASANTIA' })),
    'Pasantía · sin restricciones',
  );
  assert.equal(
    opportunityLabel(sampleApplication({ mobilityScope: 'INTERNACIONAL' })),
    'Movilidad internacional',
  );
  assert.equal(
    opportunityLabel(sampleApplication({ mobilityScope: 'NACIONAL' })),
    'Movilidad nacional',
  );
  // Por defecto sampleApplication usa INTERNACIONAL
  assert.equal(opportunityLabel(sampleApplication({})), 'Movilidad internacional');
});

test('filteredApps filtra por dirección y rol', () => {
  const session = sampleSession();
  const apps = [
    sampleApplication({ id: '1', direction: 'SALIENTE', applicantId: 'user-123' }),
    sampleApplication({ id: '2', direction: 'ENTRANTE', applicantId: 'user-123' }),
    sampleApplication({ id: '3', direction: 'SALIENTE', applicantId: 'other' }),
  ];
  assert.equal(filteredApps(apps, session, 'SALIENTE').length, 1);
  assert.equal(filteredApps(apps, session, 'ENTRANTE').length, 1);
  assert.equal(filteredApps(apps, { ...session, role: 'admin' }, 'SALIENTE').length, 2);
});

test('getActiveStudentApplication retorna la primera no cerrada', () => {
  const session = sampleSession();
  const apps = [
    sampleApplication({ id: '1', status: 'RECHAZADA' }),
    sampleApplication({ id: '2', status: 'ENVIADA' }),
    sampleApplication({ id: '3', status: 'ACEPTADO' }),
  ];
  const result = getActiveStudentApplication(apps, session);
  assert.equal(result.id, '2');
});

test('getActiveStudentApplication retorna null si todas cerradas', () => {
  const session = sampleSession();
  const apps = [
    sampleApplication({ id: '1', status: 'RECHAZADA' }),
    sampleApplication({ id: '2', status: 'FINALIZADA' }),
  ];
  assert.equal(getActiveStudentApplication(apps, session), null);
});

test('getActiveMobilityApplication usa dirección según rol', () => {
  const studentSession = sampleSession({ role: 'student' });
  const externalSession = sampleSession({ role: 'external' });
  const apps = [
    sampleApplication({ id: '1', direction: 'SALIENTE', status: 'ENVIADA' }),
    sampleApplication({ id: '2', direction: 'ENTRANTE', status: 'ENVIADA' }),
  ];
  assert.equal(getActiveMobilityApplication(apps, studentSession).direction, 'SALIENTE');
  assert.equal(getActiveMobilityApplication(apps, externalSession).direction, 'ENTRANTE');
});

test('pendingApplications filtra operativas no en movilidad', () => {
  const apps = [
    sampleApplication({ id: '1', status: 'ENVIADA' }),
    sampleApplication({ id: '2', status: 'EN_MOVILIDAD' }),
    sampleApplication({ id: '3', status: 'BORRADOR' }),
    sampleApplication({ id: '4', status: 'RECHAZADA' }),
  ];
  const result = pendingApplications(apps);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '1');
});

test('pendingApplications filtra por dirección', () => {
  const apps = [
    sampleApplication({ id: '1', direction: 'SALIENTE', status: 'ENVIADA' }),
    sampleApplication({ id: '2', direction: 'ENTRANTE', status: 'ENVIADA' }),
  ];
  assert.equal(pendingApplications(apps, 'SALIENTE').length, 1);
  assert.equal(pendingApplications(apps, 'ENTRANTE').length, 1);
});

test('applicationsInMobility retorna solo EN_MOVILIDAD operativas', () => {
  const apps = [
    sampleApplication({ id: '1', status: 'EN_MOVILIDAD' }),
    sampleApplication({ id: '2', status: 'ENVIADA' }),
    sampleApplication({ id: '3', status: 'EN_MOVILIDAD' }),
    sampleApplication({ id: '4', status: 'BORRADOR' }),
  ];
  const result = applicationsInMobility(apps);
  assert.equal(result.length, 2);
  assert.ok(result.every((a) => a.status === 'EN_MOVILIDAD'));
});
