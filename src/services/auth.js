import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile
} from 'firebase/auth';
import { arrayUnion, collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { initFirebase } from './firebase';
import { createOrganizationId, normalizeOrganization } from './organizationPolicy';
import { createEventId, normalizeEvent } from './eventPolicy';

let persistencePromise = null;

function requireFirebase() {
  const { app, db, isConfigured } = initFirebase();
  if (!isConfigured || !app || !db) {
    throw new Error('Firebase no está configurado para iniciar sesión.');
  }
  const auth = getAuth(app);
  if (!persistencePromise) persistencePromise = setPersistence(auth, browserLocalPersistence);
  return { auth, db, ready: persistencePromise };
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

async function migrateMundoPalabra(db, organizationId, user) {
  if (organizationId !== 'colegio-mundopalabra') return 0;
  const legacyEvents = await getDocs(collection(db, 'events'));
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
  }
  return legacyEvents.size;
}

export function subscribeToAuth(onChange) {
  const { auth, ready } = requireFirebase();
  let unsubscribe = () => {};
  ready
    .then(() => {
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          onChange(null);
          return;
        }
        try {
          const tokenResult = await user.getIdTokenResult();
          onChange({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            customClaims: tokenResult.claims,
            claims: tokenResult.claims
          });
        } catch {
          onChange(user);
        }
      });
    })
    .catch((error) => onChange(null, error));
  return () => unsubscribe();
}

export async function authenticate(email, password) {
  const { auth, ready } = requireFirebase();
  await ready;
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function authenticateWithGoogle() {
  const { auth, ready } = requireFirebase();
  await ready;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export async function requestPasswordReset(email) {
  const { auth, ready } = requireFirebase();
  await ready;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Ingresa el correo de tu cuenta.');
  await sendPasswordResetEmail(auth, normalizedEmail);
}

export async function registerOrganization({ schoolName, email, password }) {
  const { auth, db, ready } = requireFirebase();
  await ready;
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = credential.user;

  try {
    await updateProfile(user, { displayName: schoolName.trim() });
    const organizationId = createOrganizationId(schoolName);
    const now = new Date();
    const organization = normalizeOrganization({
      id: organizationId,
      slug: organizationId,
      name: schoolName,
      ownerUid: user.uid,
      memberUids: [user.uid],
      plan: 'pilot',
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    const eventId = createEventId('Evento inicial', now.toISOString().slice(0, 10), now.getTime());
    const initialEvent = normalizeEvent({
      id: eventId,
      name: 'Evento inicial',
      institution: organization.name,
      date: now.toISOString().slice(0, 10),
      defaultCapacity: 4,
      doors: ['Acceso Principal'],
      archived: false,
      studentsInitialized: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    const organizationRef = doc(db, 'organizations', organizationId);
    const batch = writeBatch(db);
    batch.set(organizationRef, organization);
    batch.set(doc(organizationRef, 'members', user.uid), {
      userId: user.uid,
      email: user.email,
      displayName: schoolName.trim(),
      role: 'admin',
      status: 'active',
      createdAt: now.toISOString()
    });
    await batch.commit();
    let migratedEvents = 0;
    try {
      migratedEvents = await migrateMundoPalabra(db, organizationId, user);
    } catch (migrationError) {
      console.warn('La organización fue creada, pero la migración automática quedó pendiente:', migrationError);
    }
    if (!migratedEvents) await setDoc(doc(organizationRef, 'events', eventId), initialEvent);
    return { user, organization };
  } catch (error) {
    try { await user.delete(); } catch (cleanupError) {
      console.warn('No fue posible revertir la cuenta incompleta:', cleanupError);
    }
    throw error;
  }
}

export async function joinOrganization({ invitationCode, email, password }) {
  const { auth, db, ready } = requireFirebase();
  await ready;
  const normalizedCode = invitationCode.trim().toUpperCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedCode) throw new Error('Ingresa el código de invitación.');

  let user;
  let createdAccount = false;
  try {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    user = credential.user;
    createdAccount = true;
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') throw error;
    const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    user = credential.user;
  }

  try {
    const invitationRef = doc(db, 'organizationInvitations', normalizedCode);
    const invitationSnapshot = await getDoc(invitationRef);
    if (!invitationSnapshot.exists()) throw new Error('La invitación no existe.');
    const invitation = invitationSnapshot.data();
    if (invitation.status !== 'active') throw new Error('La invitación ya fue utilizada.');
    if (String(invitation.email || '').toLowerCase() !== user.email.toLowerCase()) throw new Error('La invitación corresponde a otro correo.');
    if (invitation.expiresAt?.toMillis?.() <= Date.now()) throw new Error('La invitación está vencida.');

    const organizationRef = doc(db, 'organizations', invitation.organizationId);
    const batch = writeBatch(db);
    batch.update(organizationRef, {
      memberUids: arrayUnion(user.uid),
      updatedAt: new Date().toISOString()
    });
    batch.set(doc(organizationRef, 'members', user.uid), {
      userId: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      role: invitation.role,
      status: 'active',
      invitationCode: normalizedCode,
      createdAt: new Date().toISOString()
    });
    batch.update(invitationRef, {
      status: 'used',
      usedBy: user.uid,
      usedAt: new Date().toISOString()
    });
    await batch.commit();
    return user;
  } catch (error) {
    try {
      if (createdAccount) await deleteUser(user);
      else await firebaseSignOut(auth);
    } catch (cleanupError) {
      console.warn('No fue posible cerrar el intento de invitación incompleto:', cleanupError);
    }
    throw error;
  }
}

export async function clearAuthSession() {
  const { auth, ready } = requireFirebase();
  await ready;
  await firebaseSignOut(auth);
}
