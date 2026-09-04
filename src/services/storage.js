import { initFirebase } from './firebase';
import { INITIAL_STUDENTS, INITIAL_EVENT } from '../mock/sampleStudents';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction
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
    if (!raw) return INITIAL_EVENT;
    return JSON.parse(raw);
  } catch (e) {
    return INITIAL_EVENT;
  }
}

export function saveCurrentEvent(eventData) {
  localStorage.setItem(LOCAL_STORAGE_KEY_EVENT, JSON.stringify(eventData));
}

// Subscribe to Students list (real-time via Firestore OR LocalStorage)
export function subscribeToStudents(eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    // Firebase Firestore Realtime Listener
    const studentsCol = collection(db, 'events', eventId, 'students');
    const unsubscribe = onSnapshot(
      studentsCol,
      (snapshot) => {
        if (snapshot.empty) {
          // Initialize remote collection with initial data if empty
          initializeRemoteStudents(db, eventId);
          return;
        }
        const students = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        }));
        // Cache locally for offline backup
        localStorage.setItem(LOCAL_STORAGE_KEY_STUDENTS + eventId, JSON.stringify(students));
        onUpdate(students, 'cloud');
      },
      (error) => {
        console.warn("Firestore subscription error, falling back to local:", error);
        fallbackToLocalStudents(eventId, onUpdate);
      }
    );
    return unsubscribe;
  } else {
    // Local mode
    return fallbackToLocalStudents(eventId, onUpdate);
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
  try {
    for (const student of INITIAL_STUDENTS) {
      const studentRef = doc(db, 'events', eventId, 'students', student.id);
      await setDoc(studentRef, student);
    }
  } catch (err) {
    console.error("Error initializing remote students:", err);
  }
}

// Subscribe to Entry Logs (real-time)
export function subscribeToLogs(eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();

  if (isConfigured && db) {
    const logsCol = collection(db, 'events', eventId, 'logs');
    const q = query(logsCol, orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id
        }));
        localStorage.setItem(LOCAL_STORAGE_KEY_LOGS + eventId, JSON.stringify(logs));
        onUpdate(logs);
      },
      (err) => {
        console.warn("Firestore logs error, falling back to local:", err);
        fallbackToLocalLogs(eventId, onUpdate);
      }
    );
    return unsubscribe;
  } else {
    return fallbackToLocalLogs(eventId, onUpdate);
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
  doorName
}) {
  const { db, isConfigured } = initFirebase();
  const now = new Date();
  const timestampIso = now.toISOString();
  const formattedTime = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = now.toLocaleDateString('es-CL');

  if (isConfigured && db) {
    // Cloud Firestore Transaction to guarantee concurrency safety across phones
    const studentRef = doc(db, 'events', eventId, 'students', studentId);
    const logsCol = collection(db, 'events', eventId, 'logs');

    return await runTransaction(db, async (transaction) => {
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists()) {
        throw new Error("Estudiante no encontrado en la base de datos.");
      }

      const currentData = studentSnap.data();
      const currentEntered = Number(currentData.enteredCount) || 0;
      const maxCap = Number(currentData.maxCapacity) || 5;
      const remaining = maxCap - currentEntered;

      if (remaining <= 0) {
        throw new Error("El estudiante ya completó el cupo máximo de personas.");
      }

      if (count > remaining) {
        throw new Error(`Solo quedan ${remaining} cupo(s) disponible(s).`);
      }

      const newEntered = currentEntered + count;
      const newStatus = newEntered >= maxCap ? 'COMPLETO' : 'PARCIAL';

      transaction.update(studentRef, {
        enteredCount: newEntered,
        status: newStatus,
        lastEntryAt: timestampIso
      });

      const logData = {
        studentId: studentId,
        studentName: currentData.name,
        course: currentData.course,
        count: count,
        accumulated: newEntered,
        maxCapacity: maxCap,
        doorName: doorName || 'Acceso Principal',
        timestamp: timestampIso,
        formattedTime,
        formattedDate
      };

      await addDoc(logsCol, logData);

      return {
        student: { ...currentData, enteredCount: newEntered, status: newStatus },
        newEntered,
        remaining: maxCap - newEntered,
        count
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
    const currentEntered = Number(student.enteredCount) || 0;
    const maxCap = Number(student.maxCapacity) || 5;
    const remaining = maxCap - currentEntered;

    if (remaining <= 0) {
      throw new Error("El estudiante ya completó el cupo máximo.");
    }
    if (count > remaining) {
      throw new Error(`Solo quedan ${remaining} cupo(s) disponible(s).`);
    }

    const newEntered = currentEntered + count;
    const newStatus = newEntered >= maxCap ? 'COMPLETO' : 'PARCIAL';

    students[studentIndex] = {
      ...student,
      enteredCount: newEntered,
      status: newStatus,
      lastEntryAt: timestampIso
    };

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
      studentId: student.id,
      studentName: student.name,
      course: student.course,
      count: count,
      accumulated: newEntered,
      maxCapacity: maxCap,
      doorName: doorName || 'Acceso Principal',
      timestamp: timestampIso,
      formattedTime,
      formattedDate
    };

    logs.unshift(logEntry);
    localStorage.setItem(keyLogs, JSON.stringify(logs));

    if (localChannel) {
      localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
      localChannel.postMessage({ type: 'LOGS_UPDATED', eventId });
    }

    return {
      student: students[studentIndex],
      newEntered,
      remaining: maxCap - newEntered,
      count
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

// Reset data to initial state for testing
export async function resetEventData(eventId) {
  const { db, isConfigured } = initFirebase();

  localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENTS + eventId);
  localStorage.removeItem(LOCAL_STORAGE_KEY_LOGS + eventId);

  if (isConfigured && db) {
    await initializeRemoteStudents(db, eventId);
  }

  if (localChannel) {
    localChannel.postMessage({ type: 'STUDENTS_UPDATED', eventId });
    localChannel.postMessage({ type: 'LOGS_UPDATED', eventId });
  }
}
