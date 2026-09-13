/**
 * Utilidades de búsqueda segura para identificar un estudiante por RUT y curso.
 * No autoriza sesiones ni expone datos: solo normaliza y filtra registros ya
 * disponibles para el flujo que las consume.
 */

/**
 * Normaliza un RUT chileno eliminando separadores y conservando su dígito verificador.
 * @param {unknown} value RUT escrito con o sin puntos y guion.
 * @returns {string} RUT en formato cuerpo-dígito o cadena vacía si es inválido.
 */
export function normalizeRut(value = '') {
  const cleaned = String(value).toUpperCase().replace(/[^0-9K]/g, '');
  if (cleaned.length < 2) return '';
  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
}

/**
 * Normaliza un curso para compararlo sin tildes, espacios ni símbolos.
 * @param {unknown} value Curso ingresado por la persona usuaria.
 * @returns {string} Clave de comparación normalizada.
 */
export function normalizeCourseKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Busca un único estudiante activo por RUT y curso.
 * @param {Array<object>} students Nómina disponible.
 * @param {string} rut RUT ingresado.
 * @param {string} course Curso ingresado.
 * @returns {object|null} Estudiante coincidente o `null`.
 */
export function findStudentForGuardian(students, rut, course) {
  const rutKey = normalizeRut(rut);
  const courseKey = normalizeCourseKey(course);

  if (!rutKey || !courseKey) return null;

  return students.find((student) => (
    student.status !== 'RETIRADO'
    && student.disabled !== true
    && normalizeRut(student.rut) === rutKey
    && normalizeCourseKey(student.course) === courseKey
  )) || null;
}
