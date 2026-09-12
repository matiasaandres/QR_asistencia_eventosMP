import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storage = await readFile(new URL('../src/services/storage.js', import.meta.url), 'utf8');
const history = await readFile(new URL('../src/components/HistoryLog.jsx', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../src/components/Dashboard.jsx', import.meta.url), 'utf8');

test('limita la suscripción en vivo y pagina con un cursor estable', () => {
  assert.match(storage, /firestoreLimit\(LOG_PAGE_SIZE \+ 1\)/);
  assert.match(storage, /orderBy\(documentId\(\), 'desc'\)/);
  assert.match(storage, /startAfter\(afterLog\.timestamp, afterLog\.id\)/);
});

test('la interfaz carga páginas adicionales y exporta el historial completo bajo demanda', () => {
  assert.match(history, /Cargar 50 movimientos anteriores/);
  assert.match(history, /Exportar historial completo/);
  assert.match(history, /await onFetchAllLogs\(\)/);
});

test('el panel usa agregados en vez de inferir totales desde una página', () => {
  assert.match(dashboard, /const analyticsIsCurrent = Boolean\(analytics\?\.ready\)/);
  assert.match(dashboard, /analytics\.lastLogId === logs\[0\]\.id/);
  assert.match(dashboard, /analyticsIsCurrent \? analytics\.totalRecords/);
  assert.match(dashboard, /analyticsIsCurrent \? analytics\.doorsList/);
  assert.match(dashboard, /analyticsIsCurrent \? analytics\.activityByHour/);
});

test('comprueba el conteo antes de reconstruir toda la analítica', () => {
  assert.match(storage, /getCountFromServer\(eventLogs/);
  assert.match(storage, /currentMeta\.sourceLogCount === logCountSnapshot\.data\(\)\.count/);
});
