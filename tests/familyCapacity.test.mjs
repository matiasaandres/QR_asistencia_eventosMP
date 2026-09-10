import test from 'node:test';
import assert from 'node:assert/strict';
import { getCapacityState, createCheckInPlan } from '../src/services/checkinPolicy.js';
import { prepareStudentsForEvent } from '../src/services/eventPolicy.js';
import { getUniqueCapacityStudents, hydrateFamilyCapacities, stripFamilyCapacityProjection } from '../src/services/familyPolicy.js';

const siblings = [
  {
    id: 'MP-001', name: 'Ana Pérez', course: '3°A', familyId: 'fam-perez',
    familyOwnerId: 'MP-001', maxCapacity: 4, enteredCount: 3, status: 'PARCIAL'
  },
  {
    id: 'MP-002', name: 'Juan Pérez', course: '6°B', familyId: 'fam-perez',
    familyOwnerId: 'MP-001', maxCapacity: 4, enteredCount: 0, status: 'PENDIENTE'
  }
];

test('los hermanos muestran y consumen el mismo cupo familiar', () => {
  const hydrated = hydrateFamilyCapacities(siblings);
  const ana = getCapacityState(hydrated[0]);
  const juan = getCapacityState(hydrated[1]);

  assert.equal(ana.enteredCount, 3);
  assert.equal(juan.enteredCount, 3);
  assert.equal(juan.remaining, 1);
  assert.equal(getUniqueCapacityStudents(hydrated).length, 1);
  const plan = createCheckInPlan({ student: hydrated[1], count: 1, timestampIso: '2026-09-10T12:00:00.000Z' });
  assert.equal(plan.newEntered, 4);
  assert.equal(plan.newStatus, 'COMPLETO');
});

test('deshabilitar un hermano no deshabilita al resto de la familia', () => {
  const hydrated = hydrateFamilyCapacities([{ ...siblings[0], disabled: true }, siblings[1]]);
  assert.equal(getCapacityState(hydrated[0]).isAccessBlocked, true);
  assert.equal(getCapacityState(hydrated[1]).isAccessBlocked, false);
});

test('un evento nuevo reactiva alumnos y reinicia el cupo familiar', () => {
  const copied = prepareStudentsForEvent([
    { ...siblings[0], disabled: true, familyEnteredCount: 3, familyMaxCapacity: 4 },
    { ...siblings[1], familyEnteredCount: 3, familyMaxCapacity: 4 }
  ]);

  assert.equal(copied[0].disabled, undefined);
  assert.equal(copied[0].enteredCount, 0);
  assert.equal(copied[1].enteredCount, 0);
  assert.equal(copied[0].familyOwnerId, 'MP-001');
  assert.equal(copied[1].familyOwnerId, 'MP-001');
});

test('los campos familiares calculados no se persisten en el alumno', () => {
  const projected = hydrateFamilyCapacities(siblings)[1];
  const stored = stripFamilyCapacityProjection(projected);
  assert.equal('familyEnteredCount' in stored, false);
  assert.equal('familyMaxCapacity' in stored, false);
  assert.equal(stored.familyId, 'FAM-PEREZ');
});
