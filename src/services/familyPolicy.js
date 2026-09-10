export function normalizeFamilyId(value) {
  return String(value || '').trim().toLocaleUpperCase('es');
}

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

export function getCapacityOwnerId(student = {}) {
  return String(student.familyOwnerId || student.id || '').trim();
}

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
