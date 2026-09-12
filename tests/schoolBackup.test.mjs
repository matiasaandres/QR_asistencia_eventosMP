import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBackupIntegrity,
  createSchoolBackup,
  schoolBackupFilename,
  validateSchoolBackup,
  verifyBackupIntegrity
} from '../src/services/schoolBackup.js';

test('crea un respaldo completo con resumen verificable', () => {
  const backup = createSchoolBackup({
    organization: { id: 'colegio-prueba', name: 'Colegio Prueba' },
    members: [{ id: 'admin-1', role: 'admin' }],
    venues: [{ id: 'auditorio', name: 'Auditorio', floors: [{}], seatCount: 10 }],
    events: [
      { id: 'evento-1', students: [{ id: 'alumno-1', familyId: 'FAM-2026-001' }], families: [{ id: 'FAM-2026-001', maxCapacity: 4, enteredCount: 2, members: ['alumno-1'] }], logs: [{ id: 'log-1', count: 2 }], seatPlan: { id: 'current', eventId: 'evento-1', assignments: { a1: { course: '1°' } } } },
      { id: 'evento-2', students: [{ id: 'alumno-2' }, { id: 'alumno-3' }], logs: [] }
    ],
    exportedAt: '2026-09-10T12:00:00.000Z'
  });

  assert.equal(backup.format, 'mundopalabra-school-backup');
  assert.equal(backup.schemaVersion, 4);
  assert.deepEqual(backup.summary, { members: 1, events: 2, students: 3, families: 1, logs: 1, familyChanges: 0, venues: 1, seatAssignments: 1 });
  assert.equal(backup.events[0].students[0].familyId, 'FAM-2026-001');
});

test('genera un nombre de archivo seguro para descargar', () => {
  assert.equal(
    schoolBackupFilename({ name: 'Colegio Ñuble Norte' }, new Date('2026-09-10T12:00:00.000Z')),
    'respaldo-colegio-nuble-norte-2026-09-10.json'
  );
});

test('solo permite restaurar un respaldo válido de la misma escuela', () => {
  const backup = createSchoolBackup({
    organization: { id: 'escuela-1', name: 'Escuela Uno' },
    events: [{
      id: 'evento-1', name: 'Evento escolar', institution: 'Escuela Uno', date: '2026-09-10',
      defaultCapacity: 4, doors: ['Entrada'], archived: false, studentsInitialized: true,
      students: [], families: [], logs: []
    }]
  });
  assert.equal(validateSchoolBackup(backup, 'escuela-1'), backup);
  assert.throws(() => validateSchoolBackup(backup, 'escuela-2'), /otra escuela/);
  assert.throws(() => validateSchoolBackup({ ...backup, format: 'archivo-desconocido' }, 'escuela-1'), /no es un respaldo válido/);
});

test('protege la integridad con SHA-256 y detecta cualquier modificación', async () => {
  const backup = createSchoolBackup({
    organization: { id: 'escuela-1', name: 'Escuela Uno' },
    events: []
  });
  const protectedBackup = await addBackupIntegrity(backup);
  assert.equal(protectedBackup.integrity.algorithm, 'SHA-256');
  assert.match(protectedBackup.integrity.value, /^[a-f0-9]{64}$/);
  assert.equal(await verifyBackupIntegrity(protectedBackup), true);

  const altered = { ...protectedBackup, organization: { ...protectedBackup.organization, name: 'Nombre alterado' } };
  await assert.rejects(() => verifyBackupIntegrity(altered), /modificado o está dañado/);
  await assert.rejects(() => verifyBackupIntegrity(backup), /no contiene una verificación SHA-256 válida/);
});

test('protege y valida la firma criptográfica HMAC-SHA-256 ante modificaciones y claves incorrectas', async () => {
  const backup = createSchoolBackup({
    organization: { id: 'escuela-1', name: 'Escuela Uno' },
    events: []
  });
  const secretKey = 'clave-secreta-institucional-2026';
  const signedBackup = await addBackupIntegrity(backup, secretKey);

  assert.equal(signedBackup.integrity.algorithm, 'HMAC-SHA-256');
  assert.match(signedBackup.integrity.value, /^[a-f0-9]{64}$/);
  assert.match(signedBackup.integrity.signature, /^[a-f0-9]{64}$/);

  assert.equal(await verifyBackupIntegrity(signedBackup, secretKey), true);
  await assert.rejects(
    () => verifyBackupIntegrity(signedBackup, 'clave-invalida'),
    /no coincide con la clave proporcionada/
  );

  const altered = {
    ...signedBackup,
    organization: { ...signedBackup.organization, name: 'Escuela Modificada' }
  };
  await assert.rejects(() => verifyBackupIntegrity(altered, secretKey), /modificado o está dañado/);
});
