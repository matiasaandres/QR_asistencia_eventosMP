/**
 * Adaptador de autenticación y ciclo de incorporación de usuarios.
 * Coordina Firebase Auth con organizaciones, membresías, invitaciones y
 * migraciones de datos heredados.
 */

import {
  browserLocalPersistence,
  browserSessionPersistence,
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
import { arrayUnion, collection, doc, getDocs, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
import { initFirebase } from './firebase.js';
import { createOrganizationId, normalizeOrganization } from './organizationPolicy.js';
import { createEventId, normalizeEvent } from './eventPolicy.js';

let persistencePromise = null;

/**
 * Usa sesión de navegador por defecto para equipos compartidos. La persistencia
 * local solo se activa explícitamente con VITE_FIREBASE_PERSIST_SESSION=true.
 */
const authPersistence = import.meta.env?.VITE_FIREBASE_PERSIST_SESSION === 'true'
  ? browserLocalPersistence
  : browserSessionPersistence;

/** Obtiene los clientes de Firebase necesarios para autenticar usuarios.
 * @returns {{auth: object, db: object, ready: Promise}} Clientes y promesa de persistencia.
 * @throws {Error} Si Firebase no está configurado.
 */
function requireFirebase() {
  const { app, db, isConfigured } = initFirebase();
  if (!isConfigured || !app || !db) {
    throw new Error('Firebase no está configurado para iniciar sesión.');
  }
  const auth = getAuth(app);
  if (!persistencePromise) persistencePromise = setPersistence(auth, authPersistence);
  return { auth, db, ready: persistencePromise };
}

/** Copia documentos por lotes a otra colección.
 * @param {object} db Cliente de Firestore.
 * @param {Array<object>} sourceDocuments Documentos de origen.
 * @param {object} destinationCollection Colección de destino.
 * @param {Function} transform Transformación aplicada a cada documento.
 * @returns {Promise<void>} Promesa de finalización.
 */
async function copyDocuments(db, sourceDocuments, destinationCollection, transform = (data) => data) {
  for (let start = 0; start < sourceDocuments.length; start += 400) {
    const batch = writeBatch(db);
    sourceDocuments.slice(start, start + 400).forEach((source) => {
      batch.set(doc(destinationCollection, source.id), transform(source.data()));
    });
    await batch.commit();
  }
}

/** Migra los datos heredados de MundoPalabra a la organización actual.
 * @param {object} db Cliente de Firestore.
 * @param {string} organizationId Identificador de la organización.
 * @param {object} user Usuario autenticado.
 * @returns {Promise<number>} Cantidad de eventos migrados.
 */
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

/** Suscribe cambios del usuario autenticado y sus claims.
 * @param {Function} onChange Callback que recibe el usuario o un error.
 * @returns {Function} Función para cancelar la suscripción.
 */
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

/** Inicia sesión con correo y contraseña.
 * @param {string} email Correo de la cuenta.
 * @param {string} password Contraseña.
 * @returns {Promise<object>} Usuario autenticado.
 * @throws {Error} Si Firebase rechaza las credenciales.
 */
export async function authenticate(email, password) {
  const { auth, ready } = requireFirebase();
  await ready;
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

/** Inicia sesión mediante una cuenta de Google.
 * @returns {Promise<object>} Usuario autenticado.
 * @throws {Error} Si el proveedor rechaza la autenticación.
 */
export async function authenticateWithGoogle() {
  const { auth, ready } = requireFirebase();
  await ready;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

/** Envía un correo para restablecer la contraseña.
 * @param {string} email Correo de la cuenta.
 * @returns {Promise<void>} Promesa de envío.
 * @throws {Error} Si el correo es inválido o Firebase rechaza la solicitud.
 */
export async function requestPasswordReset(email) {
  const { auth, ready } = requireFirebase();
  await ready;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Ingresa el correo de tu cuenta.');
  await sendPasswordResetEmail(auth, normalizedEmail);
}

/** Registra una organización y su administrador inicial.
 * @param {{schoolName: string, email: string, password: string}} input Datos de registro.
 * @returns {Promise<{user: object, organization: object}>} Cuenta y organización creadas.
 * @throws {Error} Si falla la creación o persistencia de la organización.
 */
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

/** Crea una cuenta o incorpora una existente mediante una invitación.
 * @param {{invitationCode: string, email: string, password: string}} input Datos de invitación.
 * @returns {Promise<object>} Usuario incorporado.
 * @throws {Error} Si la invitación no es válida o la operación falla.
 */
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
    await runTransaction(db, async (transaction) => {
      const invitationSnapshot = await transaction.get(invitationRef);
      if (!invitationSnapshot.exists()) throw new Error('La invitación no existe.');
      const invitation = invitationSnapshot.data();
      if (invitation.status !== 'active') throw new Error('La invitación ya fue utilizada.');
      if (String(invitation.email || '').toLowerCase() !== user.email.toLowerCase()) throw new Error('La invitación corresponde a otro correo.');
      if (invitation.expiresAt?.toMillis?.() <= Date.now()) throw new Error('La invitación está vencida.');

      const organizationRef = doc(db, 'organizations', invitation.organizationId);
      const now = new Date().toISOString();
      transaction.update(organizationRef, {
        memberUids: arrayUnion(user.uid),
        updatedAt: now
      });
      transaction.set(doc(organizationRef, 'members', user.uid), {
        userId: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        role: invitation.role,
        status: 'active',
        invitationCode: normalizedCode,
        createdAt: now
      });
      transaction.update(invitationRef, {
        status: 'used',
        usedBy: user.uid,
        usedAt: now
      });
    });
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

/** Cierra la sesión de Firebase y limpia la sesión activa.
 * @returns {Promise<void>} Promesa de cierre de sesión.
 * @throws {Error} Si Firebase no puede cerrar la sesión.
 */
export async function clearAuthSession() {
  const { auth, ready } = requireFirebase();
  await ready;
  await firebaseSignOut(auth);
}
