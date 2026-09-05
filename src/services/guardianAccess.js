export function normalizeRut(value = '') {
  const cleaned = String(value).toUpperCase().replace(/[^0-9K]/g, '');
  if (cleaned.length < 2) return '';
  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
}

export function normalizeCourseKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

export function findStudentForGuardian(students, rut, course) {
  const rutKey = normalizeRut(rut);
  const courseKey = normalizeCourseKey(course);

  if (!rutKey || !courseKey) return null;

  return students.find((student) => (
    student.status !== 'RETIRADO'
    && normalizeRut(student.rut) === rutKey
    && normalizeCourseKey(student.course) === courseKey
  )) || null;
}
