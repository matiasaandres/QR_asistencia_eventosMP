import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildAttendanceFromLogs } from '../src/services/attendanceReplay.js';

const logs = [
  { id: '1', timestamp: '2026-09-11T12:00:00Z', count: 3, movementType: 'ENTRY', newAdmissions: 3, accumulated: 3 },
  { id: '2', timestamp: '2026-09-11T12:10:00Z', count: 2, movementType: 'EXIT', newAdmissions: 0, reentries: 0, accumulated: 3 },
  { id: '3', timestamp: '2026-09-11T12:20:00Z', count: 2, movementType: 'REENTRY', newAdmissions: 0, reentries: 2, accumulated: 3 }
];

test('reconstruye entradas, salidas y reingresos en orden cronológico', () => {
  assert.deepEqual(
    (({ enteredCount, insideCount, status, lastLogId }) => ({ enteredCount, insideCount, status, lastLogId }))(rebuildAttendanceFromLogs(logs, 4)),
    { enteredCount: 3, insideCount: 3, status: 'PARCIAL', lastLogId: '3' }
  );
});

test('eliminar un movimiento antiguo recalcula desde la bitácora restante', () => {
  const rebuilt = rebuildAttendanceFromLogs(logs.filter((log) => log.id !== '1'), 4);
  assert.equal(rebuilt.enteredCount, 0);
  assert.equal(rebuilt.insideCount, 0);
  assert.equal(rebuilt.lastLogId, '3');
});

test('conserva el cupo extraordinario solo si su registro sigue presente', () => {
  const capacityEntry = { id: '4', timestamp: '2026-09-11T12:25:00Z', count: 1, movementType: 'ENTRY', newAdmissions: 1, accumulated: 4 };
  const extra = { id: '5', timestamp: '2026-09-11T12:30:00Z', count: 1, movementType: 'ENTRY', newAdmissions: 1, accumulated: 5, isExtra: true, guestName: 'Invitada', relationship: 'Tía' };
  const rebuilt = rebuildAttendanceFromLogs([...logs, capacityEntry, extra], 4);
  assert.equal(rebuilt.enteredCount, 5);
  assert.equal(rebuilt.status, 'CUPO_EXTRA');
  assert.equal(rebuilt.extraGuest.name, 'Invitada');
  assert.equal(rebuildAttendanceFromLogs(logs, 4).extraGuest, null);
});
