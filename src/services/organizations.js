import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getSavedFirebaseConfig, initFirebase } from './firebase';
import { createOrganizationId, isPlatformAdmin, normalizeOrganization } from './organizationPolicy';
import { createEventId, normalizeEvent } from './eventPolicy';

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

async function copyDocuments(db, sourceDocuments, destinationCollection, transform = (data) => data) {
  for (let start = 0; start < sourceDocuments.length; start += 400) {
    const batch = writeBatch(db);
    sourceDocuments.slice(start, start + 400).forEach((source) => {
      batch.set(doc(destinationCollection, source.id), transform(source.data()));
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
