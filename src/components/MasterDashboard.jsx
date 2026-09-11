import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, LogOut, Plus, ShieldCheck, Upload, XCircle } from 'lucide-react';
import OrganizationLogo from './OrganizationLogo.jsx';
import { downloadSchoolBackup, restoreSchoolBackup } from '../services/schoolBackup.js';
import { readSpreadsheet } from '../services/spreadsheet.js';

const PLAN_LABELS = { pilot: 'Piloto', event: 'Por evento', monthly: 'Mensual', annual: 'Anual' };

export default function MasterDashboard({ organizations, user, onCreate, onAssignAccount, onStatusChange, onOpenSchool, onMigrateLegacy, onImportReport, onRestoreStudentStates, onLogout }) {
  const [schoolName, setSchoolName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [plan, setPlan] = useState('pilot');
  const [isSaving, setIsSaving] = useState(false);
  const [migratingSchool, setMigratingSchool] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [assigningSchool, setAssigningSchool] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backingUpSchool, setBackingUpSchool] = useState('');
  const [restoringSchool, setRestoringSchool] = useState('');

  const totals = useMemo(() => ({
    all: organizations.length,
    active: organizations.filter((item) => item.status === 'active').length,
    suspended: organizations.filter((item) => item.status === 'suspended').length
  }), [organizations]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const created = await onCreate({ schoolName, adminEmail, temporaryPassword, plan });
      setSchoolName('');
      setAdminEmail('');
      setTemporaryPassword('');
      setPlan('pilot');
      setMessage(`Escuela “${created.name}” creada. Ya puede ingresar con ${created.contactEmail}.`);
    } catch (creationError) {
      setError(creationError.message || 'No fue posible crear la escuela.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMigration = async (organization) => {
    setError('');
    setMessage('');
    setMigratingSchool(organization.id);
    try {
      const result = await onMigrateLegacy(organization.id);
      setMessage(`Mundo Palabra recuperado: ${result.events} eventos, ${result.students} alumnos y ${result.logs} registros.`);
    } catch (migrationError) {
      setError(migrationError.message || 'No fue posible recuperar los datos anteriores.');
    } finally {
      setMigratingSchool('');
    }
  };

  const handleReportImport = async (event, organization) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    setMigratingSchool(organization.id);
    try {
      const sheets = await readSpreadsheet(file, {
        sheetNames: ['Resumen Estudiantes', 'Bitácora de Ingresos']
      });
      const studentRows = sheets['Resumen Estudiantes'];
      const logRows = sheets['Bitácora de Ingresos'];
      const result = await onImportReport({ organizationId: organization.id, studentRows, logRows });
      setMessage(`Respaldo completo aplicado: ${result.students} alumnos, ${result.logs} ingresos y ${result.people} personas. Se reemplazaron ${result.replacedLogs} registros anteriores.`);
    } catch (importError) {
      setError(importError.message || 'No fue posible importar el respaldo.');
    } finally {
      setMigratingSchool('');
    }
  };

  const handleAccountAssignment = async (event, organization) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setAssigningSchool(organization.id);
    try {
      const result = await onAssignAccount({ organizationId: organization.id, adminEmail: accountEmail, password: accountPassword });
      setAccountEmail('');
      setAccountPassword('');
      setMessage(`Cuenta escolar asignada: ${result.email}.`);
    } catch (assignmentError) {
      setError(assignmentError.message || 'No fue posible asignar la cuenta escolar.');
    } finally {
      setAssigningSchool('');
    }
  };

  const handleStudentStateRestore = async (organization) => {
    setError('');
    setMessage('');
    setMigratingSchool(organization.id);
    try {
      const result = await onRestoreStudentStates(organization.id);
      setMessage(`Estados restaurados: ${result.deleted} alumnos eliminados y ${result.disabled} deshabilitados.`);
    } catch (restoreError) {
      setError(restoreError.message || 'No fue posible restaurar los estados de los alumnos.');
    } finally {
      setMigratingSchool('');
    }
  };

  const handleBackup = async (organization) => {
    setError('');
    setMessage('');
    setBackingUpSchool(organization.id);
    try {
      const summary = await downloadSchoolBackup(organization.id);
      setMessage(`Respaldo de “${organization.name}” descargado: ${summary.events} eventos, ${summary.students} alumnos y ${summary.logs} registros.`);
    } catch (backupError) {
      setError(backupError.message || 'No fue posible descargar el respaldo de la escuela.');
    } finally {
      setBackingUpSchool('');
    }
  };

  const handleBackupRestore = async (event, organization) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    if (file.size > 25 * 1024 * 1024) {
      setError('El respaldo supera el máximo permitido de 25 MB.');
      return;
    }
    if (!confirm(`¿Restaurar el respaldo de “${organization.name}”? Se reemplazarán sus eventos, alumnos, cupos y bitácoras. Las cuentas y permisos actuales se conservarán.`)) return;
    setRestoringSchool(organization.id);
    try {
      const backup = JSON.parse(await file.text());
      const summary = await restoreSchoolBackup(organization.id, backup);
      setMessage(`Respaldo de “${organization.name}” restaurado: ${summary.events} eventos, ${summary.students} alumnos y ${summary.logs} registros.`);
    } catch (restoreError) {
      setError(restoreError instanceof SyntaxError ? 'El archivo no contiene un JSON válido.' : (restoreError.message || 'No fue posible restaurar el respaldo.'));
    } finally {
      setRestoringSchool('');
    }
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><ShieldCheck className="h-9 w-9 shrink-0 text-sky-400" /><div className="min-w-0"><h1 className="text-xl font-black">Panel maestro</h1><p className="truncate text-xs text-slate-400">{user.email}</p></div></div>
          <button type="button" onClick={onLogout} className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:border-rose-400 hover:bg-rose-600 sm:px-4 sm:text-sm"><LogOut className="h-4 w-4" /><span>Cerrar sesión</span></button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Escuelas</p><p className="mt-1 text-3xl font-black text-slate-950">{totals.all}</p></div>
          <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-emerald-600">Activas</p><p className="mt-1 text-3xl font-black text-emerald-700">{totals.active}</p></div>
          <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-rose-600">Suspendidas</p><p className="mt-1 text-3xl font-black text-rose-700">{totals.suspended}</p></div>
        </section>

        <form onSubmit={handleCreate} className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black text-sky-950"><Plus className="h-5 w-5" /> Crear escuela y cuenta administradora</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-slate-700">Nombre de la escuela<input required minLength="2" maxLength="100" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-bold text-slate-700">Correo administrador<input required type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-bold text-slate-700">Contraseña temporal<input required type="password" minLength="6" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-bold text-slate-700">Plan<select value={plan} onChange={(event) => setPlan(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm"><option value="pilot">Piloto</option><option value="event">Por evento</option><option value="monthly">Mensual</option><option value="annual">Anual</option></select></label>
          </div>
          <button disabled={isSaving} className="mt-4 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">{isSaving ? 'Creando…' : 'Crear escuela'}</button>
          <p className="mt-2 text-xs text-slate-600">Entrega la contraseña temporal por un medio seguro. La escuela ingresará desde la pantalla normal.</p>
        </form>

        {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5"><h2 className="text-lg font-black text-slate-950">Escuelas registradas</h2></div>
          <div className="divide-y divide-slate-100">
            {organizations.map((organization) => (
              <article key={organization.id} className="p-4">
                <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                  <OrganizationLogo organization={organization} className="hidden h-11 w-11 shrink-0 rounded-xl border sm:flex" iconClassName="h-6 w-6" />
                  <div className="min-w-0"><h3 className="break-words pr-2 font-extrabold leading-snug text-slate-950">{organization.name}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{organization.contactEmail || 'Cuenta escolar pendiente de asignar'} · {PLAN_LABELS[organization.plan] || organization.plan}</p></div>
                  <span className={`inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${organization.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{organization.status === 'active' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{organization.status === 'active' ? 'Activa' : 'Suspendida'}</span>
                  <div className="flex min-w-0 flex-wrap gap-2 sm:col-span-3 sm:pl-14">
                  <button type="button" onClick={() => onOpenSchool(organization.id)} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><ExternalLink className="h-3.5 w-3.5" /> Abrir gestión</button>
                  <button type="button" disabled={Boolean(backingUpSchool)} onClick={() => handleBackup(organization)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-900 disabled:cursor-wait disabled:opacity-60"><Download className="h-3.5 w-3.5" /> {backingUpSchool === organization.id ? 'Preparando…' : 'Descargar respaldo'}</button>
                  <label className={`inline-flex items-center gap-1 rounded-lg bg-violet-100 px-3 py-2 text-xs font-bold text-violet-900 ${restoringSchool ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}><Upload className="h-3.5 w-3.5" /> {restoringSchool === organization.id ? 'Restaurando…' : 'Subir respaldo'}<input type="file" accept="application/json,.json" className="sr-only" disabled={Boolean(restoringSchool)} onChange={(event) => handleBackupRestore(event, organization)} /></label>
                  {organization.id === 'colegio-mundopalabra' && <button type="button" disabled={Boolean(migratingSchool)} onClick={() => handleMigration(organization)} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-60">{migratingSchool === organization.id ? 'Recuperando…' : 'Recuperar alumnos anteriores'}</button>}
                  {organization.id === 'colegio-mundopalabra' && <label className="cursor-pointer rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-900">Importar respaldo completo<input type="file" accept=".xlsx" className="sr-only" disabled={Boolean(migratingSchool)} onChange={(event) => handleReportImport(event, organization)} /></label>}
                  {organization.id === 'colegio-mundopalabra' && <button type="button" disabled={Boolean(migratingSchool)} onClick={() => handleStudentStateRestore(organization)} className="rounded-lg bg-violet-100 px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-60">Restaurar eliminados y deshabilitados</button>}
                  <button type="button" onClick={() => onStatusChange(organization.id, organization.status === 'active' ? 'suspended' : 'active')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{organization.status === 'active' ? 'Suspender' : 'Reactivar'}</button>
                  </div>
                </div>
                {!organization.contactEmail && <form onSubmit={(event) => handleAccountAssignment(event, organization)} className="mt-4 grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-xs font-bold text-slate-700">Correo de la escuela<input required type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2" /></label><label className="text-xs font-bold text-slate-700">Contraseña inicial<input required type="password" minLength="6" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2" /></label><button disabled={Boolean(assigningSchool)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{assigningSchool === organization.id ? 'Asignando…' : 'Asignar cuenta escolar'}</button></form>}
              </article>
            ))}
            {!organizations.length && <p className="p-8 text-center text-sm text-slate-500">Aún no hay escuelas registradas.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
