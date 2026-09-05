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
const qrPrinter = await readFile(
  new URL('../src/components/QRCardPrinter.jsx', import.meta.url),
  'utf8'
);
const styles = await readFile(
  new URL('../src/index.css', import.meta.url),
  'utf8'
);
const loginScreen = await readFile(
  new URL('../src/components/LoginScreen.jsx', import.meta.url),
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

test('la impresión masiva usa QR vectoriales y un flujo paginable', () => {
  assert.match(qrPrinter, /QRCode\.create/);
  assert.match(qrPrinter, /data-print-qr="true"/);
  assert.doesNotMatch(qrPrinter, /QRCode\.toCanvas/);
  assert.match(qrPrinter, /qr-print-overlay/);
  assert.match(qrPrinter, /qr-print-grid/);
  assert.match(styles, /\.qr-print-overlay\s*\{/);
  assert.match(styles, /position:\s*static\s*!important/);
  assert.match(styles, /page-break-inside:\s*avoid\s*!important/);
  assert.match(styles, /svg\[data-print-qr="true"\]/);
});

test('la impresión masiva muestra un botón explícito para descargar todos los QR', () => {
  assert.match(qrPrinter, /Descargar todos los QR en PDF/);
  assert.match(qrPrinter, /guardar todos los códigos QR como PDF/);
});

test('ofrece un ZIP con un PDF individual por alumno y progreso visible', () => {
  assert.match(qrPrinter, /Descargar ZIP: un PDF por alumno/);
  assert.match(qrPrinter, /createStudentQrArchive/);
  assert.match(qrPrinter, /students,\s*event,/);
  assert.match(qrPrinter, /Creando PDF \$\{archiveProgress\.current\} de \$\{archiveProgress\.total\}/);
  assert.match(qrPrinter, /Comprimiendo ZIP/);
});

test('el login ofrece recuperación de QR para apoderados mediante RUT y curso', () => {
  assert.match(loginScreen, />\s*Apoderados\s*</);
  assert.match(loginScreen, /id="guardian-rut"/);
  assert.match(loginScreen, /id="guardian-course"/);
  assert.match(loginScreen, /findStudentForGuardian/);
  assert.match(loginScreen, /Generar mi QR/);
});
