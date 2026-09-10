import { ensureRequiredDoors, normalizeCapacityValue, resetStudentAttendance } from './checkinPolicy.js';

export const DEFAULT_EVENT_DOORS = ['Acceso Principal', 'Puerta 1', 'Puerta 2'];

export function normalizeEvent(eventData = {}, fallbackEvent = {}) {
  const source = eventData && typeof eventData === 'object' ? eventData : {};
  const fallback = fallbackEvent && typeof fallbackEvent === 'object' ? fallbackEvent : {};
  const defaultCapacity = normalizeCapacityValue(
    source.defaultCapacity,
    normalizeCapacityValue(fallback.defaultCapacity, 4)
  );
  const normalized = ensureRequiredDoors({
    ...fallback,
    ...source,
    id: String(source.id || fallback.id || '').trim(),
    name: String(source.name || fallback.name || 'Evento sin nombre').trim(),
    institution: String(source.institution || fallback.institution || 'Institución educativa').trim(),
    date: String(source.date || fallback.date || new Date().toISOString().slice(0, 10)).trim(),
    defaultCapacity: Math.min(50, Math.max(1, defaultCapacity || 4)),
    archived: source.archived === true,
    studentsInitialized: source.studentsInitialized === true
  }, { doors: fallback.doors || DEFAULT_EVENT_DOORS });

  return {
    ...normalized,
    doors: normalized.doors.length ? normalized.doors : DEFAULT_EVENT_DOORS
  };
}

export function createEventId(name, date, now = Date.now()) {
  const slug = String(name || 'evento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'evento';
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))
    ? String(date).replaceAll('-', '')
    : new Date(now).toISOString().slice(0, 10).replaceAll('-', '');

  return `${slug}-${datePart}-${Number(now).toString(36)}`;
}

export function prepareStudentsForEvent(students = []) {
  const prepared = students
    .filter((student) => student?.id && student.deleted !== true)
    .map((student) => {
      const reset = resetStudentAttendance(student);
      const {
        deleted, deletedAt, disabled, familyOwnerId,
        familyMaxCapacity, familyEnteredCount, familyStatus,
        familyLastEntryAt, familyExtraGuest,
        ...copy
      } = reset;
      return { ...copy, enteredCount: 0, status: reset.status };
    });

  return prepared;
}

export function selectStudentsForCourses(students = [], selectedCourses = []) {
  if (!Array.isArray(selectedCourses) || selectedCourses.length === 0) return [];
  const allowed = new Set(selectedCourses.map((course) => String(course || 'Sin curso')));
  return students.filter((student) => allowed.has(String(student?.course || 'Sin curso')));
}
