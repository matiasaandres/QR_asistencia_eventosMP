import { getCapacityState } from './checkinPolicy.js';

export function getPendingFamilies(students = []) {
  return students.flatMap((student) => {
    const state = getCapacityState(student);
    if (state.isAccessBlocked || state.maxCapacity <= 0 || state.enteredCount !== 0) return [];
    return [{ id: student.id, name: String(student.name || 'Alumno sin nombre'),
      course: String(student.course || 'Sin curso'), capacity: state.maxCapacity }];
  }).sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es'));
}

const normalize = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function filterPendingFamilies(families, { query = '', course = '' } = {}) {
  const search = normalize(query);
  return families.filter((family) => (!course || family.course === course)
    && (!search || normalize(family.name).includes(search)));
}
