import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsMutationsForLog,
  buildAnalyticsDocuments,
  LOG_PAGE_SIZE,
  summarizeAnalytics
} from '../src/services/logAnalytics.js';

const logs = [
  { id: 'a', timestamp: '2026-09-11T12:05:00.000Z', doorName: 'Puerta 1', count: 3 },
  { id: 'b', timestamp: '2026-09-11T12:25:00.000Z', doorName: 'Puerta 2', count: 1 },
  { id: 'c', timestamp: '2026-09-11T13:05:00.000Z', doorName: 'Puerta 1', count: 2 }
];

test('pagina la bitácora en bloques acotados', () => {
  assert.equal(LOG_PAGE_SIZE, 50);
});

test('cada movimiento actualiza puerta y hora sin depender del historial completo', () => {
  const mutations = analyticsMutationsForLog(logs[0], logs[0].id);
  assert.equal(mutations.length, 2);
  assert.deepEqual(mutations.map((item) => item.kind).sort(), ['door', 'hour']);
  assert.ok(mutations.every((item) => item.people === 3 && item.records === 1));
});

test('consolida shards horarios y puertas en estadísticas globales', () => {
  const summary = summarizeAnalytics([
    ...buildAnalyticsDocuments(logs),
    { id: 'meta', version: 1 }
  ]);
  assert.equal(summary.ready, true);
  assert.equal(summary.totalRecords, 3);
  assert.deepEqual(summary.doorsList.map(({ name, people }) => ({ name, people })), [
    { name: 'Puerta 1', people: 5 },
    { name: 'Puerta 2', people: 1 }
  ]);
  assert.equal(summary.activityByHour.length, 2);
  assert.deepEqual(summary.activityByHour.map((hour) => hour.people), [4, 2]);
});

test('separa admisiones nuevas, reingresos y salidas', () => {
  const summary = summarizeAnalytics(buildAnalyticsDocuments([
    { id: 'entry', timestamp: '2026-09-11T12:00:00Z', doorName: 'Puerta 1', count: 3, movementType: 'ENTRY', newAdmissions: 3, reentries: 0 },
    { id: 'exit', timestamp: '2026-09-11T12:10:00Z', doorName: 'Puerta 1', count: 2, movementType: 'EXIT', newAdmissions: 0, reentries: 0 },
    { id: 'return', timestamp: '2026-09-11T12:20:00Z', doorName: 'Puerta 1', count: 2, movementType: 'REENTRY', newAdmissions: 0, reentries: 2 }
  ]));
  assert.equal(summary.totalEntries, 3);
  assert.equal(summary.totalExits, 2);
  assert.equal(summary.totalReentries, 2);
  assert.equal(summary.totalMovements, 7);
  assert.equal(summary.doorsList[0].people, 3);
});
