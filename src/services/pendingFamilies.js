import { getCapacityState } from './checkinPolicy.js';
import { getUniqueCapacityStudents } from './familyPolicy.js';

/**
 * Selección y filtrado de familias que todavía no registran asistencia.
 */

/** Obtiene familias activas que aún no registran ingresos.
 * @param {Array<object>} students Nómina del evento.
 * @returns {Array<object>} Familias pendientes.
 */
export function getPendingFamilies(students = []) {
  const active = students.filter((student) => !getCapacityState(student).isAccessBlocked);
  return getUniqueCapacityStudents(active).flatMap((student) => {
    const state = getCapacityState(student);
    if (state.isAccessBlocked || state.maxCapacity <= 0 || state.enteredCount !== 0) return [];
    return [{ id: student.id, name: String(student.name || 'Alumno sin nombre'),
      course: String(student.course || 'Sin curso'), capacity: state.maxCapacity }];
  }).sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es'));
}

/** Normaliza texto para búsquedas sin tildes.
 * @param {unknown} value Valor a normalizar.
 * @returns {string} Texto normalizado.
 */
const normalize = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/**
 * Filtra familias pendientes por texto y curso.
 * @param {Array<object>} families Familias previamente calculadas.
 * @param {{query?: string, course?: string}} filters Filtros de búsqueda.
 * @returns {Array<object>} Familias que cumplen los filtros.
 */

/** Filtra familias pendientes por texto y curso.
 * @param {Array<object>} families Familias pendientes.
 * @param {{query?: string, course?: string}} options Filtros aplicados.
 * @returns {Array<object>} Familias filtradas.
 */
export function filterPendingFamilies(families, { query = '', course = '' } = {}) {
  const search = normalize(query);
  return families.filter((family) => (!course || family.course === course)
    && (!search || normalize(family.name).includes(search)));
}
