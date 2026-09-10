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
  assert.match(rules, /platformAdmin\(\)[\s\S]*hasOnly\(\['maxCapacity', 'enteredCount', 'status', 'lastEntryAt', 'extraGuest'\]\)[\s\S]*request\.resource\.data\.enteredCount <= request\.resource\.data\.maxCapacity \+ 1/);
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
  assert.match(rules, /enteredCount <= resource\.data\.maxCapacity/);
  assert.match(rules, /resource\.data\.disabled == false/);
  assert.match(rules, /resource\.data\.deleted == false/);
});

test('mantiene los cupos familiares en documentos independientes', () => {
  assert.match(rules, /match \/families\/\{familyId\}/);
  assert.match(rules, /data\.members is list/);
  assert.match(rules, /data\.enteredCount <= data\.maxCapacity \+ 1/);
  assert.match(rules, /!\('familyId' in resource\.data\)/);
  assert.match(rules, /families\/\$\(request\.resource\.data\.familyId\)/);
});

test('el cupo extraordinario exige identificación y máximo más uno', () => {
  assert.match(rules, /enteredCount == resource\.data\.maxCapacity \+ 1/);
  assert.match(rules, /status == 'CUPO_EXTRA'/);
  assert.match(rules, /extraGuest\.name\.size\(\) >= 2/);
  assert.match(rules, /extraGuest\.relationship\.size\(\) >= 2/);
});

test('solo un administrador puede corregir historial y reiniciar asistencia', () => {
  assert.match(rules, /isAdmin\(\)[\s\S]*enteredCount == 0/);
  assert.match(rules, /enteredCount >= resource\.data\.enteredCount - 5/);
  assert.match(rules, /allow delete: if isAdmin\(\) && eventWillBeOpen\(\)/);
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
