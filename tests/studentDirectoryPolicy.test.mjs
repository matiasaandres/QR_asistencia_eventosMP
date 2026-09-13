import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEventEnrollment,
  createStudentProfile,
  hydrateEventStudent,
  isLegacyEventStudent
} from '../src/services/studentDirectoryPolicy.js';

test('separa identidad maestra y estado operativo del evento', () => {
  const student = {
    id: 'MP-1', rut: '12.345.678-9', name: 'Ana Pérez', rawName: 'ANA PEREZ', course: '3° A',
    familyId: 'FAM-1', maxCapacity: 4, enteredCount: 2, insideCount: 1, status: 'PARCIAL'
  };
  const profile = createStudentProfile(student, '2026-09-13T00:00:00.000Z');
  const enrollment = createEventEnrollment(student);
  assert.deepEqual(profile, {
    id: 'MP-1', rut: '12.345.678-9', name: 'Ana Pérez', rawName: 'ANA PEREZ', course: '3° A', updatedAt: '2026-09-13T00:00:00.000Z'
  });
  assert.equal(enrollment.studentId, 'MP-1');
  assert.equal(enrollment.familyId, 'FAM-1');
  assert.equal(enrollment.name, undefined);
  assert.equal(enrollment.rut, undefined);
  assert.equal(enrollment.course, undefined);
});

test('hidrata inscripciones nuevas y documentos heredados', () => {
  const enrollment = createEventEnrollment({ id: 'MP-2', maxCapacity: 3 });
  const hydrated = hydrateEventStudent(enrollment, { id: 'MP-2', name: 'Beto', rut: '1-9', course: '4°' });
  assert.equal(hydrated.name, 'Beto');
  assert.equal(hydrated.maxCapacity, 3);
  assert.equal(hydrated.id, 'MP-2');
  assert.equal(isLegacyEventStudent(enrollment), false);
  assert.equal(isLegacyEventStudent({ id: 'MP-2', name: 'Beto', maxCapacity: 3 }), true);
  assert.equal(createEventEnrollment({ id: 'RET', maxCapacity: 0 }).maxCapacity, 0);
});
