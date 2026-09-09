import test from 'node:test';
import assert from 'node:assert/strict';
import { getPendingFamilies, filterPendingFamilies } from '../src/services/pendingFamilies.js';
import { buildManagementReportData } from '../src/services/managementReport.js';

test('identifica solo familias activas con cupo y cero ingresos', () => {
  const students = [
    { id: 'pending', name: 'Ana Pérez', course: '1° Básico A', maxCapacity: 5, enteredCount: 0 },
    { id: 'partial', maxCapacity: 5, enteredCount: 1 },
    { id: 'full', maxCapacity: 5, enteredCount: 5 },
    { id: 'disabled', maxCapacity: 5, enteredCount: 0, disabled: true },
    { id: 'retired', maxCapacity: 5, enteredCount: 0, status: 'RETIRADO' },
    { id: 'no-capacity', maxCapacity: 0, enteredCount: 0 }
  ];
  assert.deepEqual(getPendingFamilies(students).map((family) => family.id), ['pending']);
  assert.deepEqual(buildManagementReportData({ students }).pendingFamilies, getPendingFamilies(students));
  students[0].enteredCount = 1;
  assert.equal(getPendingFamilies(students).length, 0);
});

test('filtra por nombre sin tildes y curso sin agrupar alumnos por apellido', () => {
  const families = getPendingFamilies([
    { name: 'Ana Pérez', course: '2° Básico A' },
    { name: 'Luis Pérez', course: '1° Básico A' }
  ]);
  assert.equal(families.length, 2);
  assert.equal(families[0].name, 'Luis Pérez');
  assert.equal(filterPendingFamilies(families, { query: ' PEREZ ' }).length, 2);
  assert.equal(filterPendingFamilies(families, { query: 'perez', course: '2° Básico A' })[0].name, 'Ana Pérez');
  assert.equal(filterPendingFamilies(families, { query: 'nadie' }).length, 0);
  assert.deepEqual(getPendingFamilies([]), []);
});
