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
const authService = await readFile(
  new URL('../src/services/auth.js', import.meta.url),
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
const masterDashboard = await readFile(
  new URL('../src/components/MasterDashboard.jsx', import.meta.url),
  'utf8'
);
const organizationsService = await readFile(
  new URL('../src/services/organizations.js', import.meta.url),
  'utf8'
);
const membersManager = await readFile(new URL('../src/components/MembersManager.jsx', import.meta.url), 'utf8');
const settingsModal = await readFile(new URL('../src/components/SettingsModal.jsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

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
  assert.match(qrPrinter, /createStudentsQrPdf/);
  assert.match(qrPrinter, /application\/pdf/);
});

test('ofrece un ZIP con un PDF individual por alumno y progreso visible', () => {
  assert.match(qrPrinter, /Descargar ZIP: un PDF por alumno/);
  assert.match(qrPrinter, /createStudentQrArchive/);
  assert.match(qrPrinter, /students:\s*eligibleStudents,\s*event,/);
  assert.match(qrPrinter, /Creando PDF \$\{archiveProgress\.current\} de \$\{archiveProgress\.total\}/);
  assert.match(qrPrinter, /Comprimiendo ZIP/);
});

test('la descarga individual genera solo la credencial seleccionada', () => {
  assert.match(qrPrinter, /createStudentQrPdf/);
  assert.match(qrPrinter, /student:\s*selectedStudent/);
  assert.match(qrPrinter, /application\/pdf/);
  assert.match(qrPrinter, /Descargar credencial PDF/);
});

test('el login permite cuentas existentes, invitaciones y recuperar la contraseña', () => {
  assert.doesNotMatch(loginScreen, />Nueva escuela</);
  assert.doesNotMatch(loginScreen, /registerOrganization/);
  assert.match(loginScreen, /Tengo un código de invitación/);
  assert.match(loginScreen, /joinOrganization/);
  assert.match(loginScreen, /¿Olvidaste tu contraseña\?/);
  assert.match(loginScreen, /requestPasswordReset/);
  assert.match(authService, /sendPasswordResetEmail/);
  assert.match(authService, /getIdTokenResult/);
  assert.match(authService, /customClaims:\s*tokenResult\.claims/);
  assert.match(authService, /auth\/email-already-in-use/);
  assert.match(authService, /signInWithEmailAndPassword\(auth, normalizedEmail, password\)/);
  assert.match(loginScreen, /Correo electrónico/);
  assert.match(loginScreen, /cuentas escolares son creadas por la administración/);
  assert.match(loginScreen, /Acceso Maestro/);
  assert.match(loginScreen, /Acceso Escuelas/);
  assert.match(loginScreen, /\/master/);
  assert.match(loginScreen, /authenticateWithGoogle/);
  assert.match(loginScreen, /Solicítalo a la administración de tu escuela/);
  assert.doesNotMatch(loginScreen, /api\.qrserver\.com/);
});

test('la cuenta maestra administra escuelas y recupera Mundo Palabra', () => {
  assert.match(masterDashboard, /Panel maestro/);
  assert.match(masterDashboard, /Cerrar sesión/);
  assert.match(masterDashboard, /Crear escuela y cuenta administradora/);
  assert.match(masterDashboard, /Recuperar alumnos anteriores/);
  assert.match(masterDashboard, /onMigrateLegacy/);
  assert.match(masterDashboard, /Importar respaldo completo/);
  assert.match(masterDashboard, /Asignar cuenta escolar/);
  assert.match(masterDashboard, /Detalle de planes/);
  assert.match(masterDashboard, /Plan activo/);
  assert.match(masterDashboard, /totals\.byPlan/);
  assert.match(masterDashboard, /getOrganizationPlanDetails/);
  assert.match(masterDashboard, /Respaldo completo aplicado/);
  assert.match(masterDashboard, /Restaurar eliminados y deshabilitados/);
  assert.match(organizationsService, /restoreMundoPalabraStudentStates/);
  assert.match(organizationsService, /retired\.length !== 23/);
  assert.match(organizationsService, /deleteDocuments\(db, previousLogs\.docs\)/);
});

test('la nómina permite cambiar cupos globales, individuales y deshabilitar alumnos', () => {
  assert.match(studentsManager, /id="bulk-capacity"/);
  assert.match(studentsManager, /Aplicar a todos/);
  assert.match(studentsManager, /id="student-capacity"/);
  assert.match(studentsManager, /handleToggleStudent/);
  assert.match(studentsManager, /DESHABILITADO/);
});

test('la vista de estudiantes y credenciales filtra por curso, cupo y estado', () => {
  assert.match(studentsManager, /id="student-course-filter"/);
  assert.match(studentsManager, /id="student-capacity-filter"/);
  assert.match(studentsManager, /id="student-status-filter"/);
  assert.match(studentsManager, /matchesSearch && matchesCourse && matchesCapacity && matchesStatus/);
  assert.match(studentsManager, /Cupo extraordinario/);
  assert.match(studentsManager, /Mostrando <span[^>]*>\{filteredStudents\.length\}<\/span> de \{students\.length\}/);
  assert.match(studentsManager, /onClick=\{clearFilters\}/);
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
  assert.match(historyLog, /Los contadores de acceso y permanencia se recalcularán/);
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

test('cada escuela puede aplicar su logo e identidad en la app y los informes', () => {
  assert.match(settingsModal, /Identidad institucional/);
  assert.match(settingsModal, /accept="image\/png,image\/jpeg,image\/webp,image\/svg\+xml"/);
  assert.match(settingsModal, /onSaveOrganization/);
  assert.match(organizationsService, /updateOrganizationBrand/);
  assert.match(app, /organization=\{organization\}/);
  assert.match(dashboard, /OrganizationLogo/);
});

test('la sección de seguridad explica detalladamente cada rol', () => {
  assert.match(membersManager, /Guía detallada de permisos/);
  assert.match(membersManager, /Gestión completa de la escuela/);
  assert.match(membersManager, /Registro de ingresos durante el evento/);
  assert.match(membersManager, /Seguimiento sin capacidad de modificación/);
  assert.match(membersManager, /Comparación rápida de permisos/);
  assert.match(membersManager, /Buenas prácticas de seguridad/);
  assert.match(membersManager, /PERMISSION_MATRIX/);
});

test('la administración escolar permite deshabilitar, reactivar y eliminar accesos de usuarios', () => {
  assert.match(membersManager, /updateOrganizationMemberStatus/);
  assert.match(membersManager, /removeOrganizationMember/);
  assert.match(membersManager, /'Deshabilitar'/);
  assert.match(membersManager, /'Reactivar'/);
  assert.match(membersManager, /Eliminar acceso/);
  assert.match(membersManager, /isOwner \|\| isSelf/);
});
