function statusForEnteredCount(enteredCount, maxCapacity) {
  if (enteredCount <= 0) return 'PENDIENTE';
  if (enteredCount >= maxCapacity) return 'COMPLETO';
  return 'PARCIAL';
}

export function rebuildAttendanceFromLogs(logs = [], maxCapacity = 0) {
  const capacity = Math.max(0, Number(maxCapacity) || 0);
  let enteredCount = 0;
  let insideCount = 0;
  let extraGuest = null;
  let lastEntryAt = null;
  let lastMovementAt = null;
  let lastLogId = null;
  const ordered = [...logs].sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || ''))
    || String(left.id || '').localeCompare(String(right.id || '')));

  ordered.forEach((log) => {
    const count = Math.max(1, Number(log.count) || 1);
    const movementType = ['ENTRY', 'EXIT', 'REENTRY'].includes(log.movementType) ? log.movementType : 'ENTRY';
    if (movementType === 'EXIT') {
      insideCount = Math.max(0, insideCount - count);
    } else {
      const inferredAdmissions = Math.max(0, (Number(log.accumulated) || enteredCount) - enteredCount);
      const newAdmissions = Math.max(0, Math.min(count, Number.isInteger(log.newAdmissions) ? log.newAdmissions : inferredAdmissions));
      enteredCount = Math.min(capacity + 1, enteredCount + newAdmissions);
      insideCount = Math.min(enteredCount, insideCount + count);
      lastEntryAt = log.timestamp || lastEntryAt;
      if (log.isExtra === true) {
        extraGuest = {
          name: String(log.guestName || 'Persona extraordinaria'),
          relationship: String(log.relationship || 'Sin parentesco informado'),
          addedAt: log.timestamp || '',
          doorName: log.doorName || 'Acceso Principal'
        };
      }
    }
    lastMovementAt = log.timestamp || lastMovementAt;
    lastLogId = log.id || lastLogId;
  });

  return {
    enteredCount,
    insideCount,
    status: extraGuest ? 'CUPO_EXTRA' : statusForEnteredCount(enteredCount, capacity),
    extraGuest,
    lastEntryAt,
    lastMovementAt,
    lastLogId
  };
}
