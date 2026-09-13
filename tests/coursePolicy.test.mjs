import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCourseName,
  getCourseOptions,
  normalizeCourseKey,
  resolveCourseName
} from '../src/services/coursePolicy.js';

test('limpia espacios y unifica el símbolo de grado del curso', () => {
  assert.equal(cleanCourseName('  1º   Básico A  '), '1° Básico A');
});

test('crea un catálogo ordenado sin cursos equivalentes duplicados', () => {
  const courses = getCourseOptions([
    { course: '2° Básico B' },
    { course: '1° Básico A' },
    { course: '1º  Básico A' },
    { course: '' }
  ]);
  assert.deepEqual(courses, ['1° Básico A', '2° Básico B']);
});

test('reutiliza el nombre institucional de un curso equivalente', () => {
  assert.equal(normalizeCourseKey('Prekínder C'), 'PREKINDERC');
  assert.equal(resolveCourseName('6 basico a', ['6° Básico A']), '6° Básico A');
  assert.equal(resolveCourseName('  Taller 1  ', ['6° Básico A']), 'Taller 1');
});
