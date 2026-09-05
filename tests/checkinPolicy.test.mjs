import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCheckInPlan,
  ensureRequiredDoors,
  getCapacityState,
  normalizeCapacityValue,
  resetStudentAttendance
} from '../src/services/checkinPolicy.js';

const timestampIso = '2026-09-04T22:00:00.000Z';
const activeStudent = {
  id: 'MP-TEST-001',
  name: 'Alumno Prueba',
  course: '1° Básico A',
  maxCapacity: 5,
  enteredCount: 0,
  status: 'PENDIENTE'
};

test('conserva el cupo cero y no habilita extras para retirados', () => {
  const state = getCapacityState({
    ...activeStudent,
    course: 'Retirado',
    maxCapacity: 0,
    status: 'RETIRADO'
  });
  assert.equal(state.maxCapacity, 0);
  assert.equal(state.remaining, 0);
  assert.equal(state.isFull, true);
  assert.equal(state.canAddExtra, false);
});

test('usa cinco solo cuando la capacidad no existe o no es numérica', () => {
  assert.equal(getCapacityState({}).maxCapacity, 5);
  assert.equal(getCapacityState({ maxCapacity: 'no-numero' }).maxCapacity, 5);
  assert.equal(normalizeCapacityValue(0), 0);
  assert.equal(normalizeCapacityValue('7'), 7);
  assert.equal(normalizeCapacityValue(-3), 0);
});

test('agrega Puerta 1 y Puerta 2 sin duplicarlas ni borrar las existentes', () => {
  const event = ensureRequiredDoors({
    id: 'evento',
    doors: ['Acceso Principal', 'Puerta 1', '  Acceso Principal  ']
  });
  assert.deepEqual(event.doors, ['Acceso Principal', 'Puerta 1', 'Puerta 2']);
});

test('calcula un ingreso parcial y uno que completa exactamente el cupo', () => {
  const partial = createCheckInPlan({
    student: activeStudent,
    count: 3,
    doorName: 'Puerta 1',
    timestampIso
  });
  assert.deepEqual(partial, {
    newEntered: 3,
    newStatus: 'PARCIAL',
    remaining: 2,
    isExtra: false,
    extraGuest: null
  });

  const complete = createCheckInPlan({
    student: { ...activeStudent, enteredCount: 3, status: 'PARCIAL' },
    count: 2,
    doorName: 'Puerta 2',
    timestampIso
  });
  assert.equal(complete.newEntered, 5);
  assert.equal(complete.newStatus, 'COMPLETO');
  assert.equal(complete.remaining, 0);
});

test('rechaza cantidades inválidas y sobrepasar el cupo normal', () => {
  for (const count of [0, -1, 1.5, '2']) {
    assert.throws(() => createCheckInPlan({ student: activeStudent, count, timestampIso }));
  }

  assert.throws(
    () => createCheckInPlan({
      student: { ...activeStudent, enteredCount: 4 },
      count: 2,
      timestampIso
    }),
    /Solo quedan 1 cupo/
  );

  assert.throws(
    () => createCheckInPlan({
      student: { ...activeStudent, enteredCount: 5, status: 'COMPLETO' },
      count: 1,
      timestampIso
    }),
    /ya completó el cupo máximo/
  );
});

test('crea un único cupo extraordinario identificado después de completar el normal', () => {
  const plan = createCheckInPlan({
    student: { ...activeStudent, enteredCount: 5, status: 'COMPLETO' },
    count: 1,
    doorName: 'Puerta 2',
    timestampIso,
    extraPerson: { name: '  María González  ', relationship: 'Madre' }
  });

  assert.equal(plan.newEntered, 6);
  assert.equal(plan.newStatus, 'CUPO_EXTRA');
  assert.equal(plan.remaining, 0);
  assert.equal(plan.isExtra, true);
  assert.deepEqual(plan.extraGuest, {
    name: 'María González',
    relationship: 'Madre',
    addedAt: timestampIso,
    doorName: 'Puerta 2'
  });
});

test('rechaza el extra antes de completar el cupo, un segundo extra y alumnos retirados', () => {
  const extraPerson = { name: 'María González', relationship: 'Madre' };

  assert.throws(() => createCheckInPlan({
    student: { ...activeStudent, enteredCount: 4 },
    count: 1,
    timestampIso,
    extraPerson
  }), /solo puede usarse una vez/);

  assert.throws(() => createCheckInPlan({
    student: {
      ...activeStudent,
      enteredCount: 6,
      status: 'CUPO_EXTRA',
      extraGuest: { name: 'Persona anterior', relationship: 'Padre' }
    },
    count: 1,
    timestampIso,
    extraPerson
  }), /solo puede usarse una vez/);

  assert.throws(() => createCheckInPlan({
    student: {
      ...activeStudent,
      course: 'Retirado',
      maxCapacity: 0,
      enteredCount: 0,
      status: 'RETIRADO'
    },
    count: 1,
    timestampIso,
    extraPerson
  }), /no está habilitado/);
});

test('exige nombre, parentesco y exactamente una persona para el extra', () => {
  const fullStudent = { ...activeStudent, enteredCount: 5, status: 'COMPLETO' };

  assert.throws(() => createCheckInPlan({
    student: fullStudent,
    count: 2,
    timestampIso,
    extraPerson: { name: 'María González', relationship: 'Madre' }
  }), /solo permite registrar a una persona/);

  assert.throws(() => createCheckInPlan({
    student: fullStudent,
    count: 1,
    timestampIso,
    extraPerson: { name: 'M', relationship: 'Madre' }
  }), /nombre completo/);

  assert.throws(() => createCheckInPlan({
    student: fullStudent,
    count: 1,
    timestampIso,
    extraPerson: { name: 'María González', relationship: '' }
  }), /parentesco/);
});

test('una segunda transacción pierde la carrera y no puede crear otro extra', () => {
  const original = { ...activeStudent, enteredCount: 5, status: 'COMPLETO' };
  const first = createCheckInPlan({
    student: original,
    count: 1,
    timestampIso,
    extraPerson: { name: 'Persona Uno', relationship: 'Madre' }
  });
  const updated = {
    ...original,
    enteredCount: first.newEntered,
    status: first.newStatus,
    extraGuest: first.extraGuest
  };

  assert.throws(() => createCheckInPlan({
    student: updated,
    count: 1,
    timestampIso,
    extraPerson: { name: 'Persona Dos', relationship: 'Padre' }
  }), /solo puede usarse una vez/);
});

test('el reinicio vuelve a cero y elimina los datos del cupo extraordinario', () => {
  const reset = resetStudentAttendance({
    ...activeStudent,
    enteredCount: 6,
    status: 'CUPO_EXTRA',
    lastEntryAt: timestampIso,
    extraGuest: { name: 'Persona Uno', relationship: 'Madre' }
  });

  assert.equal(reset.enteredCount, 0);
  assert.equal(reset.status, 'PENDIENTE');
  assert.equal('lastEntryAt' in reset, false);
  assert.equal('extraGuest' in reset, false);
});
