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
const historyLog = await readFile(
  new URL('../src/components/HistoryLog.jsx', import.meta.url),
  'utf8'
);
const dashboard = await readFile(
  new URL('../src/components/Dashboard.jsx', import.meta.url),
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
  assert.match(qrPrinter, /students:\s*eligibleStudents,\s*event,/);
  assert.match(qrPrinter, /Creando PDF \$\{archiveProgress\.current\} de \$\{archiveProgress\.total\}/);
  assert.match(qrPrinter, /Comprimiendo ZIP/);
});

test('el login usa cuentas Firebase y permite registrar una escuela aislada', () => {
  assert.match(loginScreen, />Nueva escuela</);
  assert.match(loginScreen, /registerOrganization/);
  assert.match(loginScreen, /Correo electrónico/);
  assert.match(loginScreen, /Cada escuela mantiene sus usuarios, eventos y estudiantes separados/);
});

test('la nómina permite cambiar cupos globales, individuales y deshabilitar alumnos', () => {
  assert.match(studentsManager, /id="bulk-capacity"/);
  assert.match(studentsManager, /Aplicar a todos/);
  assert.match(studentsManager, /id="student-capacity"/);
  assert.match(studentsManager, /handleToggleStudent/);
  assert.match(studentsManager, /DESHABILITADO/);
});

test('la nómina permite eliminar estudiantes y cursos con confirmación', () => {
  assert.match(studentsManager, /handleDeleteStudent/);
  assert.match(studentsManager, /¿Eliminar de la nómina a/);
  assert.match(studentsManager, /id="course-to-delete"/);
  assert.match(studentsManager, /handleDeleteCourse/);
  assert.match(studentsManager, /Eliminar curso/);
  assert.match(studentsManager, /La bitácora de ingresos se conserva/);
});

test('el historial permite remover un registro con confirmación', () => {
  assert.match(historyLog, /handleDeleteLog/);
  assert.match(historyLog, /Remover registro/);
  assert.match(historyLog, /Se eliminará de la base de datos y se descontarán/);
  assert.match(historyLog, /await onDeleteLog\(log\)/);
});

test('el panel en vivo incorpora estadísticas y gráficos operativos', () => {
  assert.match(dashboard, /Actividad por hora/);
  assert.match(dashboard, /Rendimiento por curso/);
  assert.match(dashboard, /Flujo por puerta/);
  assert.match(dashboard, /Avance de familias/);
  assert.match(dashboard, /capacityPercentage/);
  assert.match(dashboard, /conic-gradient/);
  assert.match(dashboard, /activityByHour/);
});
