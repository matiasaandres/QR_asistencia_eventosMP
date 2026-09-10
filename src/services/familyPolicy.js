export function normalizeFamilyId(value) {
  return String(value || '').trim().toLocaleUpperCase('es');
}

export function getCapacityOwnerId(student = {}) {
  return String(student.familyOwnerId || student.id || '').trim();
}

export function hydrateFamilyCapacities(students = []) {
  const byId = new Map(students.map((student) => [student.id, student]));

  return students.map((student) => {
    const familyId = normalizeFamilyId(student.familyId);
    if (!familyId) return student;

    const owner = byId.get(getCapacityOwnerId(student));
    if (!owner) return student;

    return {
      ...student,
      familyId,
      familyOwnerId: owner.id,
      familyMaxCapacity: owner.maxCapacity,
      familyEnteredCount: owner.enteredCount,
      familyStatus: owner.status,
      familyLastEntryAt: owner.lastEntryAt,
      familyExtraGuest: owner.extraGuest
    };
  });
}

export function stripFamilyCapacityProjection(student = {}) {
  const {
    familyMaxCapacity,
    familyEnteredCount,
    familyStatus,
    familyLastEntryAt,
    familyExtraGuest,
    ...storedStudent
  } = student;
  return storedStudent;
}

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
