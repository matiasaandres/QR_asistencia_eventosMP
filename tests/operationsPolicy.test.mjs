import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementPlan, getCapacityState } from '../src/services/checkinPolicy.js';
import { eventAllowsAccess, getEffectiveEventStatus, normalizeEvent } from '../src/services/eventPolicy.js';
import { buildDoorMetrics, buildOperationalAlerts, getFamilyGroups, getInsideTotal } from '../src/services/operationsPolicy.js';

const student = { id: 'A1', name: 'Ana', course: '1° A', maxCapacity: 4, enteredCount: 3, insideCount: 3 };

test('registra salida y reingreso sin consumir nuevamente el cupo', () => {
  const exit = createMovementPlan({ student, count: 2, movementType: 'EXIT', timestampIso: '2026-01-01T10:00:00Z' });
  assert.equal(exit.newEntered, 3);
  assert.equal(exit.newInside, 1);
  const reentry = createMovementPlan({ student: { ...student, insideCount: 1 }, count: 2, movementType: 'ENTRY', timestampIso: '2026-01-01T10:05:00Z' });
  assert.equal(reentry.movementType, 'REENTRY');
  assert.equal(reentry.newEntered, 3);
  assert.equal(reentry.newInside, 3);
});

test('combina reingresos y nuevos accesos respetando el cupo', () => {
  const plan = createMovementPlan({ student: { ...student, insideCount: 1 }, count: 3, movementType: 'ENTRY', timestampIso: '2026-01-01T10:05:00Z' });
  assert.equal(plan.reentries, 2);
  assert.equal(plan.newAdmissions, 1);
  assert.equal(plan.newEntered, 4);
  assert.equal(plan.newInside, 4);
});

test('aplica estados manuales y horario automático al evento', () => {
  const event = normalizeEvent({ id: 'e1', name: 'Gala', status: 'open', startsAt: '2026-09-10T20:00:00Z', endsAt: '2026-09-10T23:00:00Z' });
  assert.equal(getEffectiveEventStatus(event, '2026-09-10T19:00:00Z'), 'draft');
  assert.equal(getEffectiveEventStatus(event, '2026-09-10T21:00:00Z'), 'open');
  assert.equal(getEffectiveEventStatus(event, '2026-09-10T23:01:00Z'), 'closed');
  assert.equal(eventAllowsAccess({ ...event, status: 'paused' }, '2026-09-10T21:00:00Z'), false);
  assert.equal(event.startsAtTimestamp instanceof Date, true);
  assert.equal(event.endsAtTimestamp instanceof Date, true);
  assert.equal(eventAllowsAccess({ ...event, maintenanceState: 'running' }, '2026-09-10T21:00:00Z'), false);
});

test('resume familias, personas dentro, puertas y alertas operativas', () => {
  const students = [{ ...student, familyId: 'FAM-1', familyMaxCapacity: 4, familyEnteredCount: 3, familyInsideCount: 1 }, { id: 'A2', name: 'Beto', course: '2° A', familyId: 'FAM-1', familyMaxCapacity: 4, familyEnteredCount: 3, familyInsideCount: 1 }];
  assert.equal(getFamilyGroups(students)[0].members.length, 2);
  assert.equal(getInsideTotal(students), 1);
  const doors = [{ id: 'd1', doorName: 'Principal', lastSeenAt: '2026-09-10T10:00:00Z' }];
  assert.equal(buildDoorMetrics(doors, [], '2026-09-10T10:02:00Z')[0].connected, false);
  assert.ok(buildOperationalAlerts({ students, doors, now: '2026-09-10T10:02:00Z' }).some((alert) => alert.title === 'Puerta desconectada'));
  assert.equal(getCapacityState(students[0]).insideCount, 1);
});
