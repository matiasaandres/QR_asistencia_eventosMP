/** Valor reservado para habilitar la creación explícita de un curso. */
export const NEW_COURSE_VALUE = '__NEW_COURSE__';

/**
 * Limpia el nombre visible de un curso sin inventar un formato institucional.
 * @param {unknown} value Nombre recibido desde formulario o planilla.
 * @returns {string} Nombre listo para guardar.
 */
export function cleanCourseName(value = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/º/g, '°');
}

/**
 * Construye una clave tolerante a tildes, espacios y símbolos para detectar
 * variantes accidentales como "1º A", "1° A" o "1 A".
 * @param {unknown} value Nombre del curso.
 * @returns {string} Clave de comparación.
 */
export function normalizeCourseKey(value = '') {
  return cleanCourseName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Obtiene un catálogo ordenado y sin duplicados desde una nómina o una lista.
 * Conserva la primera escritura institucional encontrada para mostrarla.
 * @param {Array<object|string>} source Estudiantes o nombres de curso.
 * @returns {Array<string>} Cursos disponibles.
 */
export function getCourseOptions(source = []) {
  const coursesByKey = new Map();
  source.forEach((item) => {
    const course = cleanCourseName(typeof item === 'string' ? item : item?.course);
    const key = normalizeCourseKey(course);
    if (key && !coursesByKey.has(key)) coursesByKey.set(key, course);
  });
  return [...coursesByKey.values()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/**
 * Reutiliza el nombre ya registrado cuando el nuevo texto solo cambia en su
 * puntuación o espaciado, evitando crear cursos duplicados.
 * @param {unknown} value Curso nuevo propuesto.
 * @param {Array<string>} existingCourses Catálogo vigente.
 * @returns {string} Curso existente o nombre limpio.
 */
export function resolveCourseName(value, existingCourses = []) {
  const cleanValue = cleanCourseName(value);
  const key = normalizeCourseKey(cleanValue);
  return existingCourses.find((course) => normalizeCourseKey(course) === key) || cleanValue;
}
