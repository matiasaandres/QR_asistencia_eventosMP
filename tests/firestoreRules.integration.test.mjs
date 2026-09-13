import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, runTransaction, setDoc, Timestamp } from 'firebase/firestore';

const projectId = 'demo-mundopalabra-rules';
const organizationId = 'escuela-prueba';
const eventId = 'evento-prueba';
const studentId = 'MP-TEST-001';
const familyStudentId = 'MP-TEST-002';
const familyId = 'FAM-001';
let environment;
const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const rulesTest = (name, fn) => test(name, { skip: emulatorAvailable ? false : 'Requiere el emulador de Firestore' }, fn);

const eventPath = `organizations/${organizationId}/events/${eventId}`;
const studentPath = `${eventPath}/students/${studentId}`;

before(async () => {
  if (!emulatorAvailable) return;
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080)
    }
  });
});

after(async () => environment?.cleanup());

beforeEach(async () => {
  if (!emulatorAvailable) return;
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `organizations/${organizationId}`), {
      id: organizationId,
      slug: organizationId,
      name: 'Escuela de prueba',
      ownerUid: 'admin-user',
      memberUids: ['admin-user', 'operator-user'],
      plan: 'pilot',
      status: 'active',
      logoUrl: '',
      primaryColor: '#0284c7',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await setDoc(doc(db, `organizations/${organizationId}/members/admin-user`), {
      userId: 'admin-user', email: 'admin@example.com', displayName: 'Admin', role: 'admin', status: 'active', createdAt: new Date().toISOString()
    });
    await setDoc(doc(db, `organizations/${organizationId}/members/operator-user`), {
      userId: 'operator-user', email: 'operator@example.com', displayName: 'Operador', role: 'operator', status: 'active', createdAt: new Date().toISOString()
    });
    await setDoc(doc(db, eventPath), {
      id: eventId,
      name: 'Evento de prueba',
      institution: 'Escuela de prueba',
      date: '2026-09-11',
      defaultCapacity: 4,
      doors: ['Acceso Principal'],
      status: 'open',
      startsAt: '',
      endsAt: '',
      startsAtTimestamp: null,
      endsAtTimestamp: null,
      archived: false,
      studentsInitialized: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await setDoc(doc(db, studentPath), {
      studentId,
      maxCapacity: 4,
      enteredCount: 0,
      insideCount: 0,
      status: 'PENDIENTE'
    });
    await setDoc(doc(db, `${eventPath}/students/${familyStudentId}`), {
      studentId: familyStudentId,
      familyId,
      maxCapacity: 4,
      enteredCount: 0,
      insideCount: 0,
      status: 'PENDIENTE'
    });
    await setDoc(doc(db, `${eventPath}/families/${familyId}`), {
      id: familyId,
      maxCapacity: 4,
      enteredCount: 0,
      insideCount: 0,
      status: 'PENDIENTE',
      members: [familyStudentId],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await setDoc(doc(db, `organizations/${organizationId}/studentDirectory/${studentId}`), {
      id: studentId, rut: '11.111.111-1', name: 'Estudiante de prueba', course: '1° A', updatedAt: new Date().toISOString()
    });
    await setDoc(doc(db, `organizations/${organizationId}/studentDirectory/${familyStudentId}`), {
      id: familyStudentId, rut: '22.222.222-2', name: 'Hermana de prueba', course: '1° A', updatedAt: new Date().toISOString()
    });
  });
});

function operatorDb() {
  return environment.authenticatedContext('operator-user', { email: 'operator@example.com' }).firestore();
}

function adminDb() {
  return environment.authenticatedContext('admin-user', { email: 'admin@example.com' }).firestore();
}

function logData(overrides = {}) {
  return {
    studentId,
    studentName: 'Estudiante de prueba',
    course: '1° A',
    count: 1,
    movementType: 'ENTRY',
    newAdmissions: 1,
    reentries: 0,
    accumulated: 1,
    insideAfter: 1,
    maxCapacity: 4,
    doorName: 'Acceso Principal',
    timestamp: new Date().toISOString(),
    formattedTime: '12:00:00',
    formattedDate: '11-09-2026',
    operatorUid: 'operator-user',
    operatorEmail: 'operator@example.com',
    isExtra: false,
    ...overrides
  };
}

async function writeMovement(db, logId = 'log-valid', overrides = {}) {
  const log = logData(overrides);
  return runTransaction(db, async (transaction) => {
    transaction.update(doc(db, studentPath), {
      enteredCount: log.accumulated,
      insideCount: log.insideAfter,
      status: 'PARCIAL',
      lastEntryAt: log.timestamp,
      lastMovementAt: log.timestamp,
      lastLogId: logId
    });
    transaction.set(doc(db, `${eventPath}/logs/${logId}`), log);
  });
}

async function writeFamilyMovement(db, logId = 'log-familia') {
  const log = logData({ studentId: familyStudentId, studentName: 'Hermana de prueba', familyId });
  return runTransaction(db, async (transaction) => {
    transaction.update(doc(db, `${eventPath}/families/${familyId}`), {
      enteredCount: 1,
      insideCount: 1,
      status: 'PARCIAL',
      lastEntryAt: log.timestamp,
      lastMovementAt: log.timestamp,
      lastLogId: logId
    });
    transaction.set(doc(db, `${eventPath}/logs/${logId}`), log);
  });
}

rulesTest('acepta solamente un movimiento atómico enlazado al cambio de cupo', async () => {
  const db = operatorDb();
  await assertSucceeds(writeMovement(db));
  const student = await assertSucceeds(getDoc(doc(db, studentPath)));
  assert.equal(student.data().enteredCount, 1);
  assert.equal(student.data().lastLogId, 'log-valid');
});

rulesTest('acepta un movimiento familiar solo si actualiza el cupo compartido', async () => {
  const db = operatorDb();
  await assertSucceeds(writeFamilyMovement(db));
  const family = await assertSucceeds(getDoc(doc(db, `${eventPath}/families/${familyId}`)));
  assert.equal(family.data().enteredCount, 1);
  assert.equal(family.data().lastLogId, 'log-familia');
});

rulesTest('rechaza bitácoras sueltas, saltos de contador y agregados escritos por operadores', async () => {
  const db = operatorDb();
  await assertFails(setDoc(doc(db, `${eventPath}/logs/log-suelto`), logData()));
  await assertFails(writeMovement(db, 'log-forjado', { count: 1, newAdmissions: 1, accumulated: 4, insideAfter: 4 }));
  await assertFails(setDoc(doc(db, `${eventPath}/analytics/door-forjado`), {
    kind: 'door', key: 'Acceso Principal', label: 'Acceso Principal', people: 999,
    entries: 999, exits: 0, reentries: 0, movements: 999, records: 999, updatedAt: new Date().toISOString()
  }));
});

rulesTest('aplica el horario con el tiempo del servidor', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), eventPath), {
      startsAt: new Date(Date.now() + 60_000).toISOString(),
      startsAtTimestamp: Timestamp.fromMillis(Date.now() + 60_000)
    }, { merge: true });
  });
  await assertFails(writeMovement(operatorDb(), 'log-fuera-horario'));
});

rulesTest('mantiene aisladas las escuelas', async () => {
  const stranger = environment.authenticatedContext('stranger', { email: 'stranger@example.com' }).firestore();
  await assertFails(getDoc(doc(stranger, studentPath)));
});

rulesTest('protege la nómina maestra y permite que los miembros la consulten', async () => {
  const path = `organizations/${organizationId}/studentDirectory/${studentId}`;
  await assertSucceeds(getDoc(doc(operatorDb(), path)));
  await assertFails(setDoc(doc(operatorDb(), path), {
    id: studentId, rut: '11.111.111-1', name: 'Nombre alterado', course: '1° A', updatedAt: new Date().toISOString()
  }));
  await assertSucceeds(setDoc(doc(adminDb(), path), {
    id: studentId, rut: '11.111.111-1', name: 'Nombre actualizado', course: '1° A', updatedAt: new Date().toISOString()
  }));
});
