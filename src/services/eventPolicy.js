import { ensureRequiredDoors, normalizeCapacityValue, resetStudentAttendance } from './checkinPolicy.js';

/**
 * Normalización y reglas de ciclo de vida de los eventos escolares.
 * Mantiene los estados, fechas, puertas y nóminas en un formato común.
 */

/** Puertas disponibles por defecto en un evento nuevo. */
export const DEFAULT_EVENT_DOORS = ['Acceso Principal', 'Puerta 1', 'Puerta 2'];

/** Estados permitidos para el ciclo de vida de un evento. */
export const EVENT_STATUSES = ['draft', 'open', 'paused', 'closed'];

/**
 * Determina el estado efectivo considerando estado manual y ventana horaria.
 * @param {object} event Evento normalizado.
 * @param {Date|string|number} now Instante usado para evaluar el horario.
 * @returns {string} Estado efectivo del evento.
 */
export function getEffectiveEventStatus(event = {}, now = new Date()) {
  const configured = EVENT_STATUSES.includes(event.status) ? event.status : 'open';
  if (configured === 'paused' || configured === 'closed') return configured;
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startsAt = event.startsAt ? new Date(event.startsAt).getTime() : NaN;
  const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : NaN;
  if (Number.isFinite(startsAt) && currentTime < startsAt) return 'draft';
  if (Number.isFinite(endsAt) && currentTime >= endsAt) return 'closed';
  return configured;
}

/** Convierte una marca temporal a un valor compatible con Firestore.
 * @param {unknown} value Marca temporal de origen.
 * @returns {unknown} Marca temporal normalizada.
 */
function timestampForFirestore(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Indica si un evento acepta movimientos en el instante indicado.
 * @param {object} event Evento que se desea operar.
 * @param {Date|string|number} now Instante de evaluación.
 * @returns {boolean} `true` cuando el evento está abierto y no está mantenido.
 */
export function eventAllowsAccess(event = {}, now = new Date()) {
  return !event.archived
    && !event.maintenanceState
    && getEffectiveEventStatus(event, now) === 'open';
}

/**
 * Completa y sanea un evento proveniente de formulario, Firestore o caché.
 * @param {object} eventData Datos prioritarios del evento.
 * @param {object} fallbackEvent Valores de respaldo.
 * @returns {object} Evento con puertas, estados y timestamps normalizados.
 */
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
    status: EVENT_STATUSES.includes(source.status) ? source.status : (EVENT_STATUSES.includes(fallback.status) ? fallback.status : 'open'),
    startsAt: String(source.startsAt || fallback.startsAt || '').trim(),
    endsAt: String(source.endsAt || fallback.endsAt || '').trim(),
    defaultCapacity: Math.min(50, Math.max(1, defaultCapacity || 4)),
    archived: source.archived === true,
    studentsInitialized: source.studentsInitialized === true
  }, { doors: fallback.doors || DEFAULT_EVENT_DOORS });

  return {
    ...normalized,
    // Firestore rules cannot safely compare ISO strings with request.time. Keep
    // the strings for forms and add server-comparable timestamps for enforcement.
    startsAtTimestamp: timestampForFirestore(normalized.startsAt),
    endsAtTimestamp: timestampForFirestore(normalized.endsAt),
    doors: normalized.doors.length ? normalized.doors : DEFAULT_EVENT_DOORS
  };
}

/**
 * Genera un identificador legible y único para un evento.
 * @param {string} name Nombre del evento.
 * @param {string} date Fecha ISO opcional.
 * @param {number} now Marca temporal usada para completar la unicidad.
 * @returns {string} Identificador apto para una ruta de Firestore.
 */
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

/**
 * Prepara una nómina para un evento nuevo y reinicia su asistencia.
 * @param {Array<object>} students Estudiantes de origen.
 * @returns {Array<object>} Estudiantes activos sin contadores anteriores.
 */
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
      return { ...copy, enteredCount: 0, insideCount: 0, status: reset.status };
    });

  return prepared;
}

/**
 * Filtra estudiantes por los cursos seleccionados por la administración.
 * @param {Array<object>} students Nómina disponible.
 * @param {Array<string>} selectedCourses Cursos permitidos.
 * @returns {Array<object>} Estudiantes pertenecientes a esos cursos.
 */
export function selectStudentsForCourses(students = [], selectedCourses = []) {
  if (!Array.isArray(selectedCourses) || selectedCourses.length === 0) return [];
  const allowed = new Set(selectedCourses.map((course) => String(course || 'Sin curso')));
  return students.filter((student) => allowed.has(String(student?.course || 'Sin curso')));
}
