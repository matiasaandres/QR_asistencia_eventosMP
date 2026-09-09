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
  prepareStudentsForEvent
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

const LOCAL_STORAGE_KEY_STUDENTS = 'mp_students_data_';
const LOCAL_STORAGE_KEY_LOGS = 'mp_logs_data_';
const LOCAL_STORAGE_KEY_EVENT = 'mp_current_event';
const LOCAL_STORAGE_KEY_EVENTS = 'mp_events_catalog';
const LOCAL_STORAGE_KEY_DOOR = 'mp_current_door';
const initialStudentsById = new Map(INITIAL_STUDENTS.map((student) => [student.id, student]));
const rutBackfillsInProgress = new Set();

function hydrateStudentRuts(students) {
  return students.map((student) => {
    if (student.rut) return student;
    const initialStudent = initialStudentsById.get(student.id);
    return initialStudent?.rut ? { ...student, rut: initialStudent.rut } : student;
  });
}

// BroadcastChannel for instant multi-tab sync in local mode
let localChannel = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    localChannel = new BroadcastChannel('mp_access_sync');
  } catch (e) {}
}

export function getCurrentDoor() {
  return localStorage.getItem(LOCAL_STORAGE_KEY_DOOR) || 'Acceso Principal';
}

export function setCurrentDoor(doorName) {
  localStorage.setItem(LOCAL_STORAGE_KEY_DOOR, doorName);
}

export function getCurrentEvent() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_EVENT);
    const currentEvent = normalizeEvent(raw ? JSON.parse(raw) : INITIAL_EVENT, INITIAL_EVENT);
    localStorage.setItem(LOCAL_STORAGE_KEY_EVENT, JSON.stringify(currentEvent));
    return currentEvent;
  } catch (e) {
    return normalizeEvent(INITIAL_EVENT, INITIAL_EVENT);
  }
}

export function saveCurrentEvent(eventData) {
  const normalizedEvent = normalizeEvent(eventData, INITIAL_EVENT);
  localStorage.setItem(LOCAL_STORAGE_KEY_EVENT, JSON.stringify(normalizedEvent));
  return normalizedEvent;
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    if (left.archived !== right.archived) return left.archived ? 1 : -1;
    return String(right.date || '').localeCompare(String(left.date || ''))
      || String(left.name || '').localeCompare(String(right.name || ''), 'es');
  });
}

function saveLocalEvents(events) {
  const normalized = sortEvents(events.map((event) => normalizeEvent(event, INITIAL_EVENT)));
  localStorage.setItem(LOCAL_STORAGE_KEY_EVENTS, JSON.stringify(normalized));
  if (localChannel) localChannel.postMessage({ type: 'EVENTS_UPDATED' });
  return normalized;
}

function getLocalEvents() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_EVENTS);
    if (raw) {
      const events = JSON.parse(raw);
      if (Array.isArray(events) && events.length) {
        return sortEvents(events.map((event) => normalizeEvent(event, INITIAL_EVENT)));
      }
    }
  } catch (error) {
    console.warn('No fue posible leer el catálogo local de eventos:', error);
  }

  return saveLocalEvents([getCurrentEvent()]);
}

export function subscribeToEvents(onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    return onSnapshot(
      collection(db, 'events'),
      { includeMetadataChanges: true },
      (snapshot) => {
        const events = sortEvents(snapshot.docs.map((eventDoc) => normalizeEvent({
          ...eventDoc.data(),
          id: eventDoc.id
        }, INITIAL_EVENT)));
        const nextEvents = events.length ? events : [normalizeEvent(INITIAL_EVENT, INITIAL_EVENT)];
        saveLocalEvents(nextEvents);
        onUpdate(nextEvents, snapshot.metadata.fromCache ? 'offline' : 'cloud');
      },
      (error) => {
        console.warn('Firestore events subscription error:', error);
        onUpdate(getLocalEvents(), 'error');
      }
    );
  }

  const load = () => onUpdate(getLocalEvents(), 'local');
  const handleMessage = (message) => {
    if (message.data?.type === 'EVENTS_UPDATED') load();
  };
  const handleStorage = (storageEvent) => {
    if (storageEvent.key === LOCAL_STORAGE_KEY_EVENTS) load();
  };

  load();
  if (localChannel) localChannel.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);
  return () => {
    if (localChannel) localChannel.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

export async function updateEvent(eventData) {
  const current = normalizeEvent(eventData, INITIAL_EVENT);
  if (!current.id) throw new Error('El evento no tiene un identificador válido.');

  const updatedEvent = {
    ...current,
    updatedAt: new Date().toISOString()
  };
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await setDoc(doc(db, 'events', updatedEvent.id), updatedEvent, { merge: true });
  }

  const events = getLocalEvents();
  const nextEvents = events.some((event) => event.id === updatedEvent.id)
    ? events.map((event) => event.id === updatedEvent.id ? updatedEvent : event)
    : [...events, updatedEvent];
  saveLocalEvents(nextEvents);
  return saveCurrentEvent(updatedEvent);
}

export async function createEvent(eventData, { copyStudents = false, sourceStudents = [] } = {}) {
  const now = new Date();
  const id = createEventId(eventData?.name, eventData?.date, now.getTime());
  const students = copyStudents ? prepareStudentsForEvent(sourceStudents) : [];
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
    await setDoc(doc(db, 'events', id), newEvent);
    await commitInChunks(db, students.map((student) => (batch) => {
      batch.set(doc(db, 'events', id, 'students', student.id), student);
    }));
  }

  localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + id, JSON.stringify(students));
  localStorage.setItem(LOCAL_STORAGE_KEY_LOGS + id, JSON.stringify([]));
  saveLocalEvents([...getLocalEvents(), newEvent]);
  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId: id });
    localChannel.postMessage({ type: 'LOGS_UPDATED', eventId: id });
  }
  return saveCurrentEvent(newEvent);
}

export async function archiveEvent(eventId, archived = true) {
  if (!eventId) throw new Error('Selecciona un evento válido.');
  const updatedAt = new Date().toISOString();
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await setDoc(doc(db, 'events', eventId), { archived, updatedAt }, { merge: true });
  }
  const events = getLocalEvents().map((event) => (
    event.id === eventId ? { ...event, archived, updatedAt } : event
  ));
  saveLocalEvents(events);
  return events.find((event) => event.id === eventId);
}

// Subscribe to Students list (real-time via Firestore OR LocalStorage)
export function subscribeToStudents(eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    // Firebase Firestore Realtime Listener
    const studentsCol = collection(db, 'events', eventId, 'students');
    const unsubscribe = onSnapshot(
      studentsCol,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.empty) {
          // Only the original legacy event receives the bundled roster. New
          // events remain empty unless the administrator chooses to copy it.
          initializeRemoteStudents(db, eventId)
            .then(() => onUpdate([], snapshot.metadata.fromCache ? 'offline' : 'cloud'))
            .catch((error) => {
              console.error("Error initializing remote students:", error);
              loadCachedStudents(eventId, onUpdate, 'error');
            });
          return;
        }
        const students = hydrateStudentRuts(snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        }))).filter((student) => student.deleted !== true);
        // Cache locally for offline backup
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(students));
        onUpdate(students, snapshot.metadata.fromCache ? 'offline' : 'cloud');
        backfillRemoteStudentRuts(db, eventId, snapshot.docs).catch((error) => {
          console.warn('No fue posible completar los RUT faltantes en Firestore:', error);
        });
      },
      (error) => {
        console.warn("Firestore subscription error:", error);
        // Never silently switch a cloud deployment to independent local data.
        // Show the durable cache, but mark synchronization as failed.
        loadCachedStudents(eventId, onUpdate, 'error');
      }
    );
    return unsubscribe;
  } else {
    // Local mode
    return fallbackToLocalStudents(eventId, onUpdate);
  }
}

function loadCachedStudents(eventId, onUpdate, mode) {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENTS + eventId);
    onUpdate(raw ? hydrateStudentRuts(JSON.parse(raw)) : [], mode);
  } catch (e) {
    onUpdate([], mode);
  }
}

const DATA_VERSION_KEY = 'mp_data_version_tag';
const CURRENT_DATA_VERSION = 'v3_251_students';

function fallbackToLocalStudents(eventId, onUpdate) {
  const loadLocal = () => {
    try {
      const versionKey = `${DATA_VERSION_KEY}_${eventId}`;
      const currentVersion = localStorage.getItem(versionKey)
        || (eventId === INITIAL_EVENT.id ? localStorage.getItem(DATA_VERSION_KEY) : null);
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENTS + eventId);

      if (!raw) {
        const initialRoster = eventId === INITIAL_EVENT.id ? INITIAL_STUDENTS : [];
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(initialRoster));
        localStorage.setItem(versionKey, CURRENT_DATA_VERSION);
        onUpdate(initialRoster, 'local');
        return;
      }

      if (eventId === INITIAL_EVENT.id && currentVersion !== CURRENT_DATA_VERSION) {
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(INITIAL_STUDENTS));
        localStorage.setItem(versionKey, CURRENT_DATA_VERSION);
        onUpdate(INITIAL_STUDENTS, 'local');
        return;
      }
      const hydratedStudents = hydrateStudentRuts(JSON.parse(raw));
      localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(hydratedStudents));
      onUpdate(hydratedStudents, 'local');
    } catch (e) {
      onUpdate(INITIAL_STUDENTS, 'local');
    }
  };

  loadLocal();

  const handleMessage = (evt) => {
    if (evt.data?.type === 'STUDENTS_UPDATED' && evt.data?.eventId === eventId) {
      loadLocal();
    }
  };

  if (localChannel) {
    localChannel.addEventListener('message', handleMessage);
  }

  const handleStorage = (e) => {
    if (e.key === LOCAL_STORAGE_KEY_STUDENTS + eventId) {
      loadLocal();
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    if (localChannel) localChannel.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

async function initializeRemoteStudents(db, eventId) {
  if (eventId !== INITIAL_EVENT.id) return;
  const eventRef = doc(db, 'events', eventId);

  await runTransaction(db, async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    if (eventSnap.exists() && eventSnap.data().studentsInitialized) return;

    for (const student of INITIAL_STUDENTS) {
      const studentRef = doc(db, 'events', eventId, 'students', student.id);
      transaction.set(studentRef, student);
    }
    transaction.set(eventRef, {
      ...INITIAL_EVENT,
      studentsInitialized: true,
      initializedAt: new Date().toISOString()
    }, { merge: true });
  });
}

// Subscribe to Entry Logs (real-time)
export function subscribeToLogs(eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const logsCol = collection(db, 'events', eventId, 'logs');
    const q = query(logsCol, orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const logs = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        }));
        localStorage.setItem(LOCAL_STORAGE_KEY_LOGS + eventId, JSON.stringify(logs));
        onUpdate(logs, snapshot.metadata.fromCache ? 'offline' : 'cloud');
      },
      (err) => {
        console.warn("Firestore logs error:", err);
        loadCachedLogs(eventId, onUpdate, 'error');
      }
    );
    return unsubscribe;
  } else {
    return fallbackToLocalLogs(eventId, onUpdate);
  }
}

function statusForEnteredCount(enteredCount, maxCapacity) {
  if (enteredCount <= 0) return 'PENDIENTE';
  if (enteredCount >= maxCapacity) return 'COMPLETO';
  return 'PARCIAL';
}

// Remove one audit entry and adjust its student's counter atomically.
export async function deleteLogEntry(eventId, log) {
  const logId = log?.id;
  if (!logId) throw new Error('El registro no tiene un identificador válido.');

  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    const logRef = doc(db, 'events', eventId, 'logs', logId);

    await runTransaction(db, async (transaction) => {
      const logSnapshot = await transaction.get(logRef);
      if (!logSnapshot.exists()) {
        throw new Error('El registro ya no existe en la base de datos.');
      }

      const storedLog = logSnapshot.data();
      const storedStudentRef = doc(db, 'events', eventId, 'students', storedLog.studentId);
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

  const storageKey = LOCAL_STORAGE_KEY_LOGS + eventId;
  try {
    const stored = localStorage.getItem(storageKey);
    const localLogs = stored ? JSON.parse(stored) : [];
    localStorage.setItem(
      storageKey,
      JSON.stringify(localLogs.filter((log) => log.id !== logId))
    );

    const studentsKey = LOCAL_STORAGE_KEY_STUDENTS + eventId;
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
    localChannel.postMessage({ type: 'LOGS_UPDATED', eventId });
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
  }
}

function loadCachedLogs(eventId, onUpdate, mode) {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_LOGS + eventId);
    onUpdate(raw ? JSON.parse(raw) : [], mode);
  } catch (e) {
    onUpdate([], mode);
  }
}

function fallbackToLocalLogs(eventId, onUpdate) {
  const loadLogs = () => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_LOGS + eventId);
      onUpdate(raw ? JSON.parse(raw) : []);
    } catch (e) {
      onUpdate([]);
    }
  };

  loadLogs();

  const handleMessage = (evt) => {
    if (evt.data?.type === 'LOGS_UPDATED' && evt.data?.eventId === eventId) {
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
  eventId,
  studentId,
  count,
  doorName,
  extraPerson = null
}) {
  const { db, isConfigured } = initFirebase();
  const now = new Date();
  const timestampIso = now.toISOString();
  const formattedTime = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = now.toLocaleDateString('es-CL');
  const normalizedExtraPerson = normalizeExtraPerson(extraPerson);

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
    const studentRef = doc(db, 'events', eventId, 'students', studentId);
    const logRef = doc(collection(db, 'events', eventId, 'logs'));

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
    const keyStudents = LOCAL_STORAGE_KEY_STUDENTS + eventId;
    const keyLogs = LOCAL_STORAGE_KEY_LOGS + eventId;

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
      localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
      localChannel.postMessage({ type: 'LOGS_UPDATED', eventId });
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
export async function saveStudentCapacities(eventId, updates) {
  if (updates.some(({ id, maxCapacity }) => !id || !Number.isInteger(maxCapacity) || maxCapacity < 1 || maxCapacity > 50)) {
    throw new Error('El cupo debe ser un entero entre 1 y 50.');
  }
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await commitInChunks(db, updates.map(({ id, maxCapacity }) => (batch) =>
      batch.update(doc(db, 'events', eventId, 'students', id), { maxCapacity })));
  }
  const key = LOCAL_STORAGE_KEY_STUDENTS + eventId;
  const capacities = new Map(updates.map(({ id, maxCapacity }) => [id, maxCapacity]));
  const current = JSON.parse(localStorage.getItem(key) || '[]');
  localStorage.setItem(key, JSON.stringify(current.map((student) =>
    capacities.has(student.id) && !getCapacityState(student).isRetired
      ? { ...student, maxCapacity: capacities.get(student.id) } : student)));
  if (localChannel) localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
}

export async function saveStudentsList(eventId, newStudents) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const operations = newStudents.map((student) => {
      const studentRef = doc(db, 'events', eventId, 'students', student.id);
      return (batch) => batch.set(studentRef, student, { merge: true });
    });
    await commitInChunks(db, operations);
  }

  // Also write locally
  localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(newStudents));
  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
  }
}

// Soft-delete selected students from the active roster. Their records and the
// event log remain recoverable in Firestore if an operator makes a mistake.
export async function deleteStudents(eventId, studentIds) {
  const idsToDelete = [...new Set(studentIds.filter(Boolean))];
  if (!idsToDelete.length) return;

  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const deletedAt = new Date().toISOString();
    const operations = idsToDelete.map((studentId) => {
      const studentRef = doc(db, 'events', eventId, 'students', studentId);
      return (batch) => batch.update(studentRef, { deleted: true, deletedAt });
    });
    await commitInChunks(db, operations);
  }

  const storageKey = LOCAL_STORAGE_KEY_STUDENTS + eventId;
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
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
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

async function backfillRemoteStudentRuts(db, eventId, studentDocs) {
  if (rutBackfillsInProgress.has(eventId)) return;

  const missingRuts = studentDocs
    .map((studentDoc) => ({
      ref: studentDoc.ref,
      currentRut: studentDoc.data().rut,
      rut: initialStudentsById.get(studentDoc.id)?.rut
    }))
    .filter((student) => !student.currentRut && student.rut);

  if (!missingRuts.length) return;

  rutBackfillsInProgress.add(eventId);
  try {
    for (let start = 0; start < missingRuts.length; start += 450) {
      const batch = writeBatch(db);
      missingRuts.slice(start, start + 450).forEach((student) => {
        batch.update(student.ref, { rut: student.rut });
      });
      await batch.commit();
    }
  } finally {
    rutBackfillsInProgress.delete(eventId);
  }
}

function resetLocalStudent(student) {
  return resetStudentAttendance(student);
}

// Reset attendance while preserving the roster and each family's capacity.
export async function resetEventData(eventId) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const studentsCol = collection(db, 'events', eventId, 'students');
    const logsCol = collection(db, 'events', eventId, 'logs');
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
      LOCAL_STORAGE_KEY_STUDENTS + eventId,
      JSON.stringify(studentsSnapshot.docs.map((studentDoc) => ({
        ...resetLocalStudent(studentDoc.data()),
        id: studentDoc.id
      })))
    );
    localStorage.setItem(LOCAL_STORAGE_KEY_LOGS + eventId, JSON.stringify([]));
    return;
  }

  const studentsKey = LOCAL_STORAGE_KEY_STUDENTS + eventId;
  let students = INITIAL_STUDENTS;

  try {
    const storedStudents = localStorage.getItem(studentsKey);
    if (storedStudents) students = JSON.parse(storedStudents);
  } catch (e) {}

  localStorage.setItem(studentsKey, JSON.stringify(students.map(resetLocalStudent)));
  localStorage.setItem(LOCAL_STORAGE_KEY_LOGS + eventId, JSON.stringify([]));

  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
    localChannel.postMessage({ type: 'LOGS_UPDATED', eventId });
  }
}
