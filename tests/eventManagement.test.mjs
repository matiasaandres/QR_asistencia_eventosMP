import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createEventId,
  normalizeEvent,
  prepareStudentsForEvent
} from '../src/services/eventPolicy.js';

test('genera identificadores de evento legibles y únicos', () => {
  const first = createEventId('Gala Aniversario', '2026-11-05', 1000);
  const second = createEventId('Gala Aniversario', '2026-11-05', 1001);
  assert.match(first, /^gala-aniversario-20261105-/);
  assert.notEqual(first, second);
});

test('normaliza la configuración necesaria para administrar un evento', () => {
  const event = normalizeEvent({
    id: 'evento-1',
    name: 'Evento 1',
    date: '2026-11-05',
    defaultCapacity: 4,
    doors: ['Acceso Norte']
  }, { institution: 'Colegio MundoPalabra' });
  assert.equal(event.id, 'evento-1');
  assert.equal(event.defaultCapacity, 4);
  assert.equal(event.archived, false);
  assert.ok(event.doors.includes('Acceso Norte'));
  assert.ok(event.doors.includes('Puerta 1'));
  assert.ok(event.doors.includes('Puerta 2'));
});

test('copiar nómina reinicia asistencia sin perder identidad, curso ni cupos', () => {
  const roster = prepareStudentsForEvent([{
    id: 'MP-1',
    name: 'Ana Pérez',
    course: '1° A',
    maxCapacity: 4,
    enteredCount: 5,
    status: 'CUPO_EXTRA',
    lastEntryAt: '2026-09-09T12:00:00.000Z',
    extraGuest: { name: 'Invitado' }
  }]);
  assert.deepEqual(roster, [{
    id: 'MP-1',
    name: 'Ana Pérez',
    course: '1° A',
    maxCapacity: 4,
    enteredCount: 0,
    status: 'PENDIENTE'
  }]);
});

test('la interfaz permite crear, seleccionar y archivar eventos', async () => {
  const [app, navbar, manager, storage] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/EventsManager.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/storage.js', import.meta.url), 'utf8')
  ]);
  assert.match(app, /subscribeToEvents/);
  assert.match(navbar, /aria-label="Evento actual"/);
  assert.match(manager, /Crear un evento nuevo/);
  assert.match(manager, /Copiar la nómina actual/);
  assert.match(manager, /Archivar/);
  assert.match(storage, /export async function createEvent/);
  assert.match(storage, /eventId === INITIAL_EVENT\.id \? INITIAL_STUDENTS : \[\]/);
});
