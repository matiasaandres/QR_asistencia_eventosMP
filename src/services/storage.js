/**
 * Persistencia de eventos, estudiantes, familias, sesiones de puerta, bitácora
 * y analítica. Usa transacciones Firestore cuando hay conexión y localStorage
 * como respaldo operativo cuando la aplicación funciona en modo local.
 */

import { initFirebase } from './firebase.js';
import { INITIAL_STUDENTS, INITIAL_EVENT } from '../mock/sampleStudents.js';
import {
  createMovementPlan,
  getCapacityState,
  normalizeExtraPerson,
  resetStudentAttendance
} from './checkinPolicy.js';
import {
  createEventId,
  eventAllowsAccess,
  normalizeEvent,
  prepareStudentsForEvent,
  selectStudentsForCourses
} from './eventPolicy.js';
import {
  createFamilyCodeGenerator,
  createFamilyRecord,
  deriveFamilyRecords,
  getCapacityOwnerId,
  hydrateFamilyCapacities,
  normalizeFamilyId,
  stripFamilyCapacityProjection
} from './familyPolicy.js';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  getDoc,
  getDocs,
  getCountFromServer,
  writeBatch,
  deleteField,
  documentId,
  increment,
  where,
  limit as firestoreLimit,
  startAfter
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  analyticsMutationsForLog,
  buildAnalyticsDocuments,
  LOG_ANALYTICS_VERSION,
  LOG_PAGE_SIZE,
  summarizeAnalytics
} from './logAnalytics.js';
import { rebuildAttendanceFromLogs } from './attendanceReplay.js';

export { rebuildAttendanceFromLogs } from './attendanceReplay.js';

const LOCAL_STORAGE_KEY_STUDENTS = 'mp_students_data_';
const LOCAL_STORAGE_KEY_LOGS = 'mp_logs_data_';
const LOCAL_STORAGE_KEY_FAMILIES = 'mp_families_data_';
const LOCAL_STORAGE_KEY_EVENT = 'mp_current_event';
const LOCAL_STORAGE_KEY_EVENTS = 'mp_events_catalog';
const LOCAL_STORAGE_KEY_DOOR = 'mp_current_door';
const LOCAL_STORAGE_KEY_DOORS = 'mp_event_doors_';
const LOCAL_STORAGE_KEY_FAMILY_HISTORY = 'mp_family_history_';
/** Hidrata capacidades familiares sobre la nómina individual.
 * @param {Array<object>} students Estudiantes del evento.
 * @returns {Array<object>} Estudiantes enriquecidos.
 */
function hydrateStudentRuts(students) {
  return hydrateFamilyCapacities(students);
}

// BroadcastChannel for instant multi-tab sync in local mode
let localChannel = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    localChannel = new BroadcastChannel('mp_access_sync');
  } catch (e) {}
}

/** Construye una clave local aislada por organización.
 * @param {string} key Prefijo de almacenamiento.
 * @param {string} organizationId Organización.
 * @returns {string} Clave resultante.
 */
function organizationKey(key, organizationId) {
  return `${key}${organizationId || 'sin-organizacion'}_`;
}

/** Devuelve la referencia de un evento Firestore.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {object} Referencia del documento.
 */
function eventDoc(db, organizationId, eventId) {
  return doc(db, 'organizations', organizationId, 'events', eventId);
}

/** Devuelve la colección de estudiantes de un evento.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {object} Colección de estudiantes.
 */
function eventStudents(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'students');
}

/** Devuelve la referencia de un estudiante.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} studentId Estudiante.
 * @returns {object} Referencia del estudiante.
 */
function eventStudentDoc(db, organizationId, eventId, studentId) {
  return doc(db, 'organizations', organizationId, 'events', eventId, 'students', studentId);
}

/** Devuelve la colección de familias de un evento.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {object} Colección de familias.
 */
function eventFamilies(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'families');
}

/** Devuelve la referencia de una familia.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} familyId Familia.
 * @returns {object} Referencia de familia.
 */
function eventFamilyDoc(db, organizationId, eventId, familyId) {
  return doc(db, 'organizations', organizationId, 'events', eventId, 'families', familyId);
}

/** Construye la clave local de familias de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {string} Clave local.
 */
function storedFamiliesKey(organizationId, eventId) {
  return organizationKey(LOCAL_STORAGE_KEY_FAMILIES, organizationId) + eventId;
}

/** Construye la clave local de estudiantes de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {string} Clave local.
 */
function storedStudentsKey(organizationId, eventId) {
  return organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
}

/** Devuelve la colección de bitácora de un evento.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {object} Colección de bitácora.
 */
function eventLogs(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'logs');
}

/** Devuelve la referencia de un movimiento.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} logId Movimiento.
 * @returns {object} Referencia del movimiento.
 */
function eventLogDoc(db, organizationId, eventId, logId) {
  return doc(db, 'organizations', organizationId, 'events', eventId, 'logs', logId);
}

/** Devuelve la colección de analítica materializada.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {object} Colección analítica.
 */
function eventAnalytics(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'analytics');
}

/** Devuelve la referencia de un documento analítico.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} analyticsId Identificador analítico.
 * @returns {object} Referencia analítica.
 */
function eventAnalyticsDoc(db, organizationId, eventId, analyticsId) {
  return doc(db, 'organizations', organizationId, 'events', eventId, 'analytics', analyticsId);
}

/** Aplica incrementos o decrementos analíticos dentro de una transacción.
 * @param {object} transaction Transacción Firestore.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {object} log Movimiento.
 * @param {string} logId Identificador del movimiento.
 * @param {number} direction Dirección del ajuste.
 * @returns {void}
 */
function applyLogAnalytics(transaction, db, organizationId, eventId, log, logId, direction = 1) {
  analyticsMutationsForLog(log, logId).forEach((mutation) => {
    transaction.set(eventAnalyticsDoc(db, organizationId, eventId, mutation.id), {
      kind: mutation.kind,
      key: mutation.key,
      label: mutation.label,
      people: increment(direction * mutation.people),
      entries: increment(direction * mutation.entries),
      exits: increment(direction * mutation.exits),
      reentries: increment(direction * mutation.reentries),
      movements: increment(direction * mutation.movements),
      records: increment(direction * mutation.records),
      ...(direction > 0 ? { lastLogId: logId } : {}),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
  if (direction > 0) {
    transaction.set(eventAnalyticsDoc(db, organizationId, eventId, 'meta'), {
      version: LOG_ANALYTICS_VERSION,
      sourceLogCount: increment(1),
      lastLogId: logId,
      rebuiltAt: new Date().toISOString()
    }, { merge: true });
  }
}

/** Obtiene la puerta activa guardada localmente.
 * @param {string} organizationId Organización.
 * @returns {string} Nombre de puerta.
 */
export function getCurrentDoor(organizationId) {
  return localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_DOOR, organizationId)) || 'Acceso Principal';
}

/** Guarda la puerta activa de una organización.
 * @param {string} organizationId Organización.
 * @param {string} doorName Nombre de puerta.
 * @returns {void}
 */
export function setCurrentDoor(organizationId, doorName) {
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_DOOR, organizationId), doorName);
}

/** Obtiene y normaliza el evento local actual.
 * @param {string} organizationId Organización.
 * @returns {object} Evento actual.
 */
export function getCurrentEvent(organizationId) {
  try {
    const key = organizationKey(LOCAL_STORAGE_KEY_EVENT, organizationId);
    const raw = localStorage.getItem(key);
    const currentEvent = normalizeEvent(raw ? JSON.parse(raw) : INITIAL_EVENT, INITIAL_EVENT);
    localStorage.setItem(key, JSON.stringify(currentEvent));
    return currentEvent;
  } catch (e) {
    return normalizeEvent(INITIAL_EVENT, INITIAL_EVENT);
  }
}

/** Guarda y normaliza el evento local actual.
 * @param {string} organizationId Organización.
 * @param {object} eventData Datos del evento.
 * @returns {object} Evento normalizado.
 */
export function saveCurrentEvent(organizationId, eventData) {
  const normalizedEvent = normalizeEvent(eventData, INITIAL_EVENT);
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_EVENT, organizationId), JSON.stringify(normalizedEvent));
  return normalizedEvent;
}

/** Ordena eventos activos y archivados por fecha y nombre.
 * @param {Array<object>} events Eventos a ordenar.
 * @returns {Array<object>} Eventos ordenados.
 */
function sortEvents(events) {
  return [...events].sort((left, right) => {
    if (left.archived !== right.archived) return left.archived ? 1 : -1;
    return String(right.date || '').localeCompare(String(left.date || ''))
      || String(left.name || '').localeCompare(String(right.name || ''), 'es');
  });
}

/** Persiste el catálogo local de eventos y notifica a otras pestañas.
 * @param {string} organizationId Organización.
 * @param {Array<object>} events Eventos a guardar.
 * @returns {Array<object>} Eventos normalizados.
 */
function saveLocalEvents(organizationId, events) {
  const normalized = sortEvents(events.map((event) => normalizeEvent(event, INITIAL_EVENT)));
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_EVENTS, organizationId), JSON.stringify(normalized));
  if (localChannel) localChannel.postMessage({ type: 'EVENTS_UPDATED', organizationId });
  return normalized;
}

/** Lee el catálogo local de eventos o crea el evento inicial.
 * @param {string} organizationId Organización.
 * @returns {Array<object>} Eventos locales.
 */
function getLocalEvents(organizationId) {
  try {
    const raw = localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_EVENTS, organizationId));
    if (raw) {
      const events = JSON.parse(raw);
      if (Array.isArray(events) && events.length) {
        return sortEvents(events.map((event) => normalizeEvent(event, INITIAL_EVENT)));
      }
    }
  } catch (error) {
    console.warn('No fue posible leer el catálogo local de eventos:', error);
  }

  return saveLocalEvents(organizationId, [getCurrentEvent(organizationId)]);
}

/** Suscribe el catálogo de eventos en nube o almacenamiento local.
 * @param {string} organizationId Organización.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
export function subscribeToEvents(organizationId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    return onSnapshot(
      collection(db, 'organizations', organizationId, 'events'),
      { includeMetadataChanges: true },
      (snapshot) => {
        const events = sortEvents(snapshot.docs.map((eventDoc) => normalizeEvent({
          ...eventDoc.data(),
          id: eventDoc.id
        }, INITIAL_EVENT)));
        const nextEvents = events.length ? events : [normalizeEvent(INITIAL_EVENT, INITIAL_EVENT)];
        saveLocalEvents(organizationId, nextEvents);
        onUpdate(nextEvents, snapshot.metadata.fromCache ? 'offline' : 'cloud');
      },
      (error) => {
        console.warn('Firestore events subscription error:', error);
        onUpdate(getLocalEvents(organizationId), 'error');
      }
    );
  }

  /** Publica los eventos guardados localmente.
   * @returns {void}
   */
  const load = () => onUpdate(getLocalEvents(organizationId), 'local');
  /** Responde a actualizaciones de eventos entre pestañas.
   * @param {MessageEvent} message Mensaje recibido.
   * @returns {void}
   */
  const handleMessage = (message) => {
    if (message.data?.type === 'EVENTS_UPDATED' && message.data.organizationId === organizationId) load();
  };
  /** Responde a cambios de eventos en localStorage.
   * @param {StorageEvent} storageEvent Evento de almacenamiento.
   * @returns {void}
   */
  const handleStorage = (storageEvent) => {
    if (storageEvent.key === organizationKey(LOCAL_STORAGE_KEY_EVENTS, organizationId)) load();
  };

  load();
  if (localChannel) localChannel.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);
  return () => {
    if (localChannel) localChannel.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

/** Actualiza un evento en nube y caché local.
 * @param {string} organizationId Organización.
 * @param {object} eventData Datos del evento.
 * @returns {Promise<object>} Evento actualizado.
 * @throws {Error} Si el evento no tiene identificador válido.
 */
export async function updateEvent(organizationId, eventData) {
  const current = normalizeEvent(eventData, INITIAL_EVENT);
  if (!current.id) throw new Error('El evento no tiene un identificador válido.');

  const updatedEvent = {
    ...current,
    updatedAt: new Date().toISOString()
  };
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await setDoc(eventDoc(db, organizationId, updatedEvent.id), updatedEvent, { merge: true });
  }

  const events = getLocalEvents(organizationId);
  const nextEvents = events.some((event) => event.id === updatedEvent.id)
    ? events.map((event) => event.id === updatedEvent.id ? updatedEvent : event)
    : [...events, updatedEvent];
  saveLocalEvents(organizationId, nextEvents);
  return getCurrentEvent(organizationId).id === updatedEvent.id
    ? saveCurrentEvent(organizationId, updatedEvent)
    : updatedEvent;
}

/** Crea un evento y opcionalmente copia estudiantes y familias.
 * @param {string} organizationId Organización.
 * @param {object} eventData Datos base del evento.
 * @param {{copyStudents?: boolean, sourceStudents?: Array<object>, selectedCourses?: Array<string>}} options Opciones de copia.
 * @returns {Promise<object>} Evento creado.
 */
export async function createEvent(organizationId, eventData, { copyStudents = false, sourceStudents = [], selectedCourses } = {}) {
  const now = new Date();
  const id = createEventId(eventData?.name, eventData?.date, now.getTime());
  const selectedStudents = Array.isArray(selectedCourses)
    ? selectStudentsForCourses(sourceStudents, selectedCourses)
    : sourceStudents;
  const students = copyStudents ? prepareStudentsForEvent(selectedStudents) : [];
  const families = deriveFamilyRecords(students);
  const newEvent = normalizeEvent({
    ...eventData,
    id,
    archived: false,
    studentsInitialized: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }, INITIAL_EVENT);
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    await setDoc(eventDoc(db, organizationId, id), newEvent);
    await commitInChunks(db, families.map((family) => (batch) => {
      batch.set(eventFamilyDoc(db, organizationId, id, family.id), {
        ...family,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    }));
    await commitInChunks(db, students.map((student) => (batch) => {
      batch.set(eventStudentDoc(db, organizationId, id, student.id), student);
    }));
  }

  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + id, JSON.stringify(students));
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + id, JSON.stringify([]));
  localStorage.setItem(storedFamiliesKey(organizationId, id), JSON.stringify(families));
  saveLocalEvents(organizationId, [...getLocalEvents(organizationId), newEvent]);
  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId: id });
    localChannel.postMessage({ type: 'LOGS_UPDATED', organizationId, eventId: id });
  }
  return saveCurrentEvent(organizationId, newEvent);
}

/** Archiva o desarchiva un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {boolean} archived Estado de archivo.
 * @returns {Promise<object>} Evento actualizado.
 * @throws {Error} Si falta el evento.
 */
export async function archiveEvent(organizationId, eventId, archived = true) {
  if (!eventId) throw new Error('Selecciona un evento válido.');
  const updatedAt = new Date().toISOString();
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await setDoc(eventDoc(db, organizationId, eventId), { archived, updatedAt }, { merge: true });
  }
  const events = getLocalEvents(organizationId).map((event) => (
    event.id === eventId ? { ...event, archived, updatedAt } : event
  ));
  saveLocalEvents(organizationId, events);
  return events.find((event) => event.id === eventId);
}

// Subscribe to Students list (real-time via Firestore OR LocalStorage)
/** Suscribe la nómina y las familias de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
export function subscribeToStudents(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const studentsCol = eventStudents(db, organizationId, eventId);
    const familiesCol = eventFamilies(db, organizationId, eventId);
    let rawStudents = null;
    let families = null;
    let mode = 'cloud';
    /** Publica estudiantes hidratados y familias sincronizadas.
     * @returns {void}
     */
    const emit = () => {
      if (!rawStudents || !families) return;
      const students = hydrateFamilyCapacities(rawStudents, families).filter((student) => student.deleted !== true);
      localStorage.setItem(storedStudentsKey(organizationId, eventId), JSON.stringify(students));
      localStorage.setItem(storedFamiliesKey(organizationId, eventId), JSON.stringify(families));
      onUpdate(students, mode);
    };
    const unsubscribeStudents = onSnapshot(
      studentsCol,
      { includeMetadataChanges: true },
      (snapshot) => {
        rawStudents = hydrateStudentRuts(snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        })));
        mode = snapshot.metadata.fromCache ? 'offline' : 'cloud';
        emit();
      },
      (error) => {
        console.warn("Firestore subscription error:", error);
        // Never silently switch a cloud deployment to independent local data.
        // Show the durable cache, but mark synchronization as failed.
        loadCachedStudents(organizationId, eventId, onUpdate, 'error');
      }
    );
    const unsubscribeFamilies = onSnapshot(
      familiesCol,
      { includeMetadataChanges: true },
      (snapshot) => {
        families = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
        if (snapshot.metadata.fromCache) mode = 'offline';
        emit();
      },
      (error) => {
        console.warn('Firestore families subscription error:', error);
        families = JSON.parse(localStorage.getItem(storedFamiliesKey(organizationId, eventId)) || '[]');
        mode = 'error';
        emit();
      }
    );
    return () => {
      unsubscribeStudents();
      unsubscribeFamilies();
    };
  } else {
    // Local mode
    return fallbackToLocalStudents(organizationId, eventId, onUpdate);
  }
}

/** Carga una copia cacheada de estudiantes.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @param {string} mode Modo de origen.
 * @returns {void}
 */
function loadCachedStudents(organizationId, eventId, onUpdate, mode) {
  try {
    const raw = localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId);
    const families = JSON.parse(localStorage.getItem(storedFamiliesKey(organizationId, eventId)) || '[]');
    onUpdate(raw ? hydrateFamilyCapacities(hydrateStudentRuts(JSON.parse(raw)), families) : [], mode);
  } catch (e) {
    onUpdate([], mode);
  }
}

const DATA_VERSION_KEY = 'mp_data_version_tag';
const CURRENT_DATA_VERSION = 'v3_251_students';

/** Suscribe estudiantes usando únicamente almacenamiento local.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar listeners locales.
 */
function fallbackToLocalStudents(organizationId, eventId, onUpdate) {
  /** Carga y normaliza la nómina desde el almacenamiento local.
   * @returns {void}
   */
  const loadLocal = () => {
    try {
      const versionKey = `${DATA_VERSION_KEY}_${eventId}`;
      const currentVersion = localStorage.getItem(versionKey)
        || (eventId === INITIAL_EVENT.id ? localStorage.getItem(DATA_VERSION_KEY) : null);
      const storageKey = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
      const raw = localStorage.getItem(storageKey);

      if (!raw) {
        const initialRoster = eventId === INITIAL_EVENT.id ? INITIAL_STUDENTS : [];
        localStorage.setItem(storageKey, JSON.stringify(initialRoster));
        localStorage.setItem(versionKey, CURRENT_DATA_VERSION);
        onUpdate(initialRoster, 'local');
        return;
      }

      if (eventId === INITIAL_EVENT.id && currentVersion !== CURRENT_DATA_VERSION) {
        localStorage.setItem(storageKey, JSON.stringify(INITIAL_STUDENTS));
        localStorage.setItem(versionKey, CURRENT_DATA_VERSION);
        onUpdate(INITIAL_STUDENTS, 'local');
        return;
      }
      const localFamilies = JSON.parse(localStorage.getItem(storedFamiliesKey(organizationId, eventId)) || '[]');
      const hydratedStudents = hydrateFamilyCapacities(hydrateStudentRuts(JSON.parse(raw)), localFamilies);
      localStorage.setItem(storageKey, JSON.stringify(hydratedStudents));
      onUpdate(hydratedStudents, 'local');
    } catch (e) {
      onUpdate(INITIAL_STUDENTS, 'local');
    }
  };

  loadLocal();

  /** Recarga la nómina ante un mensaje de otra pestaña.
   * @param {MessageEvent} evt Mensaje recibido.
   * @returns {void}
   */
  const handleMessage = (evt) => {
    if (evt.data?.type === 'STUDENTS_UPDATED' && evt.data?.organizationId === organizationId && evt.data?.eventId === eventId) {
      loadLocal();
    }
  };

  if (localChannel) {
    localChannel.addEventListener('message', handleMessage);
  }

  /** Recarga la nómina ante cambios directos en localStorage.
   * @param {StorageEvent} e Evento de almacenamiento.
   * @returns {void}
   */
  const handleStorage = (e) => {
    if (e.key === organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId) {
      loadLocal();
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    if (localChannel) localChannel.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

// Subscribe to Entry Logs (real-time)
/** Suscribe la bitácora reciente de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
export function subscribeToLogs(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const logsCol = eventLogs(db, organizationId, eventId);
    const q = query(
      logsCol,
      orderBy('timestamp', 'desc'),
      orderBy(documentId(), 'desc'),
      firestoreLimit(LOG_PAGE_SIZE + 1)
    );
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const hasMore = snapshot.docs.length > LOG_PAGE_SIZE;
        const logs = snapshot.docs.slice(0, LOG_PAGE_SIZE).map((d) => ({
          ...d.data(),
          id: d.id
        }));
        localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId, JSON.stringify(logs));
        onUpdate(logs, snapshot.metadata.fromCache ? 'offline' : 'cloud', hasMore);
      },
      (err) => {
        console.warn("Firestore logs error:", err);
        loadCachedLogs(organizationId, eventId, onUpdate, 'error');
      }
    );
    return unsubscribe;
  } else {
    return fallbackToLocalLogs(organizationId, eventId, onUpdate);
  }
}

/** Ordena movimientos por fecha e identificador descendentes.
 * @param {Array<object>} logs Movimientos.
 * @returns {Array<object>} Movimientos ordenados.
 */
function sortLogs(logs) {
  return [...logs].sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || ''))
    || String(right.id || '').localeCompare(String(left.id || '')));
}

/** Obtiene una página estable de movimientos.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {{afterLog?: object|null, pageSize?: number}} options Cursor y tamaño.
 * @returns {Promise<{logs: Array<object>, hasMore: boolean}>} Página de resultados.
 */
export async function fetchLogPage(organizationId, eventId, { afterLog = null, pageSize = LOG_PAGE_SIZE } = {}) {
  const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || LOG_PAGE_SIZE));
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    const constraints = [orderBy('timestamp', 'desc'), orderBy(documentId(), 'desc')];
    if (afterLog?.timestamp && afterLog?.id) constraints.push(startAfter(afterLog.timestamp, afterLog.id));
    constraints.push(firestoreLimit(safePageSize + 1));
    const snapshot = await getDocs(query(eventLogs(db, organizationId, eventId), ...constraints));
    return {
      logs: snapshot.docs.slice(0, safePageSize).map((item) => ({ ...item.data(), id: item.id })),
      hasMore: snapshot.docs.length > safePageSize
    };
  }

  const cached = sortLogs(JSON.parse(localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId) || '[]'));
  const start = afterLog?.id ? Math.max(0, cached.findIndex((item) => item.id === afterLog.id) + 1) : 0;
  const logs = cached.slice(start, start + safePageSize);
  return { logs, hasMore: start + safePageSize < cached.length };
}

/** Recupera toda la bitácora recorriendo páginas.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {Promise<Array<object>>} Movimientos completos.
 */
export async function fetchAllLogs(organizationId, eventId) {
  const allLogs = [];
  let afterLog = null;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchLogPage(organizationId, eventId, { afterLog, pageSize: 200 });
    allLogs.push(...page.logs);
    hasMore = page.hasMore;
    afterLog = page.logs.at(-1) || null;
    if (hasMore && !afterLog) break;
  }
  return allLogs;
}

/** Suscribe los agregados analíticos de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
export function subscribeToEventAnalytics(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) {
    /** Publica la analítica calculada desde la bitácora local.
     * @returns {void}
     */
    const load = () => {
      const logs = JSON.parse(localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId) || '[]');
      onUpdate({ ...summarizeAnalytics(buildAnalyticsDocuments(logs)), ready: true }, 'local');
    };
    /** Recarga la analítica ante cambios de bitácora entre pestañas.
     * @param {MessageEvent} message Mensaje recibido.
     * @returns {void}
     */
    const handleMessage = (message) => {
      if (message.data?.type === 'LOGS_UPDATED' && message.data.organizationId === organizationId && message.data.eventId === eventId) load();
    };
    load();
    if (localChannel) localChannel.addEventListener('message', handleMessage);
    return () => localChannel?.removeEventListener('message', handleMessage);
  }
  return onSnapshot(eventAnalytics(db, organizationId, eventId), (snapshot) => {
    const documents = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
    onUpdate(summarizeAnalytics(documents), snapshot.metadata.fromCache ? 'offline' : 'cloud');
  }, () => onUpdate({ totalRecords: 0, doorsList: [], activityByHour: [] }, 'error'));
}

/** Reconstruye los agregados analíticos si están ausentes o desactualizados.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {Promise<void>} Promesa de reconstrucción.
 */
export async function ensureEventAnalytics(organizationId, eventId) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) return;
  const metaRef = eventAnalyticsDoc(db, organizationId, eventId, 'meta');

  // Una consulta COUNT cuesta y transfiere mucho menos que descargar toda la
  // bitácora. Solo reconstruimos cuando falta el agregado, cambió su versión o
  // un operador agregó/eliminó movimientos sin actualizar la vista materializada.
  const [metaSnapshot, logCountSnapshot] = await Promise.all([
    getDoc(metaRef),
    getCountFromServer(eventLogs(db, organizationId, eventId))
  ]);
  const currentMeta = metaSnapshot.exists() ? metaSnapshot.data() : null;
  if (currentMeta?.version === LOG_ANALYTICS_VERSION
    && currentMeta.sourceLogCount === logCountSnapshot.data().count) return;

  const [logsSnapshot, analyticsSnapshot] = await Promise.all([
    getDocs(eventLogs(db, organizationId, eventId)),
    getDocs(eventAnalytics(db, organizationId, eventId))
  ]);
  const logs = logsSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
  const documents = buildAnalyticsDocuments(logs);
  const targetIds = new Set(['meta', ...documents.map((item) => item.id)]);
  const operations = analyticsSnapshot.docs
    .filter((item) => !targetIds.has(item.id))
    .map((item) => (batch) => batch.delete(item.ref));
  documents.forEach((document) => operations.push((batch) => batch.set(
    eventAnalyticsDoc(db, organizationId, eventId, document.id),
    { ...document, updatedAt: new Date().toISOString() }
  )));
  operations.push((batch) => batch.set(metaRef, {
    version: LOG_ANALYTICS_VERSION,
    sourceLogCount: logs.length,
    lastLogId: [...logs].sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || ''))
      || String(right.id || '').localeCompare(String(left.id || '')))[0]?.id || '',
    rebuiltAt: new Date().toISOString()
  }));
  await commitInChunks(db, operations);
}

/** Convierte un estado reconstruido en campos Firestore.
 * @param {object} rebuilt Estado derivado de la bitácora.
 * @returns {object} Campos persistibles.
 */
function attendanceUpdateFromReplay(rebuilt) {
  return {
    enteredCount: rebuilt.enteredCount,
    insideCount: rebuilt.insideCount,
    status: rebuilt.status,
    extraGuest: rebuilt.extraGuest || deleteField(),
    lastEntryAt: rebuilt.lastEntryAt || deleteField(),
    lastMovementAt: rebuilt.lastMovementAt || deleteField(),
    lastLogId: rebuilt.lastLogId || deleteField()
  };
}

/** Aplica un estado reconstruido a un registro local.
 * @param {object} record Registro local.
 * @param {object} rebuilt Estado derivado.
 * @returns {object} Registro actualizado.
 */
function applyReplayToLocal(record, rebuilt) {
  const updated = {
    ...record,
    enteredCount: rebuilt.enteredCount,
    insideCount: rebuilt.insideCount,
    status: rebuilt.status
  };
  ['extraGuest', 'lastEntryAt', 'lastMovementAt', 'lastLogId'].forEach((field) => {
    if (rebuilt[field]) updated[field] = rebuilt[field];
    else delete updated[field];
  });
  return updated;
}

// Remove one audit entry and adjust its student's counter atomically.
/** Elimina un movimiento y reconstruye el contador afectado.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {object} log Movimiento a eliminar.
 * @returns {Promise<void>} Promesa de corrección.
 * @throws {Error} Si el movimiento no existe o la asistencia cambió.
 */
export async function deleteLogEntry(organizationId, eventId, log) {
  const logId = log?.id;
  if (!logId) throw new Error('El registro no tiene un identificador válido.');

  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    const logRef = eventLogDoc(db, organizationId, eventId, logId);
    const initialLogSnapshot = await getDoc(logRef);
    if (!initialLogSnapshot.exists()) throw new Error('El registro ya no existe en la base de datos.');
    const initialLog = { ...initialLogSnapshot.data(), id: initialLogSnapshot.id };
    const ownerField = initialLog.familyId ? 'familyId' : 'studentId';
    const ownerId = initialLog.familyId || initialLog.capacityOwnerId || initialLog.studentId;
    const relatedSnapshot = await getDocs(query(eventLogs(db, organizationId, eventId), where(ownerField, '==', ownerId)));
    const relatedLogs = relatedSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }));

    await runTransaction(db, async (transaction) => {
      const logSnapshot = await transaction.get(logRef);
      if (!logSnapshot.exists()) {
        throw new Error('El registro ya no existe en la base de datos.');
      }

      const storedLog = logSnapshot.data();
      const storedStudentRef = storedLog.familyId
        ? eventFamilyDoc(db, organizationId, eventId, storedLog.familyId)
        : eventStudentDoc(db, organizationId, eventId, storedLog.capacityOwnerId || storedLog.studentId);
      const studentSnapshot = await transaction.get(storedStudentRef);

      if (studentSnapshot.exists()) {
        const student = studentSnapshot.data();
        const maxCapacity = getCapacityState(student).maxCapacity;
        const expectedCurrent = rebuildAttendanceFromLogs(relatedLogs, maxCapacity);
        if ((Number(student.enteredCount) || 0) !== expectedCurrent.enteredCount
          || (Number(student.insideCount ?? student.enteredCount) || 0) !== expectedCurrent.insideCount) {
          throw new Error('La asistencia cambió durante la corrección. Actualiza la vista e inténtalo nuevamente.');
        }
        const rebuilt = rebuildAttendanceFromLogs(relatedLogs.filter((item) => item.id !== logId), maxCapacity);
        transaction.update(storedStudentRef, attendanceUpdateFromReplay(rebuilt));
      }

      transaction.delete(logRef);
    });
    await ensureEventAnalytics(organizationId, eventId);
  }

  const storageKey = organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId;
  try {
    const stored = localStorage.getItem(storageKey);
    const localLogs = stored ? JSON.parse(stored) : [];
    const remainingLogs = localLogs.filter((item) => item.id !== logId);
    localStorage.setItem(
      storageKey,
      JSON.stringify(remainingLogs)
    );

    const studentsKey = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
    const storedStudents = localStorage.getItem(studentsKey);
    if (storedStudents && log.studentId && !log.familyId) {
      const localStudents = JSON.parse(storedStudents).map((student) => {
        if (student.id !== (log.capacityOwnerId || log.studentId)) return student;
        const related = remainingLogs.filter((item) => !item.familyId && (item.capacityOwnerId || item.studentId) === student.id);
        return applyReplayToLocal(student, rebuildAttendanceFromLogs(related, getCapacityState(student).maxCapacity));
      });
      localStorage.setItem(studentsKey, JSON.stringify(localStudents));
    }
    if (storedStudents && log.familyId) {
      const familiesKey = storedFamiliesKey(organizationId, eventId);
      const families = JSON.parse(localStorage.getItem(familiesKey) || '[]');
      localStorage.setItem(familiesKey, JSON.stringify(families.map((family) => {
        if (normalizeFamilyId(family.id) !== normalizeFamilyId(log.familyId)) return family;
        const related = remainingLogs.filter((item) => normalizeFamilyId(item.familyId) === normalizeFamilyId(family.id));
        return applyReplayToLocal(family, rebuildAttendanceFromLogs(related, family.maxCapacity));
      })));
    }
  } catch (error) {
    console.warn('No fue posible actualizar el historial local después de eliminar:', error);
  }

  if (localChannel) {
    localChannel.postMessage({ type: 'LOGS_UPDATED', organizationId, eventId });
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  }
}

/** Carga la bitácora cacheada.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @param {string} mode Modo de origen.
 * @returns {void}
 */
function loadCachedLogs(organizationId, eventId, onUpdate, mode) {
  try {
    const raw = localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId);
    onUpdate(raw ? JSON.parse(raw) : [], mode);
  } catch (e) {
    onUpdate([], mode);
  }
}

/** Suscribe movimientos desde almacenamiento local.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar listeners.
 */
function fallbackToLocalLogs(organizationId, eventId, onUpdate) {
  /** Carga la primera página de movimientos desde localStorage.
   * @returns {void}
   */
  const loadLogs = () => {
    try {
      const raw = localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId);
      const logs = raw ? sortLogs(JSON.parse(raw)) : [];
      onUpdate(logs.slice(0, LOG_PAGE_SIZE), 'local', logs.length > LOG_PAGE_SIZE);
    } catch (e) {
      onUpdate([], 'local', false);
    }
  };

  loadLogs();

  /** Recarga los movimientos ante una actualización entre pestañas.
   * @param {MessageEvent} evt Mensaje recibido.
   * @returns {void}
   */
  const handleMessage = (evt) => {
    if (evt.data?.type === 'LOGS_UPDATED' && evt.data?.organizationId === organizationId && evt.data?.eventId === eventId) {
      loadLogs();
    }
  };

  if (localChannel) localChannel.addEventListener('message', handleMessage);

  return () => {
    if (localChannel) localChannel.removeEventListener('message', handleMessage);
  };
}

// Check-in action (Register Entry)
/** Registra una entrada, salida o reingreso con actualización atómica.
 * @param {{organizationId: string, eventId: string, studentId: string, count: number, doorName?: string, extraPerson?: object|null, movementType?: string, updateAnalytics?: boolean}} input Datos del movimiento.
 * @returns {Promise<object>} Resultado y estado actualizado.
 * @throws {Error} Si el evento, estudiante o cupo no permiten el movimiento.
 */
export async function registerCheckIn({
  organizationId,
  eventId,
  studentId,
  count,
  doorName,
  extraPerson = null,
  movementType = 'ENTRY',
  updateAnalytics = false
}) {
  const { app, db, isConfigured } = initFirebase();
  const now = new Date();
  const timestampIso = now.toISOString();
  const formattedTime = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = now.toLocaleDateString('es-CL');
  const normalizedExtraPerson = normalizeExtraPerson(extraPerson);
  const operator = app ? getAuth(app).currentUser : null;

  if (!eventAllowsAccess(getLocalEvents(organizationId).find((item) => item.id === eventId) || {}, now)) {
    throw new Error('El evento no está abierto para registrar movimientos.');
  }

  /** Calcula el plan de movimiento usando el estado actual.
   * @param {object} student Estudiante o familia propietaria.
   * @returns {object} Plan de movimiento.
   */
  const buildPlan = (student) => createMovementPlan({
    student,
    count,
    movementType,
    doorName,
    timestampIso,
    extraPerson: normalizedExtraPerson
  });

  /** Construye el registro de bitácora asociado al plan.
   * @param {object} student Estudiante afectado.
   * @param {object} plan Plan de movimiento.
   * @returns {object} Datos del movimiento.
   */
  const buildLogData = (student, plan) => ({
    studentId,
    ...(student.familyId ? {
      familyId: student.familyId
    } : {}),
    studentName: student.name,
    course: student.course,
    count,
    movementType: plan.movementType,
    newAdmissions: plan.newAdmissions,
    reentries: plan.reentries,
    accumulated: plan.newEntered,
    insideAfter: plan.newInside,
    maxCapacity: getCapacityState(student).maxCapacity,
    doorName: doorName || 'Acceso Principal',
    timestamp: timestampIso,
    formattedTime,
    formattedDate,
    operatorUid: operator?.uid || 'local',
    operatorEmail: operator?.email || 'modo-local',
    isExtra: plan.isExtra,
    ...(plan.extraGuest ? {
      guestName: plan.extraGuest.name,
      relationship: plan.extraGuest.relationship
    } : {})
  });

  /** Proyecta el plan sobre el estudiante actualizado.
   * @param {object} student Estudiante original.
   * @param {object} plan Plan de movimiento.
   * @returns {object} Estudiante actualizado.
   */
  const buildUpdatedStudent = (student, plan) => ({
    ...student,
    enteredCount: plan.newEntered,
    insideCount: plan.newInside,
    status: plan.newStatus,
    lastMovementAt: timestampIso,
    ...(plan.movementType !== 'EXIT' ? { lastEntryAt: timestampIso } : {}),
    ...(plan.extraGuest ? { extraGuest: plan.extraGuest } : {})
  });

  if (isConfigured && db) {
    // Cloud Firestore Transaction to guarantee concurrency safety across phones
    const studentRef = eventStudentDoc(db, organizationId, eventId, studentId);
    const logRef = doc(eventLogs(db, organizationId, eventId));

    return await runTransaction(db, async (transaction) => {
      const eventSnapshot = await transaction.get(eventDoc(db, organizationId, eventId));
      if (!eventSnapshot.exists() || !eventAllowsAccess(eventSnapshot.data(), now)) {
        throw new Error('El evento no está abierto para registrar movimientos.');
      }
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists()) {
        throw new Error("Estudiante no encontrado en la base de datos.");
      }

      const currentData = studentSnap.data();
      const familyId = normalizeFamilyId(currentData.familyId);
      const legacyOwnerId = getCapacityOwnerId({ ...currentData, id: studentId });
      const capacityRef = familyId
        ? eventFamilyDoc(db, organizationId, eventId, familyId)
        : eventStudentDoc(db, organizationId, eventId, studentId);
      let capacitySnapshot = familyId ? await transaction.get(capacityRef) : studentSnap;
      let effectiveStudent;
      if (familyId && capacitySnapshot.exists()) {
        const family = capacitySnapshot.data();
        effectiveStudent = {
          ...currentData,
          familyId,
          familyMaxCapacity: family.maxCapacity,
          familyEnteredCount: family.enteredCount,
          familyInsideCount: family.insideCount,
          familyExtraGuest: family.extraGuest
        };
      } else if (familyId) {
        const legacyOwnerRef = eventStudentDoc(db, organizationId, eventId, legacyOwnerId);
        capacitySnapshot = legacyOwnerId === studentId ? studentSnap : await transaction.get(legacyOwnerRef);
        if (!capacitySnapshot.exists()) throw new Error('No se encontró el registro de cupos de la familia.');
        const legacy = capacitySnapshot.data();
        effectiveStudent = { ...currentData, familyId, familyOwnerId: legacyOwnerId, familyMaxCapacity: legacy.maxCapacity, familyEnteredCount: legacy.enteredCount, familyInsideCount: legacy.insideCount, familyExtraGuest: legacy.extraGuest };
      } else {
        effectiveStudent = currentData;
      }
      const plan = buildPlan(effectiveStudent);
      const updatedStudent = buildUpdatedStudent(effectiveStudent, plan);

      transaction.update(familyId && capacitySnapshot.ref.path.includes('/families/') ? capacityRef : capacitySnapshot.ref, {
        enteredCount: plan.newEntered,
        insideCount: plan.newInside,
        status: plan.newStatus,
        lastMovementAt: timestampIso,
        ...(plan.movementType !== 'EXIT' ? { lastEntryAt: timestampIso } : {}),
        ...(plan.extraGuest ? { extraGuest: plan.extraGuest } : {}),
        lastLogId: logRef.id
      });

      // Student counter and audit log commit together. A transaction retry uses
      // the same log ID, so concurrent scans cannot create duplicate entries.
      const logData = buildLogData(effectiveStudent, plan);
      transaction.set(logRef, logData);
      if (updateAnalytics) applyLogAnalytics(transaction, db, organizationId, eventId, logData, logRef.id);
      transaction.set(eventDoorDoc(db, organizationId, eventId, getDeviceId()), {
        deviceId: getDeviceId(),
        deviceLabel: typeof navigator === 'undefined' ? 'Dispositivo local' : `${navigator.platform || 'Dispositivo'} · ${navigator.userAgent.includes('Mobile') ? 'Móvil' : 'Navegador'}`,
        doorName: doorName || 'Acceso Principal',
        operatorUid: operator?.uid || 'local',
        operatorEmail: operator?.email || 'modo-local',
        lastSeenAt: timestampIso,
        lastMovementAt: timestampIso,
        lastMovementType: plan.movementType
      }, { merge: true });

      return {
        student: updatedStudent,
        newEntered: plan.newEntered,
        newInside: plan.newInside,
        movementType: plan.movementType,
        remaining: plan.remaining,
        count,
        isExtra: plan.isExtra,
        extraGuest: plan.extraGuest
      };
    });
  } else {
    // LocalStorage mode
    const keyStudents = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
    const keyLogs = organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId;

    let students = [];
    try {
      const raw = localStorage.getItem(keyStudents);
      students = raw ? JSON.parse(raw) : [...INITIAL_STUDENTS];
    } catch (e) {
      students = [...INITIAL_STUDENTS];
    }

    const studentIndex = students.findIndex((s) => s.id === studentId);
    if (studentIndex === -1) {
      throw new Error("Estudiante no encontrado.");
    }

    const hydratedStudents = hydrateFamilyCapacities(students);
    const student = hydratedStudents[studentIndex];
    const plan = buildPlan(student);
    const familyId = normalizeFamilyId(student.familyId);
    if (familyId) {
      const familiesKey = storedFamiliesKey(organizationId, eventId);
      const families = JSON.parse(localStorage.getItem(familiesKey) || '[]');
      const familyIndex = families.findIndex((family) => normalizeFamilyId(family.id) === familyId);
      if (familyIndex >= 0) {
        families[familyIndex] = { ...families[familyIndex], enteredCount: plan.newEntered, insideCount: plan.newInside, status: plan.newStatus, lastMovementAt: timestampIso, ...(plan.movementType !== 'EXIT' ? { lastEntryAt: timestampIso } : {}), ...(plan.extraGuest ? { extraGuest: plan.extraGuest } : {}) };
        localStorage.setItem(familiesKey, JSON.stringify(families));
      } else {
        const ownerId = getCapacityOwnerId(student);
        const ownerIndex = students.findIndex((item) => item.id === ownerId);
        if (ownerIndex === -1) throw new Error('No se encontró el registro de cupos de la familia.');
        students[ownerIndex] = buildUpdatedStudent(students[ownerIndex], plan);
      }
    } else {
      students[studentIndex] = buildUpdatedStudent(students[studentIndex], plan);
    }

    localStorage.setItem(keyStudents, JSON.stringify(students));

    // Save log
    let logs = [];
    try {
      const rawLogs = localStorage.getItem(keyLogs);
      logs = rawLogs ? JSON.parse(rawLogs) : [];
    } catch (e) {
      logs = [];
    }

    const logEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      ...buildLogData(student, plan)
    };

    logs.unshift(logEntry);
    localStorage.setItem(keyLogs, JSON.stringify(logs));

    if (localChannel) {
      localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
      localChannel.postMessage({ type: 'LOGS_UPDATED', organizationId, eventId });
    }

    return {
      student: students[studentIndex],
      newEntered: plan.newEntered,
      newInside: plan.newInside,
      movementType: plan.movementType,
      remaining: plan.remaining,
      count,
      isExtra: plan.isExtra,
      extraGuest: plan.extraGuest
    };
  }
}

// Bulk update / Import students
// Patch capacity only so a simultaneous check-in is never overwritten.
/** Actualiza únicamente las capacidades autorizadas.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Array<{id: string, maxCapacity: number}>} updates Capacidades nuevas.
 * @returns {Promise<void>} Promesa de actualización.
 * @throws {Error} Si una capacidad está fuera de rango.
 */
export async function saveStudentCapacities(organizationId, eventId, updates) {
  if (updates.some(({ id, maxCapacity }) => !id || !Number.isInteger(maxCapacity) || maxCapacity < 1 || maxCapacity > 50)) {
    throw new Error('El cupo debe ser un entero entre 1 y 50.');
  }
  const { db, isConfigured } = initFirebase();
  const key = storedStudentsKey(organizationId, eventId);
  const current = JSON.parse(localStorage.getItem(key) || '[]');
  const hydrated = hydrateFamilyCapacities(current);
  const byId = new Map(hydrated.map((student) => [student.id, student]));
  const ownerCapacities = new Map();
  updates.forEach(({ id, maxCapacity }) => {
    const student = byId.get(id);
    const key = student?.familyId ? `family:${normalizeFamilyId(student.familyId)}` : `student:${id}`;
    ownerCapacities.set(key, maxCapacity);
  });
  if (isConfigured && db) {
    const familySnapshot = await getDocs(eventFamilies(db, organizationId, eventId));
    const existingFamilyIds = new Set(familySnapshot.docs.map((family) => normalizeFamilyId(family.id)));
    await commitInChunks(db, [...ownerCapacities].map(([key, maxCapacity]) => (batch) => {
      const [kind, id] = key.split(':');
      if (kind === 'family' && !existingFamilyIds.has(id)) {
        const members = current.filter((student) => normalizeFamilyId(student.familyId) === id);
        batch.set(eventFamilyDoc(db, organizationId, eventId, id), {
          ...createFamilyRecord(id, members, { ...members[0], maxCapacity }),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } else {
        batch.update(kind === 'family'
          ? eventFamilyDoc(db, organizationId, eventId, id)
          : eventStudentDoc(db, organizationId, eventId, id), kind === 'family'
          ? { maxCapacity, updatedAt: new Date().toISOString() }
          : { maxCapacity });
      }
    }));
  }
  localStorage.setItem(key, JSON.stringify(current.map((student) =>
    ownerCapacities.has(`student:${student.id}`) && !getCapacityState(student).isRetired
      ? { ...student, maxCapacity: ownerCapacities.get(`student:${student.id}`) } : student)));
  const familiesKey = storedFamiliesKey(organizationId, eventId);
  const families = JSON.parse(localStorage.getItem(familiesKey) || '[]');
  localStorage.setItem(familiesKey, JSON.stringify(families.map((family) => ownerCapacities.has(`family:${family.id}`)
    ? { ...family, maxCapacity: ownerCapacities.get(`family:${family.id}`) } : family)));
  if (localChannel) localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
}

/** Devuelve la colección de sesiones de puerta.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {object} Colección de sesiones.
 */
function eventDoors(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'doorSessions');
}

/** Devuelve una sesión de puerta específica.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} sessionId Sesión.
 * @returns {object} Referencia de sesión.
 */
function eventDoorDoc(db, organizationId, eventId, sessionId) {
  return doc(db, 'organizations', organizationId, 'events', eventId, 'doorSessions', sessionId);
}

/** Devuelve el historial de cambios familiares.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {object} Colección de historial.
 */
function eventFamilyHistory(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'familyHistory');
}

/** Suscribe el historial de cambios familiares.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
export function subscribeToFamilyHistory(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();
  const key = organizationKey(LOCAL_STORAGE_KEY_FAMILY_HISTORY, organizationId) + eventId;
  if (isConfigured && db) {
    return onSnapshot(query(eventFamilyHistory(db, organizationId, eventId), orderBy('timestamp', 'desc')), (snapshot) => {
      const items = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
      localStorage.setItem(key, JSON.stringify(items));
      onUpdate(items);
    }, () => onUpdate(JSON.parse(localStorage.getItem(key) || '[]')));
  }
  onUpdate(JSON.parse(localStorage.getItem(key) || '[]'));
  return () => {};
}

/** Añade un cambio familiar al historial local.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {object} entry Cambio registrado.
 * @returns {void}
 */
function appendLocalFamilyHistory(organizationId, eventId, entry) {
  const key = organizationKey(LOCAL_STORAGE_KEY_FAMILY_HISTORY, organizationId) + eventId;
  const current = JSON.parse(localStorage.getItem(key) || '[]');
  localStorage.setItem(key, JSON.stringify([{ ...entry, id: `local-${Date.now()}` }, ...current]));
}

/** Obtiene o genera el identificador persistente del dispositivo.
 * @returns {string} Identificador del dispositivo.
 */
function getDeviceId() {
  const key = 'mp_device_id';
  let value = localStorage.getItem(key);
  if (!value) {
    value = `DEV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    localStorage.setItem(key, value);
  }
  return value;
}

/** Suscribe las sesiones de puerta activas.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
export function subscribeToDoorSessions(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();
  const localKey = organizationKey(LOCAL_STORAGE_KEY_DOORS, organizationId) + eventId;
  if (isConfigured && db) {
    return onSnapshot(eventDoors(db, organizationId, eventId), (snapshot) => {
      const sessions = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
      localStorage.setItem(localKey, JSON.stringify(sessions));
      onUpdate(sessions);
    }, () => onUpdate(JSON.parse(localStorage.getItem(localKey) || '[]')));
  }
  onUpdate(JSON.parse(localStorage.getItem(localKey) || '[]'));
  return () => {};
}

/** Registra la presencia de una puerta y su dispositivo operador.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} doorName Nombre de puerta.
 * @returns {Promise<object>} Sesión registrada.
 */
export async function registerDoorPresence(organizationId, eventId, doorName) {
  const { app, db, isConfigured } = initFirebase();
  const operator = app ? getAuth(app).currentUser : null;
  const now = new Date().toISOString();
  const session = {
    deviceId: getDeviceId(),
    deviceLabel: typeof navigator === 'undefined' ? 'Dispositivo local' : `${navigator.platform || 'Dispositivo'} · ${navigator.userAgent.includes('Mobile') ? 'Móvil' : 'Navegador'}`,
    doorName: doorName || 'Acceso Principal',
    operatorUid: operator?.uid || 'local',
    operatorEmail: operator?.email || 'modo-local',
    connectedAt: now,
    lastSeenAt: now
  };
  const id = session.deviceId;
  if (isConfigured && db) await setDoc(eventDoorDoc(db, organizationId, eventId, id), session, { merge: true });
  const key = organizationKey(LOCAL_STORAGE_KEY_DOORS, organizationId) + eventId;
  const current = JSON.parse(localStorage.getItem(key) || '[]').filter((item) => item.id !== id);
  localStorage.setItem(key, JSON.stringify([{ ...session, id }, ...current]));
  return session;
}

// One-time, idempotent migration. Existing family counters remain readable until
// an administrator opens the event and creates their independent family records.
/** Migra familias heredadas a documentos independientes.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {Promise<number>} Familias creadas.
 */
export async function migrateLegacyFamilies(organizationId, eventId) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) return 0;
  const [studentsSnapshot, familiesSnapshot] = await Promise.all([
    getDocs(eventStudents(db, organizationId, eventId)),
    getDocs(eventFamilies(db, organizationId, eventId))
  ]);
  const existing = new Set(familiesSnapshot.docs.map((item) => normalizeFamilyId(item.id)));
  const students = studentsSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
  const missing = deriveFamilyRecords(students).filter((family) => !existing.has(family.id));
  await commitInChunks(db, missing.map((family) => (batch) => batch.set(
    eventFamilyDoc(db, organizationId, eventId, family.id),
    { ...family, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  )));
  return missing.length;
}

/** Cambia un estudiante de familia o crea una familia nueva.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} studentId Estudiante.
 * @param {string} nextFamilyId Familia destino o marcador de nueva familia.
 * @param {Array<object>} visibleStudents Estudiantes visibles.
 * @returns {Promise<void>} Promesa de actualización.
 * @throws {Error} Si existen movimientos que impiden el cambio.
 */
export async function saveStudentFamily(organizationId, eventId, studentId, nextFamilyId, visibleStudents) {
  const createNewFamily = nextFamilyId === '__NEW_FAMILY__';
  const familyId = createNewFamily
    ? createFamilyCodeGenerator(visibleStudents)()
    : normalizeFamilyId(nextFamilyId);
  const target = visibleStudents.find((student) => student.id === studentId);
  if (!target) throw new Error('No se encontró el estudiante.');
  const previousFamilyId = normalizeFamilyId(target.familyId);
  if (previousFamilyId === familyId) return;

  const affected = visibleStudents.filter((student) => student.id === studentId
    || (previousFamilyId && normalizeFamilyId(student.familyId) === previousFamilyId)
    || (familyId && normalizeFamilyId(student.familyId) === familyId));
  if (affected.some((student) => getCapacityState(student).enteredCount > 0)) {
    throw new Error('La familia solo puede cambiarse antes de registrar ingresos en sus credenciales.');
  }

  const nextStudents = visibleStudents.map((student) => student.id === studentId
    ? { ...student, familyId }
    : student);
  const groupIds = new Set([previousFamilyId, familyId].filter(Boolean));
  const updates = new Map();
  const familyRecords = new Map();
  const emptyFamilyIds = new Set();

  groupIds.forEach((groupId) => {
    const members = nextStudents
      .filter((student) => normalizeFamilyId(student.familyId) === groupId)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!members.length) {
      emptyFamilyIds.add(groupId);
      return;
    }
    const capacity = getCapacityState(members[0]).maxCapacity;
    members.forEach((member) => updates.set(member.id, {
      familyId: groupId,
      maxCapacity: capacity,
      enteredCount: 0,
      insideCount: 0,
      status: 'PENDIENTE'
    }));
    familyRecords.set(groupId, createFamilyRecord(groupId, members, members[0]));
  });
  if (!familyId) updates.set(studentId, {
    familyId: deleteField(), familyOwnerId: deleteField(), enteredCount: 0, insideCount: 0, status: 'PENDIENTE'
  });

  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await runTransaction(db, async (transaction) => {
      const refs = [...updates.keys()].map((id) => eventStudentDoc(db, organizationId, eventId, id));
      const familyRefs = [...new Set([...familyRecords.keys(), ...emptyFamilyIds])]
        .map((id) => eventFamilyDoc(db, organizationId, eventId, id));
      const snapshots = [];
      for (const ref of refs) snapshots.push(await transaction.get(ref));
      const familySnapshots = [];
      for (const ref of familyRefs) familySnapshots.push(await transaction.get(ref));
      if (snapshots.some((snapshot) => !snapshot.exists())) throw new Error('La nómina cambió mientras se guardaba la familia.');
      if (createNewFamily && familySnapshots.some((snapshot) => snapshot.id === familyId && snapshot.exists())) {
        throw new Error('El código familiar automático ya existe. Intenta guardar nuevamente.');
      }
      if (familySnapshots.some((snapshot) => snapshot.exists() && Number(snapshot.data().enteredCount) > 0)) {
        throw new Error('La familia solo puede cambiarse antes de registrar ingresos.');
      }
      snapshots.forEach((snapshot, index) => transaction.update(refs[index], {
        ...updates.get(snapshot.id),
        familyOwnerId: deleteField()
      }));
      familyRefs.forEach((ref, index) => {
        if (emptyFamilyIds.has(ref.id)) {
          if (familySnapshots[index].exists()) transaction.delete(ref);
          return;
        }
        transaction.set(ref, {
          ...familyRecords.get(ref.id),
          createdAt: familySnapshots[index].data()?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
    });
  }

  const key = storedStudentsKey(organizationId, eventId);
  const current = JSON.parse(localStorage.getItem(key) || '[]');
  localStorage.setItem(key, JSON.stringify(current.map((student) => {
    const update = updates.get(student.id);
    if (!update) return student;
    const stored = { ...student, ...update };
    delete stored.familyOwnerId;
    if (!familyId && student.id === studentId) {
      delete stored.familyId;
    }
    return stored;
  })));
  const familiesKey = storedFamiliesKey(organizationId, eventId);
  const currentFamilies = JSON.parse(localStorage.getItem(familiesKey) || '[]');
  const nextFamilies = new Map(currentFamilies.map((family) => [normalizeFamilyId(family.id), family]));
  emptyFamilyIds.forEach((id) => nextFamilies.delete(id));
  familyRecords.forEach((family, id) => nextFamilies.set(id, family));
  localStorage.setItem(familiesKey, JSON.stringify([...nextFamilies.values()]));
  if (localChannel) localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
}

/** Une varias familias sin movimientos registrados.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Array<string>} familyIds Familias seleccionadas.
 * @param {Array<object>} visibleStudents Estudiantes visibles.
 * @returns {Promise<string>} Identificador de la familia resultante.
 * @throws {Error} Si la unión no es válida.
 */
export async function mergeFamilies(organizationId, eventId, familyIds, visibleStudents = []) {
  const selectedIds = [...new Set(familyIds)].filter(Boolean);
  if (selectedIds.length < 2) throw new Error('Selecciona al menos dos familias para unir.');
  const groups = selectedIds.map((id) => ({
    id,
    members: visibleStudents.filter((student) => (student.familyId || `IND-${student.id}`) === id)
  }));
  const members = groups.flatMap((group) => group.members);
  if (members.length < 2) throw new Error('No se encontraron integrantes suficientes.');
  if (groups.some((group) => group.members.some((student) => getCapacityState(student).enteredCount > 0))) {
    throw new Error('Solo se pueden unir familias sin movimientos registrados.');
  }
  const newFamilyId = `FAM-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const maxCapacity = Math.max(...members.map((student) => getCapacityState(student).maxCapacity), 4);
  const now = new Date().toISOString();
  const family = { ...createFamilyRecord(newFamilyId, members, { maxCapacity }), insideCount: 0, createdAt: now, updatedAt: now };
  const { app, db, isConfigured } = initFirebase();
  const operator = app ? getAuth(app).currentUser : null;
  const historyEntry = {
    action: 'MERGE', sourceFamilyIds: selectedIds, targetFamilyId: newFamilyId,
    memberIds: members.map((member) => member.id), operatorUid: operator?.uid || 'local',
    operatorEmail: operator?.email || 'modo-local', timestamp: now
  };

  if (isConfigured && db) {
    await runTransaction(db, async (transaction) => {
      const targetRef = eventFamilyDoc(db, organizationId, eventId, newFamilyId);
      const targetSnap = await transaction.get(targetRef);
      if (targetSnap.exists()) throw new Error('El código generado ya existe; vuelve a intentarlo.');
      const sourceRefs = selectedIds.filter((id) => !id.startsWith('IND-')).map((id) => eventFamilyDoc(db, organizationId, eventId, id));
      const sourceSnaps = await Promise.all(sourceRefs.map((ref) => transaction.get(ref)));
      if (sourceSnaps.some((snap) => snap.exists() && ((Number(snap.data().enteredCount) || 0) > 0 || (Number(snap.data().insideCount) || 0) > 0))) {
        throw new Error('Una familia recibió movimientos mientras se realizaba la unión.');
      }
      transaction.set(targetRef, family);
      members.forEach((member) => transaction.update(eventStudentDoc(db, organizationId, eventId, member.id), { familyId: newFamilyId }));
      sourceRefs.forEach((ref) => transaction.delete(ref));
      transaction.set(doc(eventFamilyHistory(db, organizationId, eventId)), historyEntry);
    });
  }
  const updated = visibleStudents.map((student) => members.some((member) => member.id === student.id) ? { ...student, familyId: newFamilyId } : student);
  localStorage.setItem(storedStudentsKey(organizationId, eventId), JSON.stringify(updated));
  const localFamilies = deriveFamilyRecords(updated);
  localStorage.setItem(storedFamiliesKey(organizationId, eventId), JSON.stringify(localFamilies));
  appendLocalFamilyHistory(organizationId, eventId, historyEntry);
  if (localChannel) localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  return newFamilyId;
}

/** Separa un integrante de una familia sin movimientos.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} familyId Familia original.
 * @param {string} studentId Integrante a separar.
 * @param {Array<object>} visibleStudents Estudiantes visibles.
 * @returns {Promise<string>} Identificador de la nueva familia.
 * @throws {Error} Si la separación no es válida.
 */
export async function separateFamilyMember(organizationId, eventId, familyId, studentId, visibleStudents = []) {
  const normalizedFamilyId = normalizeFamilyId(familyId);
  const members = visibleStudents.filter((student) => normalizeFamilyId(student.familyId) === normalizedFamilyId);
  const member = members.find((student) => student.id === studentId);
  if (!member || members.length < 2) throw new Error('La familia debe tener al menos dos integrantes para separar uno.');
  if (getCapacityState(member).enteredCount > 0) throw new Error('Solo se puede separar una familia sin movimientos registrados.');
  const remaining = members.filter((student) => student.id !== studentId);
  const newFamilyId = `FAM-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  const oldFamily = { ...createFamilyRecord(normalizedFamilyId, remaining, member), insideCount: 0, updatedAt: now };
  const newFamily = { ...createFamilyRecord(newFamilyId, [member], member), insideCount: 0, createdAt: now, updatedAt: now };
  const { app, db, isConfigured } = initFirebase();
  const operator = app ? getAuth(app).currentUser : null;
  const historyEntry = {
    action: 'SPLIT', sourceFamilyIds: [normalizedFamilyId], targetFamilyId: newFamilyId,
    memberIds: [studentId], operatorUid: operator?.uid || 'local', operatorEmail: operator?.email || 'modo-local', timestamp: now
  };
  if (isConfigured && db) {
    await runTransaction(db, async (transaction) => {
      const oldRef = eventFamilyDoc(db, organizationId, eventId, normalizedFamilyId);
      const newRef = eventFamilyDoc(db, organizationId, eventId, newFamilyId);
      const [oldSnap, newSnap] = await Promise.all([transaction.get(oldRef), transaction.get(newRef)]);
      if (!oldSnap.exists()) throw new Error('La familia original ya no existe.');
      if ((Number(oldSnap.data().enteredCount) || 0) > 0) throw new Error('La familia recibió movimientos y ya no puede separarse.');
      if (newSnap.exists()) throw new Error('El código generado ya existe; vuelve a intentarlo.');
      transaction.set(oldRef, oldFamily, { merge: true });
      transaction.set(newRef, newFamily);
      transaction.update(eventStudentDoc(db, organizationId, eventId, studentId), { familyId: newFamilyId });
      transaction.set(doc(eventFamilyHistory(db, organizationId, eventId)), historyEntry);
    });
  }
  const updated = visibleStudents.map((student) => student.id === studentId ? { ...student, familyId: newFamilyId } : student);
  localStorage.setItem(storedStudentsKey(organizationId, eventId), JSON.stringify(updated));
  localStorage.setItem(storedFamiliesKey(organizationId, eventId), JSON.stringify(deriveFamilyRecords(updated)));
  appendLocalFamilyHistory(organizationId, eventId, historyEntry);
  if (localChannel) localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  return newFamilyId;
}

/** Guarda una nómina y sincroniza sus registros familiares.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Array<object>} newStudents Nómina nueva.
 * @returns {Promise<void>} Promesa de persistencia.
 */
export async function saveStudentsList(organizationId, eventId, newStudents) {
  const key = storedStudentsKey(organizationId, eventId);
  const previousStudents = JSON.parse(localStorage.getItem(key) || '[]');
  const previousStudentIds = new Set(previousStudents.map((student) => student.id));
  const storedStudents = newStudents.map((student) => {
    const stored = stripFamilyCapacityProjection(student);
    return { ...stored, insideCount: Math.max(0, Number(stored.insideCount) || 0) };
  });
  const families = new Map();
  storedStudents.forEach((student) => {
    const familyId = normalizeFamilyId(student.familyId);
    if (!familyId) return;
    student.familyId = familyId;
    if (!families.has(familyId)) families.set(familyId, []);
    families.get(familyId).push(student);
  });
  const familyRecords = deriveFamilyRecords(storedStudents);
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const existingFamilies = await getDocs(eventFamilies(db, organizationId, eventId));
    const existingIds = new Set(existingFamilies.docs.map((family) => normalizeFamilyId(family.id)));
    for (const family of familyRecords.filter((item) => !existingIds.has(item.id))) {
      await runTransaction(db, async (transaction) => {
        const familyRef = eventFamilyDoc(db, organizationId, eventId, family.id);
        const snapshot = await transaction.get(familyRef);
        if (snapshot.exists()) throw new Error(`El código familiar ${family.id} acaba de ser utilizado. Vuelve a intentar la importación.`);
        transaction.set(familyRef, {
          ...family,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
    }
    await commitInChunks(db, familyRecords.filter((family) => existingIds.has(family.id)).map((family) =>
      (batch) => batch.update(eventFamilyDoc(db, organizationId, eventId, family.id), {
        members: family.members,
        updatedAt: new Date().toISOString()
      })));
    const operations = storedStudents.map((student) => {
      const studentRef = eventStudentDoc(db, organizationId, eventId, student.id);
      if (!previousStudentIds.has(student.id)) return (batch) => batch.set(studentRef, student, { merge: true });
      const { enteredCount, insideCount, status, lastEntryAt, lastMovementAt, extraGuest, ...rosterFields } = student;
      return (batch) => batch.set(studentRef, { ...rosterFields, familyOwnerId: deleteField() }, { merge: true });
    });
    await commitInChunks(db, operations);
  }

  // Also write locally
  localStorage.setItem(key, JSON.stringify(storedStudents));
  const cachedFamilies = JSON.parse(localStorage.getItem(storedFamiliesKey(organizationId, eventId)) || '[]');
  const cachedById = new Map(cachedFamilies.map((family) => [normalizeFamilyId(family.id), family]));
  localStorage.setItem(storedFamiliesKey(organizationId, eventId), JSON.stringify(familyRecords.map((family) => ({
    ...family,
    ...(cachedById.get(family.id) || {}),
    members: family.members
  }))));
  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  }
}

// Soft-delete selected students from the active roster. Their records and the
// event log remain recoverable in Firestore if an operator makes a mistake.
/** Marca estudiantes como eliminados sin borrar su historial.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Array<string>} studentIds Estudiantes a eliminar.
 * @returns {Promise<void>} Promesa de eliminación lógica.
 */
export async function deleteStudents(organizationId, eventId, studentIds) {
  const idsToDelete = [...new Set(studentIds.filter(Boolean))];
  if (!idsToDelete.length) return;
  const deletedIds = new Set(idsToDelete);
  const cachedStudents = JSON.parse(localStorage.getItem(storedStudentsKey(organizationId, eventId)) || '[]');
  const affectedFamilyIds = [...new Set(cachedStudents
    .filter((student) => deletedIds.has(student.id) && student.familyId)
    .map((student) => normalizeFamilyId(student.familyId)))];

  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const deletedAt = new Date().toISOString();
    const operations = idsToDelete.map((studentId) => {
      const studentRef = eventStudentDoc(db, organizationId, eventId, studentId);
      return (batch) => batch.update(studentRef, { deleted: true, deletedAt });
    });
    affectedFamilyIds.forEach((familyId) => {
      const remainingStudents = cachedStudents
        .filter((student) => normalizeFamilyId(student.familyId) === familyId && !deletedIds.has(student.id));
      const remainingMembers = remainingStudents.map((student) => student.id);
      const familyRef = eventFamilyDoc(db, organizationId, eventId, familyId);
      operations.push((batch) => remainingMembers.length
        ? batch.set(familyRef, {
          ...createFamilyRecord(familyId, remainingStudents, remainingStudents[0]),
          updatedAt: deletedAt
        }, { merge: true })
        : batch.delete(familyRef));
    });
    await commitInChunks(db, operations);
  }

  const storageKey = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
  try {
    const stored = localStorage.getItem(storageKey);
    const localStudents = stored ? JSON.parse(stored) : [];
    localStorage.setItem(
      storageKey,
      JSON.stringify(localStudents.filter((student) => !deletedIds.has(student.id)))
    );
    const familiesKey = storedFamiliesKey(organizationId, eventId);
    const localFamilies = JSON.parse(localStorage.getItem(familiesKey) || '[]');
    localStorage.setItem(familiesKey, JSON.stringify(localFamilies
      .map((family) => affectedFamilyIds.includes(normalizeFamilyId(family.id))
        ? { ...family, members: family.members.filter((id) => !deletedIds.has(id)) }
        : family)
      .filter((family) => family.members.length > 0)));
  } catch (error) {
    console.warn('No fue posible actualizar la nómina local después de eliminar:', error);
  }

  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  }
}

const FIRESTORE_BATCH_LIMIT = 450;

/** Confirma operaciones Firestore en lotes limitados.
 * @param {object} db Cliente Firestore.
 * @param {Array<Function>} operations Operaciones a ejecutar.
 * @returns {Promise<void>} Promesa de confirmación.
 */
async function commitInChunks(db, operations) {
  for (let start = 0; start < operations.length; start += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations
      .slice(start, start + FIRESTORE_BATCH_LIMIT)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
}

/** Ejecuta mantenimiento de evento y registra su estado.
 * @param {object} db Cliente Firestore.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {string} operation Nombre de operación.
 * @param {Function} work Trabajo de mantenimiento.
 * @returns {Promise<unknown>} Resultado del trabajo.
 * @throws {Error} Si el mantenimiento falla.
 */
async function runEventMaintenance(db, organizationId, eventId, operation, work) {
  const reference = eventDoc(db, organizationId, eventId);
  const startedAt = new Date().toISOString();
  await setDoc(reference, {
    maintenanceState: 'running',
    maintenanceOperation: operation,
    maintenanceStartedAt: startedAt,
    updatedAt: startedAt
  }, { merge: true });
  try {
    const result = await work();
    await setDoc(reference, {
      maintenanceState: '',
      maintenanceOperation: '',
      maintenanceStartedAt: '',
      maintenanceCompletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return result;
  } catch (error) {
    await setDoc(reference, {
      maintenanceState: 'failed',
      maintenanceOperation: operation,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
    throw new Error(`La operación ${operation} quedó incompleta y el evento fue bloqueado para evitar nuevos movimientos. Reintenta la operación. ${error.message}`);
  }
}

/** Reinicia la asistencia derivada de un estudiante local.
 * @param {object} student Estudiante.
 * @returns {object} Estudiante reiniciado.
 */
function resetLocalStudent(student) {
  return resetStudentAttendance(student);
}

// Reset attendance while preserving the roster and each family's capacity.
/** Reinicia la asistencia del evento sin alterar su nómina.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {Promise<unknown>} Resultado del mantenimiento.
 */
export async function resetEventData(organizationId, eventId) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    return runEventMaintenance(db, organizationId, eventId, 'reset', async () => {
    const studentsCol = eventStudents(db, organizationId, eventId);
    const familiesCol = eventFamilies(db, organizationId, eventId);
    const logsCol = eventLogs(db, organizationId, eventId);
    const analyticsCol = eventAnalytics(db, organizationId, eventId);
    const [studentsSnapshot, familiesSnapshot, logsSnapshot, analyticsSnapshot] = await Promise.all([
      getDocs(studentsCol),
      getDocs(familiesCol),
      getDocs(logsCol),
      getDocs(analyticsCol)
    ]);

    const operations = [];

    studentsSnapshot.docs.forEach((studentDoc) => {
      const student = studentDoc.data();
      const hasAccess = getCapacityState(student).maxCapacity > 0;
      const resetStatus = hasAccess ? 'PENDIENTE' : student.status;
      const needsReset =
        (Number(student.enteredCount) || 0) !== 0 ||
        (Number(student.insideCount) || 0) !== 0 ||
        student.lastEntryAt != null ||
        student.lastMovementAt != null ||
        student.extraGuest != null ||
        student.status !== resetStatus;

      if (needsReset) {
        operations.push((batch) => batch.update(studentDoc.ref, {
          enteredCount: 0,
          insideCount: 0,
          status: resetStatus,
          lastEntryAt: deleteField(),
          lastMovementAt: deleteField(),
          extraGuest: deleteField(),
          lastLogId: deleteField()
        }));
      }
    });

    logsSnapshot.docs.forEach((logDoc) => {
      operations.push((batch) => batch.delete(logDoc.ref));
    });
    analyticsSnapshot.docs.filter((analyticsDoc) => analyticsDoc.id !== 'meta').forEach((analyticsDoc) => {
      operations.push((batch) => batch.delete(analyticsDoc.ref));
    });
    operations.push((batch) => batch.set(eventAnalyticsDoc(db, organizationId, eventId, 'meta'), {
      version: LOG_ANALYTICS_VERSION,
      sourceLogCount: 0,
      rebuiltAt: new Date().toISOString()
    }));
    familiesSnapshot.docs.forEach((familyDoc) => {
      operations.push((batch) => batch.update(familyDoc.ref, {
        enteredCount: 0,
        insideCount: 0,
        status: 'PENDIENTE',
        lastEntryAt: deleteField(),
        lastMovementAt: deleteField(),
        extraGuest: deleteField(),
        lastLogId: deleteField(),
        updatedAt: new Date().toISOString()
      }));
    });

    await commitInChunks(db, operations);

    localStorage.setItem(
      organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId,
      JSON.stringify(studentsSnapshot.docs.map((studentDoc) => ({
        ...resetLocalStudent(studentDoc.data()),
        id: studentDoc.id
      })))
    );
    localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId, JSON.stringify([]));
    localStorage.setItem(storedFamiliesKey(organizationId, eventId), JSON.stringify(familiesSnapshot.docs.map((familyDoc) => ({
      ...familyDoc.data(), id: familyDoc.id, enteredCount: 0, insideCount: 0, status: 'PENDIENTE', lastEntryAt: undefined, lastMovementAt: undefined, extraGuest: undefined
    }))));
      return;
    });
  }

  const studentsKey = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
  let students = INITIAL_STUDENTS;

  try {
    const storedStudents = localStorage.getItem(studentsKey);
    if (storedStudents) students = JSON.parse(storedStudents);
  } catch (e) {}

  localStorage.setItem(studentsKey, JSON.stringify(students.map(resetLocalStudent)));
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId, JSON.stringify([]));
  const familiesKey = storedFamiliesKey(organizationId, eventId);
  const families = JSON.parse(localStorage.getItem(familiesKey) || '[]');
  localStorage.setItem(familiesKey, JSON.stringify(families.map((family) => {
    const { lastEntryAt, lastMovementAt, extraGuest, ...rest } = family;
    return { ...rest, enteredCount: 0, insideCount: 0, status: 'PENDIENTE' };
  })));

  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
    localChannel.postMessage({ type: 'LOGS_UPDATED', organizationId, eventId });
  }
}
