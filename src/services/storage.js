import { initFirebase } from './firebase';
import { INITIAL_STUDENTS, INITIAL_EVENT } from '../mock/sampleStudents';
import {
  createCheckInPlan,
  getCapacityState,
  normalizeExtraPerson,
  resetStudentAttendance
} from './checkinPolicy';
import {
  createEventId,
  normalizeEvent,
  prepareStudentsForEvent,
  selectStudentsForCourses
} from './eventPolicy';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  getDocs,
  writeBatch,
  deleteField
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const LOCAL_STORAGE_KEY_STUDENTS = 'mp_students_data_';
const LOCAL_STORAGE_KEY_LOGS = 'mp_logs_data_';
const LOCAL_STORAGE_KEY_EVENT = 'mp_current_event';
const LOCAL_STORAGE_KEY_EVENTS = 'mp_events_catalog';
const LOCAL_STORAGE_KEY_DOOR = 'mp_current_door';
function hydrateStudentRuts(students) {
  return students;
}

// BroadcastChannel for instant multi-tab sync in local mode
let localChannel = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    localChannel = new BroadcastChannel('mp_access_sync');
  } catch (e) {}
}

function organizationKey(key, organizationId) {
  return `${key}${organizationId || 'sin-organizacion'}_`;
}

function eventDoc(db, organizationId, eventId) {
  return doc(db, 'organizations', organizationId, 'events', eventId);
}

function eventStudents(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'students');
}

function eventStudentDoc(db, organizationId, eventId, studentId) {
  return doc(db, 'organizations', organizationId, 'events', eventId, 'students', studentId);
}

function eventLogs(db, organizationId, eventId) {
  return collection(db, 'organizations', organizationId, 'events', eventId, 'logs');
}

function eventLogDoc(db, organizationId, eventId, logId) {
  return doc(db, 'organizations', organizationId, 'events', eventId, 'logs', logId);
}

export function getCurrentDoor(organizationId) {
  return localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_DOOR, organizationId)) || 'Acceso Principal';
}

export function setCurrentDoor(organizationId, doorName) {
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_DOOR, organizationId), doorName);
}

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

export function saveCurrentEvent(organizationId, eventData) {
  const normalizedEvent = normalizeEvent(eventData, INITIAL_EVENT);
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_EVENT, organizationId), JSON.stringify(normalizedEvent));
  return normalizedEvent;
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    if (left.archived !== right.archived) return left.archived ? 1 : -1;
    return String(right.date || '').localeCompare(String(left.date || ''))
      || String(left.name || '').localeCompare(String(right.name || ''), 'es');
  });
}

function saveLocalEvents(organizationId, events) {
  const normalized = sortEvents(events.map((event) => normalizeEvent(event, INITIAL_EVENT)));
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_EVENTS, organizationId), JSON.stringify(normalized));
  if (localChannel) localChannel.postMessage({ type: 'EVENTS_UPDATED', organizationId });
  return normalized;
}

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

  const load = () => onUpdate(getLocalEvents(organizationId), 'local');
  const handleMessage = (message) => {
    if (message.data?.type === 'EVENTS_UPDATED' && message.data.organizationId === organizationId) load();
  };
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
  return saveCurrentEvent(organizationId, updatedEvent);
}

export async function createEvent(organizationId, eventData, { copyStudents = false, sourceStudents = [], selectedCourses } = {}) {
  const now = new Date();
  const id = createEventId(eventData?.name, eventData?.date, now.getTime());
  const selectedStudents = Array.isArray(selectedCourses)
    ? selectStudentsForCourses(sourceStudents, selectedCourses)
    : sourceStudents;
  const students = copyStudents ? prepareStudentsForEvent(selectedStudents) : [];
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
    await commitInChunks(db, students.map((student) => (batch) => {
      batch.set(eventStudentDoc(db, organizationId, id, student.id), student);
    }));
  }

  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + id, JSON.stringify(students));
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + id, JSON.stringify([]));
  saveLocalEvents(organizationId, [...getLocalEvents(organizationId), newEvent]);
  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId: id });
    localChannel.postMessage({ type: 'LOGS_UPDATED', organizationId, eventId: id });
  }
  return saveCurrentEvent(organizationId, newEvent);
}

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
export function subscribeToStudents(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    // Firebase Firestore Realtime Listener
    const studentsCol = eventStudents(db, organizationId, eventId);
    const unsubscribe = onSnapshot(
      studentsCol,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.empty) {
          onUpdate([], snapshot.metadata.fromCache ? 'offline' : 'cloud');
          return;
        }
        const students = hydrateStudentRuts(snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        }))).filter((student) => student.deleted !== true);
        // Cache locally for offline backup
        localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId, JSON.stringify(students));
        onUpdate(students, snapshot.metadata.fromCache ? 'offline' : 'cloud');
      },
      (error) => {
        console.warn("Firestore subscription error:", error);
        // Never silently switch a cloud deployment to independent local data.
        // Show the durable cache, but mark synchronization as failed.
        loadCachedStudents(organizationId, eventId, onUpdate, 'error');
      }
    );
    return unsubscribe;
  } else {
    // Local mode
    return fallbackToLocalStudents(organizationId, eventId, onUpdate);
  }
}

function loadCachedStudents(organizationId, eventId, onUpdate, mode) {
  try {
    const raw = localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId);
    onUpdate(raw ? hydrateStudentRuts(JSON.parse(raw)) : [], mode);
  } catch (e) {
    onUpdate([], mode);
  }
}

const DATA_VERSION_KEY = 'mp_data_version_tag';
const CURRENT_DATA_VERSION = 'v3_251_students';

function fallbackToLocalStudents(organizationId, eventId, onUpdate) {
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
      const hydratedStudents = hydrateStudentRuts(JSON.parse(raw));
      localStorage.setItem(storageKey, JSON.stringify(hydratedStudents));
      onUpdate(hydratedStudents, 'local');
    } catch (e) {
      onUpdate(INITIAL_STUDENTS, 'local');
    }
  };

  loadLocal();

  const handleMessage = (evt) => {
    if (evt.data?.type === 'STUDENTS_UPDATED' && evt.data?.organizationId === organizationId && evt.data?.eventId === eventId) {
      loadLocal();
    }
  };

  if (localChannel) {
    localChannel.addEventListener('message', handleMessage);
  }

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
export function subscribeToLogs(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const logsCol = eventLogs(db, organizationId, eventId);
    const q = query(logsCol, orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const logs = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        }));
        localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId, JSON.stringify(logs));
        onUpdate(logs, snapshot.metadata.fromCache ? 'offline' : 'cloud');
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

function statusForEnteredCount(enteredCount, maxCapacity) {
  if (enteredCount <= 0) return 'PENDIENTE';
  if (enteredCount >= maxCapacity) return 'COMPLETO';
  return 'PARCIAL';
}

// Remove one audit entry and adjust its student's counter atomically.
export async function deleteLogEntry(organizationId, eventId, log) {
  const logId = log?.id;
  if (!logId) throw new Error('El registro no tiene un identificador válido.');

  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    const logRef = eventLogDoc(db, organizationId, eventId, logId);

    await runTransaction(db, async (transaction) => {
      const logSnapshot = await transaction.get(logRef);
      if (!logSnapshot.exists()) {
        throw new Error('El registro ya no existe en la base de datos.');
      }

      const storedLog = logSnapshot.data();
      const storedStudentRef = eventStudentDoc(db, organizationId, eventId, storedLog.studentId);
      const studentSnapshot = await transaction.get(storedStudentRef);

      if (studentSnapshot.exists()) {
        const student = studentSnapshot.data();
        const removedCount = Math.max(1, Number(storedLog.count) || 1);
        const newEnteredCount = Math.max(0, (Number(student.enteredCount) || 0) - removedCount);
        const maxCapacity = getCapacityState(student).maxCapacity;
        const update = {
          enteredCount: newEnteredCount,
          status: statusForEnteredCount(newEnteredCount, maxCapacity)
        };
        if (storedLog.isExtra === true) update.extraGuest = deleteField();
        transaction.update(storedStudentRef, update);
      }

      transaction.delete(logRef);
    });
  }

  const storageKey = organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId;
  try {
    const stored = localStorage.getItem(storageKey);
    const localLogs = stored ? JSON.parse(stored) : [];
    localStorage.setItem(
      storageKey,
      JSON.stringify(localLogs.filter((log) => log.id !== logId))
    );

    const studentsKey = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
    const storedStudents = localStorage.getItem(studentsKey);
    if (storedStudents && log.studentId) {
      const removedCount = Math.max(1, Number(log.count) || 1);
      const localStudents = JSON.parse(storedStudents).map((student) => {
        if (student.id !== log.studentId) return student;
        const newEnteredCount = Math.max(0, (Number(student.enteredCount) || 0) - removedCount);
        const updatedStudent = {
          ...student,
          enteredCount: newEnteredCount,
          status: statusForEnteredCount(newEnteredCount, getCapacityState(student).maxCapacity)
        };
        if (log.isExtra === true) delete updatedStudent.extraGuest;
        return updatedStudent;
      });
      localStorage.setItem(studentsKey, JSON.stringify(localStudents));
    }
  } catch (error) {
    console.warn('No fue posible actualizar el historial local después de eliminar:', error);
  }

  if (localChannel) {
    localChannel.postMessage({ type: 'LOGS_UPDATED', organizationId, eventId });
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  }
}

function loadCachedLogs(organizationId, eventId, onUpdate, mode) {
  try {
    const raw = localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId);
    onUpdate(raw ? JSON.parse(raw) : [], mode);
  } catch (e) {
    onUpdate([], mode);
  }
}

function fallbackToLocalLogs(organizationId, eventId, onUpdate) {
  const loadLogs = () => {
    try {
      const raw = localStorage.getItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId);
      onUpdate(raw ? JSON.parse(raw) : []);
    } catch (e) {
      onUpdate([]);
    }
  };

  loadLogs();

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
export async function registerCheckIn({
  organizationId,
  eventId,
  studentId,
  count,
  doorName,
  extraPerson = null
}) {
  const { app, db, isConfigured } = initFirebase();
  const now = new Date();
  const timestampIso = now.toISOString();
  const formattedTime = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = now.toLocaleDateString('es-CL');
  const normalizedExtraPerson = normalizeExtraPerson(extraPerson);
  const operator = app ? getAuth(app).currentUser : null;

  const buildPlan = (student) => createCheckInPlan({
    student,
    count,
    doorName,
    timestampIso,
    extraPerson: normalizedExtraPerson
  });

  const buildLogData = (student, plan) => ({
    studentId,
    studentName: student.name,
    course: student.course,
    count,
    accumulated: plan.newEntered,
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

  const buildUpdatedStudent = (student, plan) => ({
    ...student,
    enteredCount: plan.newEntered,
    status: plan.newStatus,
    lastEntryAt: timestampIso,
    ...(plan.extraGuest ? { extraGuest: plan.extraGuest } : {})
  });

  if (isConfigured && db) {
    // Cloud Firestore Transaction to guarantee concurrency safety across phones
    const studentRef = eventStudentDoc(db, organizationId, eventId, studentId);
    const logRef = doc(eventLogs(db, organizationId, eventId));

    return await runTransaction(db, async (transaction) => {
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists()) {
        throw new Error("Estudiante no encontrado en la base de datos.");
      }

      const currentData = studentSnap.data();
      const plan = buildPlan(currentData);
      const updatedStudent = buildUpdatedStudent(currentData, plan);

      transaction.update(studentRef, {
        enteredCount: plan.newEntered,
        status: plan.newStatus,
        lastEntryAt: timestampIso,
        ...(plan.extraGuest ? { extraGuest: plan.extraGuest } : {})
      });

      // Student counter and audit log commit together. A transaction retry uses
      // the same log ID, so concurrent scans cannot create duplicate entries.
      transaction.set(logRef, buildLogData(currentData, plan));

      return {
        student: updatedStudent,
        newEntered: plan.newEntered,
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

    const student = students[studentIndex];
    const plan = buildPlan(student);
    students[studentIndex] = buildUpdatedStudent(student, plan);

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
      remaining: plan.remaining,
      count,
      isExtra: plan.isExtra,
      extraGuest: plan.extraGuest
    };
  }
}

// Bulk update / Import students
// Patch capacity only so a simultaneous check-in is never overwritten.
export async function saveStudentCapacities(organizationId, eventId, updates) {
  if (updates.some(({ id, maxCapacity }) => !id || !Number.isInteger(maxCapacity) || maxCapacity < 1 || maxCapacity > 50)) {
    throw new Error('El cupo debe ser un entero entre 1 y 50.');
  }
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await commitInChunks(db, updates.map(({ id, maxCapacity }) => (batch) =>
      batch.update(eventStudentDoc(db, organizationId, eventId, id), { maxCapacity })));
  }
  const key = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
  const capacities = new Map(updates.map(({ id, maxCapacity }) => [id, maxCapacity]));
  const current = JSON.parse(localStorage.getItem(key) || '[]');
  localStorage.setItem(key, JSON.stringify(current.map((student) =>
    capacities.has(student.id) && !getCapacityState(student).isRetired
      ? { ...student, maxCapacity: capacities.get(student.id) } : student)));
  if (localChannel) localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
}

export async function saveStudentsList(organizationId, eventId, newStudents) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const operations = newStudents.map((student) => {
      const studentRef = eventStudentDoc(db, organizationId, eventId, student.id);
      return (batch) => batch.set(studentRef, student, { merge: true });
    });
    await commitInChunks(db, operations);
  }

  // Also write locally
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId, JSON.stringify(newStudents));
  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  }
}

// Soft-delete selected students from the active roster. Their records and the
// event log remain recoverable in Firestore if an operator makes a mistake.
export async function deleteStudents(organizationId, eventId, studentIds) {
  const idsToDelete = [...new Set(studentIds.filter(Boolean))];
  if (!idsToDelete.length) return;

  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const deletedAt = new Date().toISOString();
    const operations = idsToDelete.map((studentId) => {
      const studentRef = eventStudentDoc(db, organizationId, eventId, studentId);
      return (batch) => batch.update(studentRef, { deleted: true, deletedAt });
    });
    await commitInChunks(db, operations);
  }

  const storageKey = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
  const deletedIds = new Set(idsToDelete);
  try {
    const stored = localStorage.getItem(storageKey);
    const localStudents = stored ? JSON.parse(stored) : [];
    localStorage.setItem(
      storageKey,
      JSON.stringify(localStudents.filter((student) => !deletedIds.has(student.id)))
    );
  } catch (error) {
    console.warn('No fue posible actualizar la nómina local después de eliminar:', error);
  }

  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
  }
}

const FIRESTORE_BATCH_LIMIT = 450;

async function commitInChunks(db, operations) {
  for (let start = 0; start < operations.length; start += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations
      .slice(start, start + FIRESTORE_BATCH_LIMIT)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
}

function resetLocalStudent(student) {
  return resetStudentAttendance(student);
}

// Reset attendance while preserving the roster and each family's capacity.
export async function resetEventData(organizationId, eventId) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const studentsCol = eventStudents(db, organizationId, eventId);
    const logsCol = eventLogs(db, organizationId, eventId);
    const [studentsSnapshot, logsSnapshot] = await Promise.all([
      getDocs(studentsCol),
      getDocs(logsCol)
    ]);

    const operations = [];

    studentsSnapshot.docs.forEach((studentDoc) => {
      const student = studentDoc.data();
      const hasAccess = getCapacityState(student).maxCapacity > 0;
      const resetStatus = hasAccess ? 'PENDIENTE' : student.status;
      const needsReset =
        (Number(student.enteredCount) || 0) !== 0 ||
        student.lastEntryAt != null ||
        student.extraGuest != null ||
        student.status !== resetStatus;

      if (needsReset) {
        operations.push((batch) => batch.update(studentDoc.ref, {
          enteredCount: 0,
          status: resetStatus,
          lastEntryAt: deleteField(),
          extraGuest: deleteField()
        }));
      }
    });

    logsSnapshot.docs.forEach((logDoc) => {
      operations.push((batch) => batch.delete(logDoc.ref));
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
    return;
  }

  const studentsKey = organizationKey(LOCAL_STORAGE_KEY_STUDENTS, organizationId) + eventId;
  let students = INITIAL_STUDENTS;

  try {
    const storedStudents = localStorage.getItem(studentsKey);
    if (storedStudents) students = JSON.parse(storedStudents);
  } catch (e) {}

  localStorage.setItem(studentsKey, JSON.stringify(students.map(resetLocalStudent)));
  localStorage.setItem(organizationKey(LOCAL_STORAGE_KEY_LOGS, organizationId) + eventId, JSON.stringify([]));

  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', organizationId, eventId });
    localChannel.postMessage({ type: 'LOGS_UPDATED', organizationId, eventId });
  }
}
