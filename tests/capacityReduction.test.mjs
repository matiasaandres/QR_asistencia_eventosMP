import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCapacityState, createCheckInPlan } from '../src/services/checkinPolicy.js';

test('bajar el cupo a cuatro conserva cinco ingresos y bloquea nuevos ingresos', () => {
  const student = { maxCapacity: 4, enteredCount: 5 };
  const state = getCapacityState(student);
  assert.equal(state.enteredCount, 5);
  assert.equal(state.remaining, 0);
  assert.equal(state.canAddExtra, false);
  assert.throws(() => createCheckInPlan({ student, count: 1 }), /completó el cupo/);
  assert.equal(getCapacityState({ maxCapacity: 4, enteredCount: 3 }).remaining, 1);
});

test('la actualización de cupos escribe solo capacidad, sin contadores ni bitácora', () => {
  const source = readFileSync(new URL('../src/services/storage.js', import.meta.url), 'utf8');
  const update = source.split('export async function saveStudentCapacities')[1].split('export async function saveStudentFamily')[0];
  assert.match(update, /batch\.update\(eventStudentDoc\(db, organizationId, eventId, ownerId\), \{ maxCapacity \}\)/);
  assert.match(update, /ownerCapacities/);
  assert.doesNotMatch(update, /enteredCount|extraGuest|lastEntryAt|batch\.set/);
});
