/**
 * Reglas para agrupar hermanos, compartir cupos y proyectar la capacidad
 * familiar sobre los registros individuales de estudiantes.
 */

/**
 * @param {unknown} value Identificador familiar original.
 * @returns {string} Identificador limpio o una cadena vacía.
 */
export function normalizeFamilyId(value) {
  return String(value || '').trim().toLocaleUpperCase('es');
}

/**
 * Crea un generador de códigos familiares consecutivos y sin colisiones.
 * @param {Array<object>} students Estudiantes cuyos códigos ya están ocupados.
 * @param {number} year Año que formará parte del código generado.
 * @returns {() => string} Función que entrega un código nuevo en cada llamada.
 */
export function createFamilyCodeGenerator(students = [], year = new Date().getFullYear()) {
  const usedCodes = new Set(students.map((student) => normalizeFamilyId(student?.familyId)).filter(Boolean));
  let sequence = 1;

  return () => {
    let candidate;
    do {
      candidate = `FAM-${year}-${String(sequence).padStart(3, '0')}`;
      sequence += 1;
    } while (usedCodes.has(candidate));
    usedCodes.add(candidate);
    return candidate;
  };
}

/**
 * Obtiene el registro que representa el cupo compartido de una familia.
 * @param {object} student Estudiante con `familyOwnerId` o `id`.
 * @returns {string} Identificador del propietario del cupo.
 */
export function getCapacityOwnerId(student = {}) {
  return String(student.familyOwnerId || student.id || '').trim();
}

/**
 * Construye el documento agregado que contiene el cupo familiar.
 * @param {string} familyId Código de la familia.
 * @param {Array<object|string>} members Miembros asociados a la familia.
 * @param {object} source Registro que aporta capacidad y contadores actuales.
 * @returns {object} Documento normalizado para Firestore o almacenamiento local.
 */
export function createFamilyRecord(familyId, members = [], source = {}) {
  const normalizedId = normalizeFamilyId(familyId);
  const memberIds = [...new Set(members.map((member) => String(member?.id || member).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const maxCapacity = Math.min(50, Math.max(1, Number(source.familyMaxCapacity ?? source.maxCapacity) || 4));
  const enteredCount = Math.min(maxCapacity + 1, Math.max(0, Number(source.familyEnteredCount ?? source.enteredCount) || 0));
  const insideCount = Math.min(enteredCount, Math.max(0, Number(source.familyInsideCount ?? source.insideCount ?? enteredCount) || 0));
  return {
    id: normalizedId,
    maxCapacity,
    enteredCount,
    insideCount,
    status: source.familyStatus || source.status || (enteredCount ? (enteredCount >= maxCapacity ? 'COMPLETO' : 'PARCIAL') : 'PENDIENTE'),
    members: memberIds,
    ...(source.familyLastEntryAt || source.lastEntryAt ? { lastEntryAt: source.familyLastEntryAt || source.lastEntryAt } : {}),
    ...(source.familyExtraGuest || source.extraGuest ? { extraGuest: source.familyExtraGuest || source.extraGuest } : {})
  };
}

/**
 * Agrupa estudiantes activos por familia y crea un registro por grupo.
 * @param {Array<object>} students Nómina del evento.
 * @returns {Array<object>} Registros familiares derivados, sin eliminados.
 */
export function deriveFamilyRecords(students = []) {
  const groups = new Map();
  students.forEach((student) => {
    if (student?.deleted === true) return;
    const familyId = normalizeFamilyId(student?.familyId);
    if (!familyId) return;
    if (!groups.has(familyId)) groups.set(familyId, []);
    groups.get(familyId).push(student);
  });
  return [...groups].map(([familyId, members]) => {
    const source = members.find((member) => member.id === getCapacityOwnerId(member)) || members[0];
    return createFamilyRecord(familyId, members, source);
  });
}

/**
 * Proyecta los contadores del documento familiar sobre cada estudiante.
 * Si no existe documento familiar, usa temporalmente el registro propietario
 * para conservar compatibilidad con datos creados por versiones anteriores.
 * @param {Array<object>} students Nómina individual del evento.
 * @param {Array<object>} families Documentos agregados de familias.
 * @returns {Array<object>} Estudiantes enriquecidos con campos calculados.
 */
export function hydrateFamilyCapacities(students = [], families = []) {
  const byId = new Map(students.map((student) => [student.id, student]));
  const familiesById = new Map(families.map((family) => [normalizeFamilyId(family?.id), family]));

  return students.map((student) => {
    const familyId = normalizeFamilyId(student.familyId);
    if (!familyId) return student;

    const family = familiesById.get(familyId);
    if (family) {
      return {
        ...student,
        familyId,
        familyMaxCapacity: family.maxCapacity,
        familyEnteredCount: family.enteredCount,
        familyInsideCount: family.insideCount,
        familyStatus: family.status,
        familyLastEntryAt: family.lastEntryAt,
        familyExtraGuest: family.extraGuest
      };
    }

    const owner = byId.get(getCapacityOwnerId(student));
    if (!owner) return student;

    return {
      ...student,
      familyId,
      familyOwnerId: owner.id,
      familyMaxCapacity: owner.maxCapacity,
      familyEnteredCount: owner.enteredCount,
      familyInsideCount: owner.insideCount,
      familyStatus: owner.status,
      familyLastEntryAt: owner.lastEntryAt,
      familyExtraGuest: owner.extraGuest
    };
  });
}

/**
 * Elimina del estudiante los campos calculados que no deben persistirse.
 * @param {object} student Estudiante posiblemente enriquecido.
 * @returns {object} Estudiante listo para guardar sin proyecciones familiares.
 */
export function stripFamilyCapacityProjection(student = {}) {
  const {
    familyMaxCapacity,
    familyEnteredCount,
    familyInsideCount,
    familyStatus,
    familyLastEntryAt,
    familyExtraGuest,
    familyOwnerId,
    ...storedStudent
  } = student;
  return storedStudent;
}

/**
 * Reduce una nómina a una fila por capacidad: una familia cuenta una sola vez.
 * Los estudiantes sin familia se conservan individualmente.
 * @param {Array<object>} students Estudiantes a consolidar.
 * @returns {Array<object>} Estudiantes representantes de cada capacidad.
 */
export function getUniqueCapacityStudents(students = []) {
  const seen = new Set();
  return students.filter((student) => {
    const familyId = normalizeFamilyId(student.familyId);
    if (!familyId) return true;
    const key = `family:${familyId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
