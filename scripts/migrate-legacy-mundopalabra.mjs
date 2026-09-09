import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, writeBatch } from 'firebase/firestore';
import { normalizeEvent } from '../src/services/eventPolicy.js';

const email = process.env.MIGRATION_EMAIL;
const password = process.env.MIGRATION_PASSWORD;
const organizationId = process.env.MIGRATION_ORGANIZATION_ID || 'colegio-mundopalabra';

if (!email || !password) {
  throw new Error('Define MIGRATION_EMAIL y MIGRATION_PASSWORD solo para ejecutar esta migración.');
}

const app = initializeApp({
  apiKey: 'AIzaSyCy3DmCUQWgtR4hR-q4DlH9kzZBRf6OUmU',
  authDomain: 'mundopalabra-acceso.firebaseapp.com',
  projectId: 'mundopalabra-acceso',
  appId: '1:609103289658:web:e213924bdd24ac4a72c403'
});
const auth = getAuth(app);
const db = getFirestore(app);
const credential = await signInWithEmailAndPassword(auth, email, password);

async function commitDocuments(documents, destinationCollection, transform = (data) => data) {
  for (let start = 0; start < documents.length; start += 400) {
    const batch = writeBatch(db);
    documents.slice(start, start + 400).forEach((source) => {
      batch.set(doc(destinationCollection, source.id), transform(source.data()));
    });
    await batch.commit();
  }
}

const legacyEvents = await getDocs(collection(db, 'events'));
if (legacyEvents.empty) throw new Error('No se encontraron eventos en la estructura anterior.');

let studentsCopied = 0;
let logsCopied = 0;
for (const legacyEvent of legacyEvents.docs) {
  const destinationEvent = doc(db, 'organizations', organizationId, 'events', legacyEvent.id);
  const eventBatch = writeBatch(db);
  eventBatch.set(destinationEvent, normalizeEvent({
    ...legacyEvent.data(),
    id: legacyEvent.id,
    archived: legacyEvent.data().archived === true,
    studentsInitialized: true
  }));
  await eventBatch.commit();

  const [students, logs] = await Promise.all([
    getDocs(collection(legacyEvent.ref, 'students')),
    getDocs(collection(legacyEvent.ref, 'logs'))
  ]);
  await commitDocuments(students.docs, collection(destinationEvent, 'students'));
  await commitDocuments(logs.docs, collection(destinationEvent, 'logs'), (log) => ({
    ...log,
    operatorUid: log.operatorUid || credential.user.uid,
    operatorEmail: log.operatorEmail || credential.user.email
  }));
  studentsCopied += students.size;
  logsCopied += logs.size;
  console.log(`Migrado ${legacyEvent.id}: ${students.size} estudiantes, ${logs.size} registros.`);
}

console.log(`Migración terminada: ${legacyEvents.size} eventos, ${studentsCopied} estudiantes y ${logsCopied} registros.`);
await auth.signOut();
