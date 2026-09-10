import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteField, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getSavedFirebaseConfig, initFirebase } from './firebase';
import { createOrganizationId, isPlatformAdmin, normalizeOrganization } from './organizationPolicy';
import { createEventId, normalizeEvent } from './eventPolicy';
import { INITIAL_STUDENTS } from '../mock/sampleStudents';

const CURRENT_ORGANIZATION_KEY = 'access_current_organization_';

export function subscribeToOrganizations(userId, onUpdate, onError) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db || !userId) {
    onUpdate([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, 'organizations'), where('memberUids', 'array-contains', userId)),
    (snapshot) => onUpdate(snapshot.docs.map((item) => normalizeOrganization({
      ...item.data(), id: item.id
    })).filter((organization) => organization.status === 'active')),
    (error) => onError?.(error)
  );
}

export function subscribeToMembership(organizationId, userId, onUpdate, onError) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db || !organizationId || !userId) {
    onUpdate(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'organizations', organizationId, 'members', userId),
    (snapshot) => onUpdate(snapshot.exists() ? snapshot.data() : null),
    (error) => onError?.(error)
  );
}

export function getSavedOrganizationId(userId) {
  return localStorage.getItem(CURRENT_ORGANIZATION_KEY + userId) || '';
}

export function saveOrganizationId(userId, organizationId) {
  localStorage.setItem(CURRENT_ORGANIZATION_KEY + userId, organizationId);
}

export function subscribeToAllOrganizations(onUpdate, onError) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db) {
    onUpdate([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'organizations'),
    (snapshot) => onUpdate(snapshot.docs.map((item) => normalizeOrganization({
      ...item.data(), id: item.id
    })).sort((a, b) => a.name.localeCompare(b.name, 'es'))),
    (error) => onError?.(error)
  );
}

export async function createSchoolWithAdministrator({ schoolName, adminEmail, temporaryPassword, plan, masterUser }) {
  const { db } = initFirebase();
  if (!db || !isPlatformAdmin(masterUser)) throw new Error('Solo la cuenta maestra puede crear escuelas.');

  const cleanName = schoolName.trim();
  const cleanEmail = adminEmail.trim().toLowerCase();
  const organizationId = createOrganizationId(cleanName);
  const organizationRef = doc(db, 'organizations', organizationId);
  if ((await getDoc(organizationRef)).exists()) {
    throw new Error('Ya existe una escuela con ese nombre. Usa un nombre más específico.');
  }

  const secondaryApp = initializeApp(getSavedFirebaseConfig(), `school-provision-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let schoolUser = null;

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, temporaryPassword);
    schoolUser = credential.user;
    const now = new Date();
    const nowIso = now.toISOString();
    const organization = normalizeOrganization({
      id: organizationId,
      slug: organizationId,
      name: cleanName,
      contactEmail: cleanEmail,
      ownerUid: schoolUser.uid,
      memberUids: [schoolUser.uid],
      plan: plan || 'pilot',
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso
    });
    const eventId = createEventId('Evento inicial', nowIso.slice(0, 10), now.getTime());
    const initialEvent = normalizeEvent({
      id: eventId,
      name: 'Evento inicial',
      institution: cleanName,
      date: nowIso.slice(0, 10),
      defaultCapacity: 5,
      doors: ['Acceso Principal'],
      archived: false,
      studentsInitialized: true,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    const batch = writeBatch(db);
    batch.set(organizationRef, organization);
    batch.set(doc(organizationRef, 'members', schoolUser.uid), {
      userId: schoolUser.uid,
      email: cleanEmail,
      displayName: cleanName,
      role: 'admin',
      status: 'active',
      createdAt: nowIso
    });
    await batch.commit();
    await setDoc(doc(organizationRef, 'events', eventId), initialEvent);
    return organization;
  } catch (error) {
    if (schoolUser) {
      try { await deleteUser(schoolUser); } catch (cleanupError) {
        console.warn('No fue posible eliminar la cuenta escolar incompleta:', cleanupError);
      }
    }
    throw error;
  } finally {
    try { await signOut(secondaryAuth); } catch (error) { /* La sesión secundaria puede no haberse creado. */ }
    await deleteApp(secondaryApp);
  }
}

export async function updateOrganizationStatus(organizationId, status) {
  const { db } = initFirebase();
  if (!['active', 'suspended'].includes(status)) throw new Error('Estado de escuela no válido.');
  await updateDoc(doc(db, 'organizations', organizationId), {
    status,
    updatedAt: new Date().toISOString()
  });
}

export async function assignSchoolAdministrator({ organizationId, adminEmail, password, masterUser }) {
  const { db } = initFirebase();
  if (!db || !isPlatformAdmin(masterUser)) throw new Error('Solo la cuenta maestra puede asignar cuentas escolares.');
  const organizationRef = doc(db, 'organizations', organizationId);
  const organizationSnapshot = await getDoc(organizationRef);
  if (!organizationSnapshot.exists()) throw new Error('La escuela no existe.');
  const cleanEmail = adminEmail.trim().toLowerCase();
  const secondaryApp = initializeApp(getSavedFirebaseConfig(), `school-account-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let schoolUser = null;
  let createdUser = false;
  try {
    try {
      schoolUser = (await signInWithEmailAndPassword(secondaryAuth, cleanEmail, password)).user;
    } catch (signInError) {
      try {
        schoolUser = (await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password)).user;
        createdUser = true;
      } catch (creationError) {
        if (creationError?.code?.includes('email-already-in-use')) {
          throw new Error('Ese correo ya existe en Firebase, pero la contraseña indicada no coincide.');
        }
        throw creationError;
      }
    }
    const current = organizationSnapshot.data();
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(organizationRef, {
      ownerUid: schoolUser.uid,
      memberUids: [...new Set([...(current.memberUids || []), schoolUser.uid])],
      contactEmail: cleanEmail,
      updatedAt: now
    });
    batch.set(doc(organizationRef, 'members', schoolUser.uid), {
      userId: schoolUser.uid,
      email: cleanEmail,
      displayName: current.name || cleanEmail.split('@')[0],
      role: 'admin',
      status: 'active',
      createdAt: now
    }, { merge: true });
    await batch.commit();
    return { organizationId, email: cleanEmail };
  } catch (error) {
    if (createdUser && schoolUser) {
      try { await deleteUser(schoolUser); } catch (cleanupError) {
        console.warn('No fue posible eliminar la cuenta escolar incompleta:', cleanupError);
      }
    }
    throw error;
  } finally {
    try { await signOut(secondaryAuth); } catch (error) { /* La sesión secundaria puede no existir. */ }
    await deleteApp(secondaryApp);
  }
}

async function copyDocuments(db, sourceDocuments, destinationCollection, transform = (data) => data) {
  for (let start = 0; start < sourceDocuments.length; start += 400) {
    const batch = writeBatch(db);
    sourceDocuments.slice(start, start + 400).forEach((source) => {
      batch.set(doc(destinationCollection, source.id), transform(source.data()));
    });
    await batch.commit();
  }
}

async function deleteDocuments(db, sourceDocuments) {
  for (let start = 0; start < sourceDocuments.length; start += 400) {
    const batch = writeBatch(db);
    sourceDocuments.slice(start, start + 400).forEach((source) => batch.delete(source.ref));
    await batch.commit();
  }
}

async function replaceStudentAttendanceSnapshot(db, eventRef, students) {
  const destination = collection(eventRef, 'students');
  const existingSnapshot = await getDocs(destination);
  const existingById = new Map(existingSnapshot.docs.map((item) => [item.id, item]));

  for (let start = 0; start < students.length; start += 400) {
    const batch = writeBatch(db);
    students.slice(start, start + 400).forEach((student) => {
      const existing = existingById.get(student.id);
      if (existing) batch.update(existing.ref, { maxCapacity: student.maxCapacity });
      else batch.set(doc(destination, student.id), student);
    });
    await batch.commit();
  }

  const existingStudents = students.filter((student) => existingById.has(student.id));
  for (let start = 0; start < existingStudents.length; start += 400) {
    const batch = writeBatch(db);
    existingStudents.slice(start, start + 400).forEach((student) => {
      batch.update(existingById.get(student.id).ref, {
        enteredCount: student.enteredCount,
        status: student.status,
        lastEntryAt: student.lastEntryAt || deleteField(),
        extraGuest: student.extraGuest || deleteField()
      });
    });
    await batch.commit();
  }
}

export async function migrateLegacyMundoPalabra({ organizationId, user }) {
  if (organizationId !== 'colegio-mundopalabra') {
    throw new Error('La recuperación anterior solo corresponde a Colegio MundoPalabra.');
  }
  const { db } = initFirebase();
  if (!db || !user?.uid) throw new Error('No hay una sesión válida para recuperar los datos.');

  const legacyEvents = await getDocs(collection(db, 'events'));
  if (legacyEvents.empty) throw new Error('No se encontraron eventos en la base anterior.');

  let studentsCopied = 0;
  let logsCopied = 0;
  for (const legacyEvent of legacyEvents.docs) {
    const destinationEvent = doc(db, 'organizations', organizationId, 'events', legacyEvent.id);
    await setDoc(destinationEvent, normalizeEvent({
      ...legacyEvent.data(),
      id: legacyEvent.id,
      archived: legacyEvent.data().archived === true,
      studentsInitialized: true
    }));
    const [students, logs] = await Promise.all([
      getDocs(collection(legacyEvent.ref, 'students')),
      getDocs(collection(legacyEvent.ref, 'logs'))
    ]);
    await copyDocuments(db, students.docs, collection(destinationEvent, 'students'));
    await copyDocuments(db, logs.docs, collection(destinationEvent, 'logs'), (log) => ({
      ...log,
      operatorUid: log.operatorUid || user.uid,
      operatorEmail: log.operatorEmail || user.email
    }));
    studentsCopied += students.size;
    logsCopied += logs.size;
  }
  return { events: legacyEvents.size, students: studentsCopied, logs: logsCopied };
}

function parseLegacyDateTime(dateValue, timeValue, fallbackIndex) {
  const dateMatch = String(dateValue || '').match(/(\d{1,2})[-/]([0-1]?\d)[-/](\d{4})/);
  const timeText = String(timeValue || '').toLowerCase().replaceAll('.', '').replace(/\s+/g, ' ').trim();
  const timeMatch = timeText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\s*m?/);
  if (!dateMatch || !timeMatch) return new Date(Date.UTC(2026, 8, 8, 12, 0, fallbackIndex % 60)).toISOString();
  let hour = Number(timeMatch[1]);
  if (timeMatch[4] === 'p' && hour < 12) hour += 12;
  if (timeMatch[4] === 'a' && hour === 12) hour = 0;
  const localDate = new Date(
    Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]),
    hour, Number(timeMatch[2]), Number(timeMatch[3] || 0), fallbackIndex
  );
  return localDate.toISOString();
}

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export async function importMundoPalabraReport({ organizationId, user, studentRows, logRows }) {
  if (organizationId !== 'colegio-mundopalabra' || !isPlatformAdmin(user)) {
    throw new Error('Solo la cuenta maestra puede importar el respaldo de Mundo Palabra.');
  }
  if (!studentRows?.length || !logRows?.length) throw new Error('El respaldo no contiene alumnos o ingresos.');
  const { db } = initFirebase();
  const eventId = 'acto-cultural-institucional-2026-20260908-recuperado';
  const knownStudents = new Map(INITIAL_STUDENTS.map((student) => [student.id, student]));
  const normalizedLogs = logRows.map((row, index) => {
    const timestamp = parseLegacyDateTime(row.Fecha, row.Hora, index);
    return {
      id: `legacy-${String(index + 1).padStart(4, '0')}`,
      studentId: String(row['Código'] || '').trim(),
      studentName: String(row.Estudiante || '').trim(),
      course: String(row.Curso || '').trim(),
      count: numberValue(row['Personas en este Ingreso']),
      accumulated: numberValue(row['Total Acumulado']),
      maxCapacity: 5,
      doorName: String(row['Punto / Puerta'] || 'Acceso Principal').trim(),
      timestamp,
      formattedDate: String(row.Fecha || '').trim(),
      formattedTime: String(row.Hora || '').trim(),
      operatorUid: user.uid,
      operatorEmail: user.email,
      isExtra: String(row['Cupo Extraordinario'] || '').toLowerCase() === 'sí',
      ...(row['Nombre Persona Extra'] ? { guestName: String(row['Nombre Persona Extra']).trim() } : {}),
      ...(row.Parentesco ? { relationship: String(row.Parentesco).trim() } : {})
    };
  }).filter((log) => log.studentId && log.count >= 1 && log.count <= 5);
  const lastLogByStudent = new Map();
  normalizedLogs.forEach((log) => {
    const previous = lastLogByStudent.get(log.studentId);
    if (!previous || log.timestamp > previous.timestamp) lastLogByStudent.set(log.studentId, log);
  });
  const students = studentRows.map((row) => {
    const id = String(row['Código'] || '').trim();
    const known = knownStudents.get(id) || {};
    const maxCapacity = Math.max(0, numberValue(row['Capacidad Autorizada'], 5));
    const enteredCount = Math.max(0, numberValue(row['Personas Ingresadas']));
    const lastLog = lastLogByStudent.get(id);
    return {
      ...known,
      id,
      name: String(row.Estudiante || known.name || '').trim(),
      course: String(row.Curso || known.course || '').trim(),
      maxCapacity,
      enteredCount,
      status: String(row['Estado Acceso'] || (enteredCount ? 'PARCIAL' : 'PENDIENTE')).trim(),
      ...(lastLog ? { lastEntryAt: lastLog.timestamp } : {}),
      ...(String(row['Cupo Extraordinario'] || '').toLowerCase() === 'sí' ? {
        extraGuest: {
          name: String(row['Nombre Persona Extra'] || 'Persona extraordinaria').trim(),
          relationship: String(row['Parentesco Persona Extra'] || 'Apoderado/a').trim(),
          addedAt: lastLog?.timestamp || new Date().toISOString(),
          doorName: lastLog?.doorName || 'Acceso Principal'
        }
      } : {})
    };
  }).filter((student) => student.id && student.name);

  const now = new Date().toISOString();
  const doors = [...new Set(['Acceso Principal', 'Puerta 1', 'Puerta 2', ...normalizedLogs.map((log) => log.doorName)])];
  const eventRef = doc(db, 'organizations', organizationId, 'events', eventId);
  await setDoc(eventRef, normalizeEvent({
    id: eventId,
    name: 'Acto Cultural Institucional 2026',
    institution: 'Colegio MundoPalabra',
    date: '2026-09-08',
    defaultCapacity: 5,
    doors,
    archived: false,
    studentsInitialized: true,
    createdAt: now,
    updatedAt: now
  }));
  const previousLogs = await getDocs(collection(eventRef, 'logs'));
  await deleteDocuments(db, previousLogs.docs);
  await replaceStudentAttendanceSnapshot(db, eventRef, students);
  await copyDocuments(db, normalizedLogs.map((log) => ({ id: log.id, data: () => { const { id, ...data } = log; return data; } })), collection(eventRef, 'logs'));
  return {
    eventId,
    students: students.length,
    logs: normalizedLogs.length,
    people: normalizedLogs.reduce((total, log) => total + log.count, 0),
    replacedLogs: previousLogs.size
  };
}

export function subscribeToMembers(organizationId, onUpdate, onError) {
  const { db } = initFirebase();
  return onSnapshot(
    collection(db, 'organizations', organizationId, 'members'),
    (snapshot) => onUpdate(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))),
    (error) => onError?.(error)
  );
}

function createInvitationCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(36).padStart(2, '0')).join('').toUpperCase();
}

export async function createInvitation({ organization, email, role }) {
  const { db } = initFirebase();
  const code = createInvitationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await setDoc(doc(db, 'organizationInvitations', code), {
    code,
    organizationId: organization.id,
    organizationName: organization.name,
    email: email.trim().toLowerCase(),
    role,
    status: 'active',
    createdAt: now.toISOString(),
    expiresAt: Timestamp.fromDate(expiresAt)
  });
  return { code, expiresAt: expiresAt.toISOString() };
}
