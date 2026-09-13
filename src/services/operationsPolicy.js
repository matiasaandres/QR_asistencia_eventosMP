import { getCapacityState } from './checkinPolicy.js';
import { getUniqueCapacityStudents, normalizeFamilyId } from './familyPolicy.js';

/**
 * Métricas operativas del evento: familias, puertas, ocupación y alertas.
 * Este módulo es puro y no realiza lecturas ni escrituras en Firebase.
 */

export const EVENT_STATUS_LABELS = {
  draft: 'Borrador',
  open: 'Abierto',
  paused: 'Pausado',
  closed: 'Cerrado'
};

/** Agrupa estudiantes activos por familia y calcula su estado operativo.
 * @param {Array<object>} students Nómina del evento.
 * @returns {Array<object>} Grupos familiares ordenados.
 */
export function getFamilyGroups(students = []) {
  const groups = new Map();
  students.filter((student) => student?.deleted !== true).forEach((student) => {
    const familyId = normalizeFamilyId(student.familyId) || `IND-${student.id}`;
    if (!groups.has(familyId)) groups.set(familyId, { id: familyId, isIndividual: !student.familyId, members: [] });
    groups.get(familyId).members.push(student);
  });
  return [...groups.values()].map((family) => {
    const capacity = getCapacityState(family.members[0]);
    return {
      ...family,
      members: family.members.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')),
      courses: [...new Set(family.members.map((member) => member.course || 'Sin curso'))],
      maxCapacity: capacity.maxCapacity,
      enteredCount: capacity.enteredCount,
      insideCount: capacity.insideCount,
      status: capacity.isAccessBlocked ? 'DESHABILITADA' : (capacity.isFull ? 'COMPLETA' : capacity.enteredCount ? 'PARCIAL' : 'PENDIENTE')
    };
  }).sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
}

/** Calcula conectividad y flujo reciente de cada puerta.
 * @param {Array<object>} doors Puertas configuradas.
 * @param {Array<object>} logs Movimientos registrados.
 * @param {Date|string|number} now Instante de referencia.
 * @returns {Array<object>} Métricas por puerta.
 */
export function buildDoorMetrics(doors = [], logs = [], now = new Date()) {
  const nowMs = new Date(now).getTime();
  return doors.map((door) => {
    const recent = logs.filter((log) => log.doorName === door.doorName && nowMs - new Date(log.timestamp).getTime() <= 60000);
    const lastMovement = logs.find((log) => log.doorName === door.doorName);
    const lastSeenMs = new Date(door.lastSeenAt || 0).getTime();
    return {
      ...door,
      connected: Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= 90000,
      lastMovementAt: lastMovement?.timestamp || door.lastMovementAt || '',
      lastMovementType: lastMovement?.movementType || door.lastMovementType || '',
      flowPerMinute: recent.reduce((sum, log) => sum + Math.max(1, Number(log.count) || 1), 0)
    };
  });
}

/** Genera alertas operativas de cupos, escaneos y conectividad.
 * @param {{students?: Array<object>, logs?: Array<object>, doors?: Array<object>, now?: Date}} input Datos operativos.
 * @returns {Array<object>} Alertas detectadas.
 */
export function buildOperationalAlerts({ students = [], logs = [], doors = [], now = new Date() } = {}) {
  const alerts = [];
  const unique = getUniqueCapacityStudents(students.filter((student) => !getCapacityState(student).isAccessBlocked));
  const full = unique.filter((student) => getCapacityState(student).isFull);
  if (full.length) alerts.push({ id: 'capacity', severity: 'high', title: 'Cupos agotados', detail: `${full.length} familia(s) completaron su cupo.` });
  const pending = unique.filter((student) => getCapacityState(student).enteredCount === 0);
  if (pending.length) alerts.push({ id: 'pending', severity: 'medium', title: 'Familias pendientes', detail: `${pending.length} familia(s) habilitadas aún no registran llegada.` });

  const recentBySubject = new Map();
  [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach((log) => {
    const key = log.familyId || log.studentId;
    const previous = recentBySubject.get(key);
    const currentTime = new Date(log.timestamp).getTime();
    if (previous && currentTime - previous.time <= 15000 && log.movementType !== 'EXIT' && previous.type !== 'EXIT') {
      alerts.push({ id: `repeat-${log.id}`, severity: 'high', title: 'Escaneo repetido', detail: `${log.studentName}: dos movimientos en menos de 15 segundos.` });
    }
    recentBySubject.set(key, { time: currentTime, type: log.movementType });
  });

  buildDoorMetrics(doors, logs, now).filter((door) => !door.connected).forEach((door) => {
    alerts.push({ id: `door-${door.id}`, severity: 'high', title: 'Puerta desconectada', detail: `${door.doorName} · ${door.operatorEmail || 'sin operador'} no reporta actividad.` });
  });
  return alerts;
}

/** Suma las personas actualmente dentro del recinto.
 * @param {Array<object>} students Nómina del evento.
 * @returns {number} Total de personas dentro.
 */
export function getInsideTotal(students = []) {
  return getUniqueCapacityStudents(students).reduce((sum, student) => sum + getCapacityState(student).insideCount, 0);
}
