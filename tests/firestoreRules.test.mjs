import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('aísla los datos por organización y exige membresía activa', () => {
  assert.match(rules, /match \/organizations\/\{organizationId\}/);
  assert.match(rules, /function isMember\(\)/);
  assert.match(rules, /members\/\$\(request\.auth\.uid\)/);
  assert.match(rules, /function canOperate\(\)/);
  assert.doesNotMatch(rules, /allow read: if true/);
  assert.doesNotMatch(rules, /match \/events\/\{eventId\}\/\{document=\*\*\}/);
});

test('reserva la creación y gestión global de escuelas para la cuenta maestra', () => {
  assert.match(rules, /function platformAdmin\(\)/);
  assert.match(rules, /function validStudentCounters\(data\)/);
  assert.match(rules, /data\.enteredCount <= data\.maxCapacity \+ 1/);
  assert.match(rules, /matias\.andres\.mh@gmail\.com/);
  assert.match(rules, /allow create: if platformAdmin\(\)/);
  assert.match(rules, /request\.resource\.data\.memberUids\.size\(\) == 1/);
  assert.match(rules, /data\.ownerUid in data\.memberUids/);
});

test('reserva eventos y nóminas para administradores', () => {
  assert.match(rules, /allow create: if isAdmin\(\) && validEvent/);
  assert.match(rules, /allow create: if isAdmin\(\)[\s\S]*eventWillBeOpen/);
  assert.match(rules, /data\.role in \['admin', 'operator', 'viewer'\]/);
});

test('permite operar accesos sin superar el cupo normal', () => {
  assert.match(rules, /request\.resource\.data\.enteredCount == resource\.data\.enteredCount \+ log\.newAdmissions/);
  assert.match(rules, /request\.resource\.data\.insideCount == resource\.data\.insideCount \+ log\.count/);
  assert.match(rules, /get\('lastLogId', ''\) == logId/);
  assert.match(rules, /!\('disabled' in resource\.data\) \|\| resource\.data\.disabled == false/);
  assert.match(rules, /!\('deleted' in resource\.data\) \|\| resource\.data\.deleted == false/);
});

test('mantiene los cupos familiares en documentos independientes', () => {
  assert.match(rules, /match \/families\/\{familyId\}/);
  assert.match(rules, /data\.members is list/);
  assert.match(rules, /data\.enteredCount <= data\.maxCapacity \+ 1/);
  assert.match(rules, /!\('familyId' in resource\.data\)/);
  assert.match(rules, /families\/\$\(request\.resource\.data\.familyId\)/);
});

test('protege sesiones de puerta, movimientos y el historial familiar', () => {
  assert.match(rules, /match \/doorSessions\/\{sessionId\}/);
  assert.match(rules, /request\.resource\.data\.operatorUid == request\.auth\.uid/);
  assert.match(rules, /match \/familyHistory\/\{historyId\}/);
  assert.match(rules, /data\.insideCount <= data\.enteredCount/);
  assert.match(rules, /data\.status in \['draft', 'open', 'paused', 'closed'\]/);
});

test('el cupo extraordinario exige identificación y máximo más uno', () => {
  assert.match(rules, /data\.enteredCount <= data\.maxCapacity \+ 1/);
  assert.match(rules, /'CUPO_EXTRA'/);
  assert.match(rules, /guestName\.size\(\) >= 2/);
  assert.match(rules, /relationship\.size\(\) >= 2/);
});

test('centraliza la identidad del alumno en una nómina maestra protegida', () => {
  assert.match(rules, /match \/studentDirectory\/\{studentId\}/);
  assert.match(rules, /function validStudentProfile\(data\)/);
  assert.match(rules, /data\.id == studentId/);
  assert.match(rules, /allow create, update: if isAdmin\(\) && validStudentProfile/);
  assert.match(rules, /'studentId', 'rut', 'name', 'rawName', 'course'/);
});

test('solo un administrador puede corregir historial y reiniciar asistencia', () => {
  assert.match(rules, /allow delete: if isAdmin\(\);/);
  assert.match(rules, /function adminMaintenance\(operation\)/);
});

test('los administradores pueden deshabilitar o eliminar miembros sin afectar al propietario ni a su propia cuenta', () => {
  assert.match(rules, /hasOnly\(\['name', 'logoUrl', 'primaryColor', 'memberUids', 'updatedAt'\]\)/);
  assert.match(rules, /data\.status in \['active', 'disabled'\]/);
  assert.match(rules, /userId != request\.auth\.uid/);
  assert.match(rules, /userId != get\(\/databases\/\$\(database\)\/documents\/organizations\/\$\(organizationId\)\)\.data\.ownerUid/);
});

test('no permite eliminar organizaciones, eventos ni estudiantes', () => {
  assert.ok((rules.match(/allow delete: if false;/g) || []).length >= 3);
});

test('protege establecimientos y asignaciones de asientos por evento', () => {
  assert.match(rules, /match \/venues\/\{venueId\}/);
  assert.match(rules, /allow create, update: if isAdmin\(\) && validVenue/);
  assert.match(rules, /match \/seatPlans\/\{seatPlanId\}/);
  assert.match(rules, /data\.eventId == eventId/);
  assert.match(rules, /data\.assignments is map/);
});

test('protege los agregados incrementales del historial', () => {
  assert.match(rules, /match \/analytics\/\{analyticsId\}/);
  assert.match(rules, /data\.kind in \['door', 'hour'\]/);
  assert.match(rules, /data\.people >= 0/);
  assert.match(rules, /data\.records >= 0/);
  assert.match(rules, /allow create, update: if isAdmin\(\)/);
  assert.match(rules, /'entries', 'exits', 'reentries', 'movements'/);
  assert.doesNotMatch(rules, /canOperate\(\) && analyticsId != 'meta'/);
});
