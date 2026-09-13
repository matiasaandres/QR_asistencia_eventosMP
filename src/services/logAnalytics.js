/**
 * Construcción de estadísticas agregadas desde la bitácora de movimientos.
 * Los documentos agregados reducen lecturas y no reemplazan al historial
 * original, que sigue siendo la fuente autoritativa.
 */

/** Tamaño máximo de cada página de historial. */
export const LOG_PAGE_SIZE = 50;

/** Versión del esquema de agregados para detectar reconstrucciones necesarias. */
export const LOG_ANALYTICS_VERSION = 2;
const HOUR_SHARDS = 5;

/** Genera un identificador estable para repartir datos analíticos.
 * @param {unknown} value Texto que se convertirá en hash.
 * @returns {string} Hash compacto en base 36.
 */
function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Convierte una marca temporal en una agrupación horaria.
 * @param {unknown} timestamp Marca temporal interpretable por Date.
 * @returns {{key: string, label: string}|null} Agrupación o null si es inválida.
 */
function hourBucket(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const key = date.toISOString().slice(0, 13);
  return {
    key,
    label: new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      hour12: false
    }).format(date)
  };
}

/** Produce mutaciones analíticas para un movimiento de acceso.
 * @param {object} log Registro de movimiento.
 * @param {string} logId Identificador del registro.
 * @returns {Array<object>} Mutaciones agrupadas por puerta y hora.
 */
export function analyticsMutationsForLog(log, logId = log?.id) {
  const count = Math.max(1, Number(log?.count) || 1);
  const movementType = ['ENTRY', 'EXIT', 'REENTRY'].includes(log?.movementType) ? log.movementType : 'ENTRY';
  const newAdmissions = movementType === 'EXIT'
    ? 0
    : Math.max(0, Math.min(count, Number(log?.newAdmissions ?? (movementType === 'ENTRY' ? count : 0)) || 0));
  const reentries = movementType === 'EXIT'
    ? 0
    : Math.max(0, Math.min(count - newAdmissions, Number(log?.reentries ?? (count - newAdmissions)) || 0));
  const exits = movementType === 'EXIT' ? count : 0;
  const doorName = String(log?.doorName || 'Acceso Principal').trim() || 'Acceso Principal';
  const hour = hourBucket(log?.timestamp);
  const mutations = [{
    id: `door-${hashText(doorName)}`,
    kind: 'door',
    key: doorName,
    label: doorName,
    people: newAdmissions,
    entries: newAdmissions,
    exits,
    reentries,
    movements: count,
    records: 1
  }];
  if (hour) {
    const shard = parseInt(hashText(logId), 36) % HOUR_SHARDS;
    mutations.push({
      id: `hour-${hour.key.replace(/[^0-9]/g, '')}-${shard}`,
      kind: 'hour',
      key: hour.key,
      label: hour.label,
      people: newAdmissions,
      entries: newAdmissions,
      exits,
      reentries,
      movements: count,
      records: 1
    });
  }
  return mutations;
}

/** Agrega los registros de acceso en documentos analíticos.
 * @param {Array<object>} logs Registros de movimiento.
 * @returns {Array<object>} Documentos agregados.
 */
export function buildAnalyticsDocuments(logs = []) {
  const documents = new Map();
  logs.forEach((log) => analyticsMutationsForLog(log, log.id).forEach((mutation) => {
    const current = documents.get(mutation.id) || {
      ...mutation, people: 0, entries: 0, exits: 0, reentries: 0, movements: 0, records: 0
    };
    current.people += mutation.people;
    current.entries += mutation.entries;
    current.exits += mutation.exits;
    current.reentries += mutation.reentries;
    current.movements += mutation.movements;
    current.records += mutation.records;
    documents.set(mutation.id, current);
  }));
  return [...documents.values()];
}

/** Resume documentos analíticos por puerta y hora.
 * @param {Array<object>} documents Documentos analíticos.
 * @returns {object} Indicadores agregados.
 */
export function summarizeAnalytics(documents = []) {
  const doors = new Map();
  const hours = new Map();
  const meta = documents.find((document) => document.id === 'meta');
  documents.forEach((document) => {
    if (document.id === 'meta') return;
    const target = document.kind === 'door' ? doors : document.kind === 'hour' ? hours : null;
    if (!target) return;
    const current = target.get(document.key) || {
      key: document.key,
      name: document.label,
      label: document.label,
      people: 0,
      entries: 0,
      exits: 0,
      reentries: 0,
      movements: 0,
      records: 0
    };
    current.people += Math.max(0, Number(document.people) || 0);
    current.entries += Math.max(0, Number(document.entries ?? document.people) || 0);
    current.exits += Math.max(0, Number(document.exits) || 0);
    current.reentries += Math.max(0, Number(document.reentries) || 0);
    current.movements += Math.max(0, Number(document.movements ?? document.people) || 0);
    current.records += Math.max(0, Number(document.records) || 0);
    target.set(document.key, current);
  });
  const activityByHour = [...hours.values()].sort((a, b) => a.key.localeCompare(b.key));
  const doorsList = [...doors.values()].sort((a, b) => b.people - a.people);
  return {
    ready: Boolean(meta),
    sourceLogCount: Math.max(0, Number(meta?.sourceLogCount) || 0),
    lastLogId: meta?.lastLogId || '',
    totalRecords: doorsList.reduce((total, door) => total + door.records, 0),
    totalEntries: doorsList.reduce((total, door) => total + door.entries, 0),
    totalExits: doorsList.reduce((total, door) => total + door.exits, 0),
    totalReentries: doorsList.reduce((total, door) => total + door.reentries, 0),
    totalMovements: doorsList.reduce((total, door) => total + door.movements, 0),
    doorsList,
    activityByHour: activityByHour.slice(-8)
  };
}
