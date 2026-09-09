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

test('permite crear la primera organización solamente a su propietario', () => {
  assert.match(rules, /request\.resource\.data\.ownerUid == request\.auth\.uid/);
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

test('no permite eliminar organizaciones, eventos ni estudiantes', () => {
  assert.ok((rules.match(/allow delete: if false;/g) || []).length >= 3);
});
