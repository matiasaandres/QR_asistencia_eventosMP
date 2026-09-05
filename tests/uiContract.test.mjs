import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const checkinPanel = await readFile(
  new URL('../src/components/CheckinPanel.jsx', import.meta.url),
  'utf8'
);
const manualSearch = await readFile(
  new URL('../src/components/ManualSearch.jsx', import.meta.url),
  'utf8'
);
const studentsManager = await readFile(
  new URL('../src/components/StudentsManager.jsx', import.meta.url),
  'utf8'
);

test('seleccionar cantidad no registra automáticamente y muestra confirmación', () => {
  assert.match(checkinPanel, /onClick=\{\(\) => setSelectedCount\(num\)\}/);
  assert.match(checkinPanel, /¿Confirmas el ingreso de \{selectedCount\}/);
  assert.match(checkinPanel, /onClick=\{\(\) => handleRegister\(selectedCount\)\}/);
});

test('el formulario extraordinario solicita nombre y parentesco', () => {
  assert.match(checkinPanel, /id="extra-guest-name"/);
  assert.match(checkinPanel, /id="extra-guest-relationship"/);
  assert.match(checkinPanel, /Confirmar cupo extraordinario/);
});

test('las pantallas de búsqueda y nómina usan la política común de capacidad', () => {
  assert.match(manualSearch, /getCapacityState\(student\)/);
  assert.match(studentsManager, /getCapacityState\(s\)/);
  assert.doesNotMatch(manualSearch, /Number\([^\n]*maxCapacity\) \|\| 5/);
  assert.doesNotMatch(studentsManager, /Number\([^\n]*maxCapacity\) \|\| 5/);
});
