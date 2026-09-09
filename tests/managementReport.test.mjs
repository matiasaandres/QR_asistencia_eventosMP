import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManagementReportData, createManagementReportPdf } from '../src/services/managementReport.js';

test('el informe separa familias, personas, cupos y alumnos excluidos', () => {
  const data = buildManagementReportData({ students: [
    { course: '1° Básico A', maxCapacity: 5, enteredCount: 6, extraGuest: { name: 'Extra' } },
    { course: '1° Básico A', maxCapacity: 5, enteredCount: 0 },
    { course: '2° Básico A', maxCapacity: 5, enteredCount: 3, disabled: true },
    { course: 'Retirado', maxCapacity: 0, enteredCount: 0 }
  ] });
  assert.equal(data.families, 2);
  assert.equal(data.present, 1);
  assert.equal(data.attendance, 50);
  assert.equal(data.people, 6);
  assert.equal(data.usage, 60);
  assert.equal(data.available, 5); // An extra guest cannot consume another family's allowance.
  assert.equal(data.aboveCapacity, 1);
  assert.equal(data.extraFamilies, 1);
  assert.equal(data.excluded, 2);
});

test('el informe maneja denominadores cero sin porcentajes engañosos', () => {
  const data = buildManagementReportData({ students: [{ maxCapacity: 0, enteredCount: 1 }] });
  assert.equal(data.usage, null);
  assert.equal(data.attendance, 100);
  assert.equal(buildManagementReportData({}).attendance, null);
});

test('la bitácora agrupa por fecha y hora de Chile y señala registros inválidos', () => {
  const data = buildManagementReportData({ logs: [
    { count: 2, timestamp: '2026-01-02T01:30:00Z', doorName: 'Puerta 1' },
    { count: 3, timestamp: '2026-01-03T01:30:00Z', doorName: 'Puerta 1' },
    { count: 4, timestamp: 'inválida' },
    { count: -2, timestamp: '2026-01-02T01:30:00Z' }
  ] });
  assert.equal(data.hours.length, 2);
  assert.equal(data.hours[0].name, '2026-01-01 22:00');
  assert.equal(data.logPeople, 9);
  assert.equal(data.undatedPeople, 4);
  assert.equal(data.invalidCounts, 1);
  assert.equal(data.doors[0].people, 5);
});

test('genera PDF sin datos y pagina una nómina extensa sin perder cursos', async () => {
  const empty = await createManagementReportPdf({});
  assert.ok(empty.output().startsWith('%PDF-'));
  const students = Array.from({ length: 60 }, (_, i) => ({ course: `Curso ${i + 1} con nombre extenso para verificar ajustes de línea`, maxCapacity: 5, enteredCount: i % 6 }));
  const full = await createManagementReportPdf({ students });
  assert.ok(full.getNumberOfPages() > empty.getNumberOfPages());
  assert.equal(buildManagementReportData({ students }).courses.length, 60);
});
