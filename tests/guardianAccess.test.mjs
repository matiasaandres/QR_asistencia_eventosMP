import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findStudentForGuardian,
  normalizeCourseKey,
  normalizeRut
} from '../src/services/guardianAccess.js';

const students = [
  { id: 'MP-2026-001', rut: '24.617.421-0', course: '6° Básico A', status: 'PENDIENTE' },
  { id: 'MP-2026-002', rut: '25.111.222-K', course: 'Retirado', status: 'RETIRADO' }
];

test('normaliza RUT con puntos, espacios y dígito K', () => {
  assert.equal(normalizeRut(' 24.617.421-0 '), '24617421-0');
  assert.equal(normalizeRut('25 111 222-k'), '25111222-K');
});

test('normaliza el curso sin depender de tildes o símbolos', () => {
  assert.equal(normalizeCourseKey('6° Básico A'), '6BASICOA');
  assert.equal(normalizeCourseKey('Prekínder C'), 'PREKINDERC');
});

test('encuentra solo un estudiante activo cuando coinciden RUT y curso', () => {
  assert.equal(findStudentForGuardian(students, '246174210', '6° Básico A')?.id, 'MP-2026-001');
  assert.equal(findStudentForGuardian(students, '24.617.421-0', '5° Básico A'), null);
  assert.equal(findStudentForGuardian(students, '25.111.222-k', 'Retirado'), null);
});
