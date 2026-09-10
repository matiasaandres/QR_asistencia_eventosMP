import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { initFirebase } from './firebase.js';
import { deriveFamilyRecords } from './familyPolicy.js';

function serializeValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item)]));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador no permite verificar respaldos con SHA-256.');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function addBackupIntegrity(backup) {
  return {
    ...backup,
    integrity: {
      algorithm: 'SHA-256',
      value: await sha256(backup)
    }
  };
}

export async function verifyBackupIntegrity(backup) {
  if (backup?.integrity?.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/i.test(backup?.integrity?.value || '')) {
    throw new Error('El respaldo no contiene una verificación SHA-256 válida.');
  }
  const { integrity, ...content } = backup;
  const expected = await sha256(content);
  if (expected !== integrity.value.toLowerCase()) {
    throw new Error('La verificación SHA-256 falló: el respaldo fue modificado o está dañado.');
  }
  return true;
}

function documentData(snapshot) {
  return serializeValue({ ...snapshot.data(), id: snapshot.id });
}

export function createSchoolBackup({ organization, members = [], events = [], exportedAt = new Date().toISOString() }) {
  const normalizedEvents = events.map((event) => ({
    ...serializeValue(event),
    students: (event.students || []).map(serializeValue),
    families: (event.families || []).map(serializeValue),
    logs: (event.logs || []).map(serializeValue),
    familyHistory: (event.familyHistory || []).map(serializeValue)
  }));
  return {
    format: 'mundopalabra-school-backup',
    schemaVersion: 3,
    exportedAt,
    organization: serializeValue(organization),
    members: members.map(serializeValue),
    events: normalizedEvents,
    summary: {
      members: members.length,
      events: normalizedEvents.length,
      students: normalizedEvents.reduce((total, event) => total + event.students.length, 0),
      families: normalizedEvents.reduce((total, event) => total + event.families.length, 0),
      logs: normalizedEvents.reduce((total, event) => total + event.logs.length, 0),
      familyChanges: normalizedEvents.reduce((total, event) => total + event.familyHistory.length, 0)
    }
  };
}

export function schoolBackupFilename(organization, date = new Date()) {
  const safeName = String(organization?.name || organization?.id || 'escuela')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'escuela';
  return `respaldo-${safeName}-${date.toISOString().slice(0, 10)}.json`;
}

export async function fetchSchoolBackup(organizationId) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) throw new Error('Firebase no está conectado; no se puede generar un respaldo completo.');
  if (!organizationId) throw new Error('Selecciona una escuela válida.');

  const organizationRef = doc(db, 'organizations', organizationId);
  const [organizationSnapshot, membersSnapshot, eventsSnapshot] = await Promise.all([
    getDoc(organizationRef),
    getDocs(collection(organizationRef, 'members')),
    getDocs(collection(organizationRef, 'events'))
  ]);
  if (!organizationSnapshot.exists()) throw new Error('La escuela ya no existe en la base de datos.');

  const events = await Promise.all(eventsSnapshot.docs.map(async (eventSnapshot) => {
    const eventRef = eventSnapshot.ref;
    const [studentsSnapshot, familiesSnapshot, logsSnapshot, familyHistorySnapshot] = await Promise.all([
      getDocs(collection(eventRef, 'students')),
      getDocs(collection(eventRef, 'families')),
      getDocs(collection(eventRef, 'logs')),
      getDocs(collection(eventRef, 'familyHistory'))
    ]);
    return {
      ...documentData(eventSnapshot),
      students: studentsSnapshot.docs.map(documentData),
      families: familiesSnapshot.docs.map(documentData),
      logs: logsSnapshot.docs.map(documentData),
      familyHistory: familyHistorySnapshot.docs.map(documentData)
    };
  }));

  return addBackupIntegrity(createSchoolBackup({
    organization: documentData(organizationSnapshot),
    members: membersSnapshot.docs.map(documentData),
    events
  }));
}

export async function downloadSchoolBackup(organizationId) {
  const backup = await fetchSchoolBackup(organizationId);
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
const validDocumentId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 500 && !value.includes('/');

export function validateSchoolBackup(backup, organizationId) {
  if (!backup || backup.format !== 'mundopalabra-school-backup' || ![1, 2, 3].includes(backup.schemaVersion)) {
    throw new Error('El archivo no es un respaldo válido de MundoPalabra.');
  }
  if (backup.organization?.id !== organizationId) {
    throw new Error(`Este respaldo pertenece a otra escuela (${backup.organization?.name || backup.organization?.id || 'desconocida'}).`);
  }
  if (!Array.isArray(backup.events) || !Array.isArray(backup.members)) {
    throw new Error('El respaldo está incompleto o dañado.');
  }
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
  return backup;
}

async function commitOperations(db, operations) {
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.slice(start, start + BATCH_LIMIT).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

function restoredEventData(event) {
  const keys = ['id', 'name', 'institution', 'date', 'defaultCapacity', 'doors', 'status', 'startsAt', 'endsAt', 'archived', 'studentsInitialized', 'initializedAt', 'createdAt', 'updatedAt'];
  return { status: 'open', startsAt: '', endsAt: '', ...Object.fromEntries(keys.filter((key) => event[key] !== undefined).map((key) => [key, event[key]])) };
}

export async function restoreSchoolBackup(organizationId, rawBackup) {
  const backup = validateSchoolBackup(rawBackup, organizationId);
  await verifyBackupIntegrity(backup);
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) throw new Error('Firebase no está conectado; no se puede restaurar el respaldo.');
  const organizationRef = doc(db, 'organizations', organizationId);
  const currentEventsSnapshot = await getDocs(collection(organizationRef, 'events'));
  const restoredEventIds = new Set(backup.events.map((event) => event.id));

  for (const event of backup.events) {
    const eventRef = doc(organizationRef, 'events', event.id);
    await setDoc(eventRef, { ...restoredEventData(event), archived: false, studentsInitialized: true }, { merge: true });
    const [currentStudents, currentFamilies, currentLogs, currentFamilyHistory] = await Promise.all([
      getDocs(collection(eventRef, 'students')),
      getDocs(collection(eventRef, 'families')),
      getDocs(collection(eventRef, 'logs')),
      getDocs(collection(eventRef, 'familyHistory'))
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
    await commitOperations(db, currentFamilyHistory.docs.map((item) => (batch) => batch.delete(item.ref)));
    await commitOperations(db, (event.familyHistory || []).map((item) => (batch) => {
      const { id, ...data } = item;
      batch.set(doc(eventRef, 'familyHistory', id), data);
    }));
    if (event.archived === true) await setDoc(eventRef, { archived: true }, { merge: true });
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
    familyChanges: backup.events.reduce((total, event) => total + (event.familyHistory || []).length, 0)
  };
}
