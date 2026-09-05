export const DEFAULT_CAPACITY = 5;
export const REQUIRED_DOORS = ['Puerta 1', 'Puerta 2'];

export function normalizeCapacityValue(value, fallback = DEFAULT_CAPACITY) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export function getCapacityState(student = {}) {
  const maxCapacity = normalizeCapacityValue(student.maxCapacity);
  const parsedEntered = Number(student.enteredCount);
  const enteredCount = Number.isFinite(parsedEntered) ? Math.max(0, parsedEntered) : 0;
  const remaining = Math.max(0, maxCapacity - enteredCount);
  const hasExtraGuest = Boolean(student.extraGuest) || enteredCount > maxCapacity;
  const isRetired = student.status === 'RETIRADO'
    || String(student.course || '').trim().toLowerCase() === 'retirado';
  const isFull = remaining === 0;

  return {
    maxCapacity,
    enteredCount,
    remaining,
    isFull,
    hasExtraGuest,
    canAddExtra: isFull
      && maxCapacity > 0
      && enteredCount === maxCapacity
      && !hasExtraGuest
      && !isRetired,
    isRetired
  };
}

export function ensureRequiredDoors(eventData, fallbackEvent = {}) {
  const baseEvent = eventData && typeof eventData === 'object'
    ? eventData
    : fallbackEvent;
  const currentDoors = Array.isArray(baseEvent.doors)
    ? baseEvent.doors.map((door) => String(door).trim()).filter(Boolean)
    : [];

  return {
    ...baseEvent,
    doors: Array.from(new Set([...currentDoors, ...REQUIRED_DOORS]))
  };
}

export function normalizeExtraPerson(extraPerson) {
  if (!extraPerson) return null;

  return {
    name: String(extraPerson.name || '').trim(),
    relationship: String(extraPerson.relationship || '').trim()
  };
}

export function resetStudentAttendance(student = {}) {
  const { lastEntryAt, extraGuest, ...studentWithoutAttendance } = student;
  const capacity = getCapacityState(student);

  return {
    ...studentWithoutAttendance,
    enteredCount: 0,
    status: capacity.maxCapacity > 0 ? 'PENDIENTE' : student.status
  };
}

export function createCheckInPlan({
  student,
  count,
  doorName,
  timestampIso,
  extraPerson = null
}) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('La cantidad de personas debe ser un número entero mayor que cero.');
  }

  const capacity = getCapacityState(student);
  const normalizedExtraPerson = normalizeExtraPerson(extraPerson);

  if (normalizedExtraPerson) {
    if (count !== 1) {
      throw new Error('El cupo extraordinario solo permite registrar a una persona.');
    }
    if (normalizedExtraPerson.name.length < 2 || normalizedExtraPerson.name.length > 80) {
      throw new Error('Ingresa el nombre completo de la persona adicional.');
    }
    if (
      normalizedExtraPerson.relationship.length < 2
      || normalizedExtraPerson.relationship.length > 40
    ) {
      throw new Error('Selecciona o escribe el parentesco con el alumno.');
    }
    if (!capacity.canAddExtra) {
      if (capacity.isRetired || capacity.maxCapacity === 0) {
        throw new Error('Este alumno no está habilitado para un cupo extraordinario.');
      }
      throw new Error('El cupo extraordinario solo puede usarse una vez, después de completar el cupo normal.');
    }

    const extraGuest = {
      ...normalizedExtraPerson,
      addedAt: timestampIso,
      doorName: doorName || 'Acceso Principal'
    };

    return {
      newEntered: capacity.maxCapacity + 1,
      newStatus: 'CUPO_EXTRA',
      remaining: 0,
      isExtra: true,
      extraGuest
    };
  }

  if (capacity.remaining <= 0) {
    throw new Error('El estudiante ya completó el cupo máximo de personas.');
  }
  if (count > capacity.remaining) {
    throw new Error(`Solo quedan ${capacity.remaining} cupo(s) disponible(s).`);
  }

  const newEntered = capacity.enteredCount + count;
  return {
    newEntered,
    newStatus: newEntered >= capacity.maxCapacity ? 'COMPLETO' : 'PARCIAL',
    remaining: capacity.maxCapacity - newEntered,
    isExtra: false,
    extraGuest: null
  };
}
