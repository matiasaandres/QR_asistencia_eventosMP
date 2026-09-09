import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('las reglas aíslan datos por eventos activos sin depender de un identificador fijo', () => {
  assert.doesNotMatch(rules, /eventId == 'acto-cultural-2026'/);
  assert.match(rules, /function eventIsOpen\(\)/);
  assert.match(rules, /documents\/events\/\$\(eventId\)/);
  assert.match(rules, /data\.archived == false/);
  assert.match(rules, /allow create: if validEvent\(request\.resource\.data\)/);
  assert.doesNotMatch(rules, /match \/\{document=\*\*\}/);
});

test('el ingreso normal no puede superar la capacidad configurada', () => {
  assert.match(rules, /enteredCount <= resource\.data\.maxCapacity/);
});

test('el extra exige exactamente máximo más uno y datos identificatorios', () => {
  assert.match(rules, /enteredCount == resource\.data\.maxCapacity \+ 1/);
  assert.match(rules, /status == 'CUPO_EXTRA'/);
  assert.match(rules, /extraGuest\.name\.size\(\) >= 2/);
  assert.match(rules, /extraGuest\.relationship\.size\(\) >= 2/);
  assert.match(rules, /!\('extraGuest' in resource\.data\)/);
});

test('la bitácora extraordinaria exige una persona, nombre y parentesco', () => {
  assert.match(rules, /request\.resource\.data\.isExtra == true/);
  assert.match(rules, /request\.resource\.data\.count == 1/);
  assert.match(rules, /guestName\.size\(\) >= 2/);
  assert.match(rules, /relationship\.size\(\) >= 2/);
});

test('el reinicio elimina el registro extraordinario además del contador', () => {
  assert.match(rules, /request\.resource\.data\.enteredCount == 0/);
  assert.match(rules, /!\('extraGuest' in request\.resource\.data\)/);
});

test('permite administrar cupos y deshabilitar sin cambiar identidad ni asistencia', () => {
  assert.match(rules, /hasOnly\(\['maxCapacity', 'disabled', 'deleted', 'deletedAt'\]\)/);
  assert.match(rules, /request\.resource\.data\.maxCapacity >= 1/);
  assert.match(rules, /maxCapacity <= 50/);
  assert.match(rules, /resource\.data\.disabled == false/);
  assert.match(rules, /resource\.data\.deleted == false/);
});

test('la eliminación de nómina es recuperable y no permite borrar documentos', () => {
  const studentsRules = rules.match(/match \/students\/\{studentId\} \{([\s\S]*?)match \/logs/)[1];
  assert.doesNotMatch(studentsRules, /allow delete/);
  assert.match(studentsRules, /'deleted', 'deletedAt'/);
});

test('permite eliminar registros individuales del historial', () => {
  const logsRules = rules.match(/match \/logs\/\{logId\} \{([\s\S]*?)\n      \}/)[1];
  assert.match(logsRules, /allow delete: if eventWillBeOpen\(\);/);
});

test('permite descontar del contador al remover un registro', () => {
  assert.match(rules, /enteredCount >= resource\.data\.enteredCount - 5/);
  assert.match(rules, /request\.resource\.data\.status == 'PARCIAL'/);
  assert.match(rules, /request\.resource\.data\.extraGuest == resource\.data\.extraGuest/);
});
