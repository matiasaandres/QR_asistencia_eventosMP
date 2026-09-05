import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENT, INITIAL_STUDENTS } from '../src/mock/sampleStudents.js';

test('la nómina inicial tiene 251 identificadores únicos y campos válidos', () => {
  assert.equal(INITIAL_STUDENTS.length, 251);
  assert.equal(new Set(INITIAL_STUDENTS.map((student) => student.id)).size, 251);

  for (const student of INITIAL_STUDENTS) {
    assert.match(student.id, /^MP-2026-\d{3}$/);
    assert.ok(student.name.trim().length >= 2);
    assert.ok(student.course.trim().length >= 2);
    assert.ok(Number.isInteger(student.maxCapacity));
    assert.ok(student.maxCapacity >= 0);
    assert.equal(student.enteredCount, 0);
    if (student.maxCapacity === 0) {
      assert.equal(student.status, 'RETIRADO');
    }
  }
});

test('el evento inicial contiene ambas puertas requeridas', () => {
  assert.ok(INITIAL_EVENT.doors.includes('Puerta 1'));
  assert.ok(INITIAL_EVENT.doors.includes('Puerta 2'));
});

test('la nómina incorpora los 250 RUT disponibles sin duplicarlos', () => {
  const ruts = INITIAL_STUDENTS.map((student) => student.rut).filter(Boolean);
  assert.equal(ruts.length, 250);
  assert.equal(new Set(ruts.map((rut) => rut.replace(/[^0-9K]/gi, '').toUpperCase())).size, 250);
  assert.ok(ruts.every((rut) => /^\d[\d.]*-[\dkK]$/.test(rut)));
});
