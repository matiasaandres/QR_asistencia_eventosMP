/**
 * Creación, validación, firma y restauración de respaldos completos de una
 * escuela. La clave HMAC se recibe por operación y nunca se guarda en la app.
 */

import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { initFirebase } from './firebase.js';
import { deriveFamilyRecords } from './familyPolicy.js';
import { buildAnalyticsDocuments, LOG_ANALYTICS_VERSION } from './logAnalytics.js';

/** Convierte valores Firestore y estructuras anidadas a datos serializables.
 * @param {unknown} value Valor a serializar.
 * @returns {unknown} Valor serializable.
 */
function serializeValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item)]));
}

/** Serializa objetos con claves ordenadas para obtener una representación estable.
 * @param {unknown} value Valor que se serializará.
 * @returns {string} JSON canónico.
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Calcula el resumen SHA-256 de un respaldo.
 * @param {object} value Respaldo a resumir.
 * @returns {Promise<string>} Hash hexadecimal.
 * @throws {Error} Si Web Crypto no está disponible.
 */
async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador no permite verificar respaldos con SHA-256.');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Firma un respaldo mediante HMAC-SHA-256.
 * @param {string} keyString Clave de firma.
 * @param {object} value Respaldo a firmar.
 * @returns {Promise<string>} Firma hexadecimal.
 * @throws {Error} Si Web Crypto no está disponible.
 */
async function hmacSha256(keyString, value) {
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador no permite firmar respaldos con HMAC.');
  const enc = new TextEncoder();
  const keyData = enc.encode(keyString);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const bytes = enc.encode(canonicalJson(value));
  const signature = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, bytes);
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Añade integridad SHA-256 y, opcionalmente, una firma HMAC.
 * @param {object} backup Respaldo que se protegerá.
 * @param {string|null} signingKey Clave opcional de firma.
 * @returns {Promise<object>} Respaldo con integridad.
 */
export async function addBackupIntegrity(backup, signingKey = null) {
  const hash = await sha256(backup);
  const integrity = {
    algorithm: signingKey ? 'HMAC-SHA-256' : 'SHA-256',
    value: hash,
    ...(signingKey ? { signature: await hmacSha256(signingKey, backup) } : {})
  };
  return {
    ...backup,
    integrity
  };
}

/** Verifica el hash y la firma opcional de un respaldo.
 * @param {object} backup Respaldo que se verificará.
 * @param {string|null} verificationKey Clave opcional de verificación.
 * @returns {Promise<boolean>} True si la integridad es válida.
 * @throws {Error} Si el hash, firma o contenido no coinciden.
 */
export async function verifyBackupIntegrity(backup, verificationKey = null) {
  const algorithm = backup?.integrity?.algorithm;
  const hashValue = backup?.integrity?.value;
  const signature = backup?.integrity?.signature;

  if (
    (algorithm !== 'SHA-256' && algorithm !== 'HMAC-SHA-256') ||
    !/^[a-f0-9]{64}$/i.test(hashValue || '')
  ) {
    throw new Error('El respaldo no contiene una verificación SHA-256 válida.');
  }
  const { integrity, ...content } = backup;
  const expected = await sha256(content);
  if (expected !== hashValue.toLowerCase()) {
    throw new Error('La verificación SHA-256 falló: el respaldo fue modificado o está dañado.');
  }
  if (algorithm === 'HMAC-SHA-256' && !verificationKey) {
    throw new Error('Este respaldo está firmado. Ingresa su clave de respaldo para verificarlo.');
  }
  if (algorithm === 'HMAC-SHA-256' && verificationKey) {
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) {
      throw new Error('El respaldo no contiene una firma criptográfica válida.');
    }
    const expectedSignature = await hmacSha256(verificationKey, content);
    if (expectedSignature !== signature.toLowerCase()) {
      throw new Error('La firma criptográfica del respaldo no coincide con la clave proporcionada.');
    }
  }
  return true;
}

/** Extrae datos serializables de un documento Firestore.
 * @param {object} snapshot Snapshot de Firestore.
 * @returns {object} Datos del documento con su identificador.
 */
function documentData(snapshot) {
  return serializeValue({ ...snapshot.data(), id: snapshot.id });
}

/** Construye un respaldo completo de una escuela.
 * @param {{organization: object, members?: Array<object>, venues?: Array<object>, events?: Array<object>, exportedAt?: string}} input Datos de la escuela.
 * @returns {object} Respaldo con resumen y esquema.
 */
export function createSchoolBackup({ organization, members = [], venues = [], events = [], exportedAt = new Date().toISOString() }) {
  const normalizedEvents = events.map((event) => ({
    ...serializeValue(event),
    students: (event.students || []).map(serializeValue),
    families: (event.families || []).map(serializeValue),
    logs: (event.logs || []).map(serializeValue),
    familyHistory: (event.familyHistory || []).map(serializeValue),
    seatPlan: event.seatPlan ? serializeValue(event.seatPlan) : null
  }));
  return {
    format: 'mundopalabra-school-backup',
    schemaVersion: 4,
    exportedAt,
    organization: serializeValue(organization),
    members: members.map(serializeValue),
    venues: venues.map(serializeValue),
    events: normalizedEvents,
    summary: {
      members: members.length,
      events: normalizedEvents.length,
      students: normalizedEvents.reduce((total, event) => total + event.students.length, 0),
      families: normalizedEvents.reduce((total, event) => total + event.families.length, 0),
      logs: normalizedEvents.reduce((total, event) => total + event.logs.length, 0),
      familyChanges: normalizedEvents.reduce((total, event) => total + event.familyHistory.length, 0),
      venues: venues.length,
      seatAssignments: normalizedEvents.reduce((total, event) => total + Object.keys(event.seatPlan?.assignments || {}).length, 0)
    }
  };
}

/** Genera un nombre de archivo seguro para un respaldo escolar.
 * @param {object} organization Organización respaldada.
 * @param {Date} date Fecha del respaldo.
 * @returns {string} Nombre de archivo JSON.
 */
export function schoolBackupFilename(organization, date = new Date()) {
  const safeName = String(organization?.name || organization?.id || 'escuela')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'escuela';
  return `respaldo-${safeName}-${date.toISOString().slice(0, 10)}.json`;
}

/** Descarga todos los datos de una escuela y calcula su integridad.
 * @param {string} organizationId Organización a respaldar.
 * @param {string} signingKey Clave opcional de firma.
 * @returns {Promise<object>} Respaldo completo.
 * @throws {Error} Si Firebase no está disponible o la organización no existe.
 */
export async function fetchSchoolBackup(organizationId, signingKey = '') {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) throw new Error('Firebase no está conectado; no se puede generar un respaldo completo.');
  if (!organizationId) throw new Error('Selecciona una escuela válida.');

  const organizationRef = doc(db, 'organizations', organizationId);
  const [organizationSnapshot, membersSnapshot, eventsSnapshot, venuesSnapshot] = await Promise.all([
    getDoc(organizationRef),
    getDocs(collection(organizationRef, 'members')),
    getDocs(collection(organizationRef, 'events')),
    getDocs(collection(organizationRef, 'venues'))
  ]);
  if (!organizationSnapshot.exists()) throw new Error('La escuela ya no existe en la base de datos.');

  const events = await Promise.all(eventsSnapshot.docs.map(async (eventSnapshot) => {
    const eventRef = eventSnapshot.ref;
    const [studentsSnapshot, familiesSnapshot, logsSnapshot, familyHistorySnapshot, seatPlanSnapshot] = await Promise.all([
      getDocs(collection(eventRef, 'students')),
      getDocs(collection(eventRef, 'families')),
      getDocs(collection(eventRef, 'logs')),
      getDocs(collection(eventRef, 'familyHistory')),
      getDoc(doc(eventRef, 'seatPlans', 'current'))
    ]);
    return {
      ...documentData(eventSnapshot),
      students: studentsSnapshot.docs.map(documentData),
      families: familiesSnapshot.docs.map(documentData),
      logs: logsSnapshot.docs.map(documentData),
      familyHistory: familyHistorySnapshot.docs.map(documentData),
      seatPlan: seatPlanSnapshot.exists() ? documentData(seatPlanSnapshot) : null
    };
  }));

  return addBackupIntegrity(createSchoolBackup({
    organization: documentData(organizationSnapshot),
    members: membersSnapshot.docs.map(documentData),
    venues: venuesSnapshot.docs.map(documentData),
    events
  }), signingKey);
}

/** Genera y descarga un respaldo completo de una escuela.
 * @param {string} organizationId Organización a respaldar.
 * @param {string} signingKey Clave de respaldo.
 * @returns {Promise<object>} Resumen del respaldo descargado.
 * @throws {Error} Si la clave o la conexión no son válidas.
 */
export async function downloadSchoolBackup(organizationId, signingKey = '') {
  if (String(signingKey).length < 12) throw new Error('La clave de respaldo debe tener al menos 12 caracteres.');
  const backup = await fetchSchoolBackup(organizationId, signingKey);
  const payload = JSON.stringify(backup, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = schoolBackupFilename(backup.organization);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return backup.summary;
}

const BATCH_LIMIT = 400;
/** Indica si un valor puede usarse como identificador de documento.
 * @param {unknown} value Valor candidato.
 * @returns {boolean} True si es un identificador válido.
 */
const validDocumentId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 500 && !value.includes('/');

/** Valida estructura, pertenencia e identificadores de un respaldo.
 * @param {object} backup Respaldo a validar.
 * @param {string} organizationId Organización esperada.
 * @returns {true} True si el respaldo es válido.
 * @throws {Error} Si el respaldo está incompleto o es incompatible.
 */
export function validateSchoolBackup(backup, organizationId) {
  if (!backup || backup.format !== 'mundopalabra-school-backup' || ![1, 2, 3, 4].includes(backup.schemaVersion)) {
    throw new Error('El archivo no es un respaldo válido de MundoPalabra.');
  }
  if (backup.organization?.id !== organizationId) {
    throw new Error(`Este respaldo pertenece a otra escuela (${backup.organization?.name || backup.organization?.id || 'desconocida'}).`);
  }
  if (!Array.isArray(backup.events) || !Array.isArray(backup.members)) {
    throw new Error('El respaldo está incompleto o dañado.');
  }
  if (backup.schemaVersion >= 4 && !Array.isArray(backup.venues)) throw new Error('El respaldo no contiene sus establecimientos.');
  const eventIds = new Set();
  backup.events.forEach((event) => {
    if (!validDocumentId(event?.id) || eventIds.has(event.id)) throw new Error('El respaldo contiene eventos con identificadores inválidos o repetidos.');
    eventIds.add(event.id);
    if (typeof event.name !== 'string' || event.name.length < 2 || !Number.isInteger(event.defaultCapacity) || event.defaultCapacity < 1 || event.defaultCapacity > 50 || !Array.isArray(event.doors) || event.doors.length < 1) {
      throw new Error(`El evento ${event.name || event.id} tiene una configuración inválida.`);
    }
    if (!Array.isArray(event.students) || !Array.isArray(event.logs)) throw new Error(`El evento ${event.name || event.id} está incompleto.`);
    if (backup.schemaVersion >= 2 && !Array.isArray(event.families)) throw new Error(`El evento ${event.name || event.id} no contiene sus familias.`);
    if (backup.schemaVersion >= 3 && !Array.isArray(event.familyHistory)) throw new Error(`El evento ${event.name || event.id} no contiene su historial familiar.`);
    if (backup.schemaVersion >= 4 && event.seatPlan != null && (event.seatPlan.id !== 'current' || event.seatPlan.eventId !== event.id || typeof event.seatPlan.assignments !== 'object')) throw new Error(`El evento ${event.name || event.id} contiene un plano de asientos inválido.`);
    const studentIds = new Set();
    event.students.forEach((student) => {
      if (!validDocumentId(student?.id) || studentIds.has(student.id)) throw new Error(`El evento ${event.name || event.id} contiene alumnos inválidos o repetidos.`);
      studentIds.add(student.id);
      if (!Number.isInteger(student.maxCapacity) || student.maxCapacity < 0 || student.maxCapacity > 50) throw new Error(`El alumno ${student.name || student.id} tiene un cupo inválido.`);
      if (!Number.isInteger(student.enteredCount) || student.enteredCount < 0 || student.enteredCount > student.maxCapacity + 1) throw new Error(`El alumno ${student.name || student.id} tiene un contador inválido.`);
    });
    (event.families || []).forEach((family) => {
      if (!validDocumentId(family?.id) || !Number.isInteger(family.maxCapacity) || family.maxCapacity < 1 || family.maxCapacity > 50 || !Number.isInteger(family.enteredCount) || !Array.isArray(family.members)) {
        throw new Error(`El evento ${event.name || event.id} contiene una familia inválida.`);
      }
    });
    const logIds = new Set();
    event.logs.forEach((log) => {
      if (!validDocumentId(log?.id) || logIds.has(log.id)) throw new Error(`El evento ${event.name || event.id} contiene registros inválidos o repetidos.`);
      logIds.add(log.id);
      if (!Number.isInteger(log.count) || log.count < 1 || log.count > 5) throw new Error(`El registro ${log.id} tiene una cantidad inválida.`);
    });
  });
  (backup.venues || []).forEach((venue) => {
    if (!validDocumentId(venue?.id) || typeof venue.name !== 'string' || !Array.isArray(venue.floors) || !Number.isInteger(venue.seatCount) || venue.seatCount < 1 || venue.seatCount > 1000) throw new Error('El respaldo contiene un establecimiento inválido.');
  });
  return backup;
}

/** Ejecuta operaciones de escritura en lotes de Firestore.
 * @param {object} db Cliente de Firestore.
 * @param {Array<Function>} operations Operaciones de escritura.
 * @returns {Promise<void>} Promesa de confirmación.
 */
async function commitOperations(db, operations) {
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.slice(start, start + BATCH_LIMIT).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

/** Normaliza los datos de un evento restaurado.
 * @param {object} event Evento del respaldo.
 * @returns {object} Datos listos para persistir.
 */
function restoredEventData(event) {
  const keys = ['id', 'name', 'institution', 'date', 'defaultCapacity', 'doors', 'status', 'startsAt', 'endsAt', 'archived', 'studentsInitialized', 'initializedAt', 'createdAt', 'updatedAt'];
  const restored = { status: 'open', startsAt: '', endsAt: '', ...Object.fromEntries(keys.filter((key) => event[key] !== undefined).map((key) => [key, event[key]])) };
  const startsAt = restored.startsAt ? new Date(restored.startsAt) : null;
  const endsAt = restored.endsAt ? new Date(restored.endsAt) : null;
  return {
    ...restored,
    startsAtTimestamp: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
    endsAtTimestamp: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null
  };
}

/** Restaura un evento y sus subcolecciones de forma controlada.
 * @param {object} eventRef Referencia al evento destino.
 * @param {object} eventData Datos del evento.
 * @param {object} work Acumuladores de trabajo.
 * @returns {Promise<void>} Promesa de restauración.
 */
async function restoreEventSafely(eventRef, eventData, work) {
  const startedAt = new Date().toISOString();
  await setDoc(eventRef, {
    ...eventData,
    maintenanceState: 'running', maintenanceOperation: 'restore', maintenanceStartedAt: startedAt, updatedAt: startedAt
  }, { merge: true });
  try {
    const result = await work();
    await setDoc(eventRef, {
      maintenanceState: '', maintenanceOperation: '', maintenanceStartedAt: '',
      maintenanceCompletedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }, { merge: true });
    return result;
  } catch (error) {
    await setDoc(eventRef, {
      maintenanceState: 'failed', maintenanceOperation: 'restore', updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
    throw new Error(`La restauración del evento quedó incompleta y fue bloqueada para evitar movimientos sobre datos parciales. Reintenta el respaldo. ${error.message}`);
  }
}

/** Valida y restaura un respaldo completo en una organización.
 * @param {string} organizationId Organización destino.
 * @param {object|string} rawBackup Respaldo u objeto JSON.
 * @param {string} verificationKey Clave de verificación HMAC.
 * @returns {Promise<object>} Resumen de restauración.
 * @throws {Error} Si el respaldo no supera validación o integridad.
 */
export async function restoreSchoolBackup(organizationId, rawBackup, verificationKey = '') {
  const backup = validateSchoolBackup(rawBackup, organizationId);
  await verifyBackupIntegrity(backup, verificationKey || null);
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) throw new Error('Firebase no está conectado; no se puede restaurar el respaldo.');
  const organizationRef = doc(db, 'organizations', organizationId);
  const currentEventsSnapshot = await getDocs(collection(organizationRef, 'events'));
  const restoredEventIds = new Set(backup.events.map((event) => event.id));

  await commitOperations(db, (backup.venues || []).map((venue) => (batch) => {
    const { id, ...data } = venue;
    batch.set(doc(organizationRef, 'venues', id), { ...data, id });
  }));

  for (const event of backup.events) {
    const eventRef = doc(organizationRef, 'events', event.id);
    await restoreEventSafely(eventRef, { ...restoredEventData(event), archived: false, studentsInitialized: true }, async () => {
    const [currentStudents, currentFamilies, currentLogs, currentFamilyHistory, currentAnalytics] = await Promise.all([
      getDocs(collection(eventRef, 'students')),
      getDocs(collection(eventRef, 'families')),
      getDocs(collection(eventRef, 'logs')),
      getDocs(collection(eventRef, 'familyHistory')),
      getDocs(collection(eventRef, 'analytics'))
    ]);
    const restoredFamilies = event.families || deriveFamilyRecords(event.students || []);
    await commitOperations(db, currentFamilies.docs
      .filter((family) => !restoredFamilies.some((restored) => restored.id === family.id))
      .map((family) => (batch) => batch.delete(family.ref)));
    await commitOperations(db, restoredFamilies.map((family) => (batch) => {
      const { id, ...data } = family;
      batch.set(doc(eventRef, 'families', id), { ...data, id, insideCount: Math.max(0, Number(data.insideCount ?? data.enteredCount) || 0) });
    }));
    const restoredStudentIds = new Set(event.students.map((student) => student.id));
    const studentOperations = event.students.map((student) => (batch) => {
      const { id, ...data } = student;
      batch.set(doc(eventRef, 'students', id), { ...data, id, insideCount: Math.max(0, Number(data.insideCount ?? data.enteredCount) || 0) });
    });
    currentStudents.docs
      .filter((student) => !restoredStudentIds.has(student.id))
      .forEach((student) => studentOperations.push((batch) => batch.update(student.ref, {
        deleted: true,
        deletedAt: new Date().toISOString()
      })));
    await commitOperations(db, studentOperations);

    await commitOperations(db, currentLogs.docs.map((log) => (batch) => batch.delete(log.ref)));
    await commitOperations(db, event.logs.map((log) => (batch) => {
      const { id, ...data } = log;
      batch.set(doc(eventRef, 'logs', id), data);
    }));
    await commitOperations(db, currentAnalytics.docs.map((item) => (batch) => batch.delete(item.ref)));
    const analyticsDocuments = buildAnalyticsDocuments(event.logs);
    await commitOperations(db, [
      ...analyticsDocuments.map((item) => (batch) => batch.set(doc(eventRef, 'analytics', item.id), {
        ...item,
        updatedAt: new Date().toISOString()
      })),
      (batch) => batch.set(doc(eventRef, 'analytics', 'meta'), {
        version: LOG_ANALYTICS_VERSION,
        sourceLogCount: event.logs.length,
        lastLogId: [...event.logs].sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || ''))
          || String(right.id || '').localeCompare(String(left.id || '')))[0]?.id || '',
        rebuiltAt: new Date().toISOString()
      })
    ]);
    await commitOperations(db, currentFamilyHistory.docs.map((item) => (batch) => batch.delete(item.ref)));
    await commitOperations(db, (event.familyHistory || []).map((item) => (batch) => {
      const { id, ...data } = item;
      batch.set(doc(eventRef, 'familyHistory', id), data);
    }));
    if (event.archived === true) await setDoc(eventRef, { archived: true }, { merge: true });
    if (event.seatPlan) await setDoc(doc(eventRef, 'seatPlans', 'current'), event.seatPlan);
    });
  }

  const archiveOperations = currentEventsSnapshot.docs
    .filter((event) => !restoredEventIds.has(event.id))
    .map((event) => (batch) => batch.update(event.ref, { archived: true, updatedAt: new Date().toISOString() }));
  await commitOperations(db, archiveOperations);
  return {
    members: backup.members.length,
    events: backup.events.length,
    students: backup.events.reduce((total, event) => total + event.students.length, 0),
    families: backup.events.reduce((total, event) => total + (event.families || []).length, 0),
    logs: backup.events.reduce((total, event) => total + event.logs.length, 0),
    familyChanges: backup.events.reduce((total, event) => total + (event.familyHistory || []).length, 0),
    venues: (backup.venues || []).length,
    seatAssignments: backup.events.reduce((total, event) => total + Object.keys(event.seatPlan?.assignments || {}).length, 0)
  };
}
