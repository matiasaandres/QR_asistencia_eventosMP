import { initFirebase } from './firebase';
import { INITIAL_STUDENTS, INITIAL_EVENT } from '../mock/sampleStudents';
import {
  createCheckInPlan,
  ensureRequiredDoors,
  getCapacityState,
  normalizeExtraPerson,
  resetStudentAttendance
} from './checkinPolicy';
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
const LOCAL_STORAGE_KEY_DOOR = 'mp_current_door';

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
    const currentEvent = ensureRequiredDoors(raw ? JSON.parse(raw) : INITIAL_EVENT, INITIAL_EVENT);
    localStorage.setItem(LOCAL_STORAGE_KEY_EVENT, JSON.stringify(currentEvent));
    return currentEvent;
  } catch (e) {
    return ensureRequiredDoors(INITIAL_EVENT, INITIAL_EVENT);
  }
}

export function saveCurrentEvent(eventData) {
  const normalizedEvent = ensureRequiredDoors(eventData, INITIAL_EVENT);
  localStorage.setItem(LOCAL_STORAGE_KEY_EVENT, JSON.stringify(normalizedEvent));
  return normalizedEvent;
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
          // Seed once, atomically. The transaction marker prevents two devices
          // from re-seeding and overwriting attendance at the same time.
          initializeRemoteStudents(db, eventId).catch((error) => {
            console.error("Error initializing remote students:", error);
            loadCachedStudents(eventId, onUpdate, 'error');
          });
          return;
        }
        const students = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        }));
        // Cache locally for offline backup
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(students));
        onUpdate(students, snapshot.metadata.fromCache ? 'offline' : 'cloud');
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
    onUpdate(raw ? JSON.parse(raw) : [], mode);
  } catch (e) {
    onUpdate([], mode);
  }
}

const DATA_VERSION_KEY = 'mp_data_version_tag';
const CURRENT_DATA_VERSION = 'v3_251_students';

function fallbackToLocalStudents(eventId, onUpdate) {
  const loadLocal = () => {
    try {
      const currentVersion = localStorage.getItem(DATA_VERSION_KEY);
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENTS + eventId);

      if (!raw || currentVersion !== CURRENT_DATA_VERSION) {
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(INITIAL_STUDENTS));
        localStorage.setItem(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
        onUpdate(INITIAL_STUDENTS, 'local');
        return;
      }
      onUpdate(JSON.parse(raw), 'local');
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
export async function saveStudentsList(eventId, newStudents) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    for (const student of newStudents) {
      const studentRef = doc(db, 'events', eventId, 'students', student.id);
      await setDoc(studentRef, student, { merge: true });
    }
  }

  // Also write locally
  localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(newStudents));
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
