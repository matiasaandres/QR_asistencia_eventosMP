/**
 * Separa la identidad estable del alumno de su estado operativo por evento.
 * Así nombre, RUT y curso se almacenan una sola vez por establecimiento.
 */

export const STUDENT_PROFILE_FIELDS = ['id', 'rut', 'name', 'rawName', 'course'];

/** Construye la ficha maestra persistente de un alumno. */
export function createStudentProfile(student = {}, updatedAt = new Date().toISOString()) {
  const id = String(student.id || student.studentId || '').trim();
  if (!id) throw new Error('El alumno necesita un identificador para la nómina maestra.');
  const profile = {
    id,
    rut: String(student.rut || '').trim(),
    name: String(student.name || 'Alumno sin nombre').trim(),
    course: String(student.course || 'Sin curso').trim(),
    updatedAt
  };
  if (student.rawName) profile.rawName = String(student.rawName).trim();
  return profile;
}

/** Construye el estado mínimo que pertenece a un evento. */
export function createEventEnrollment(student = {}, defaultCapacity = 4) {
  const studentId = String(student.studentId || student.id || '').trim();
  if (!studentId) throw new Error('La inscripción necesita un alumno válido.');
  const rawCapacity = Number(student.maxCapacity ?? defaultCapacity);
  const safeCapacity = Number.isFinite(rawCapacity) ? rawCapacity : Number(defaultCapacity) || 4;
  const enrollment = {
    studentId,
    maxCapacity: Math.max(0, Math.min(50, Math.trunc(safeCapacity))),
    enteredCount: Math.max(0, Math.trunc(Number(student.enteredCount) || 0)),
    insideCount: Math.max(0, Math.trunc(Number(student.insideCount) || 0)),
    status: String(student.status || 'PENDIENTE')
  };
  ['familyId', 'disabled', 'deleted', 'deletedAt', 'lastEntryAt', 'lastMovementAt', 'extraGuest', 'lastLogId']
    .forEach((field) => {
      if (student[field] !== undefined && student[field] !== '') enrollment[field] = student[field];
    });
  return enrollment;
}

/** Une una inscripción con la ficha maestra, conservando datos heredados como respaldo. */
export function hydrateEventStudent(enrollment = {}, profile = null, documentId = '') {
  const id = String(enrollment.studentId || enrollment.id || profile?.id || documentId || '').trim();
  return {
    ...enrollment,
    ...(profile || {}),
    id,
    studentId: id
  };
}

/** Indica si un documento de evento todavía duplica información personal. */
export function isLegacyEventStudent(student = {}) {
  return STUDENT_PROFILE_FIELDS.some((field) => field in student) || !student.studentId;
}
