import React, { useMemo, useState } from 'react';
import { Building2, CheckCircle2, ExternalLink, LogOut, Plus, ShieldCheck, XCircle } from 'lucide-react';

const PLAN_LABELS = { pilot: 'Piloto', event: 'Por evento', monthly: 'Mensual', annual: 'Anual' };

export default function MasterDashboard({ organizations, user, onCreate, onStatusChange, onOpenSchool, onMigrateLegacy, onLogout }) {
  const [schoolName, setSchoolName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [plan, setPlan] = useState('pilot');
  const [isSaving, setIsSaving] = useState(false);
  const [migratingSchool, setMigratingSchool] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3"><ShieldCheck className="h-9 w-9 text-sky-400" /><div><h1 className="text-xl font-black">Panel maestro</h1><p className="text-xs text-slate-400">{user.email}</p></div></div>
          <button type="button" onClick={onLogout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"><LogOut className="h-4 w-4" /> Salir</button>
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
              <article key={organization.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <Building2 className="hidden h-6 w-6 text-sky-600 sm:block" />
                <div className="min-w-0 flex-1"><h3 className="font-extrabold text-slate-950">{organization.name}</h3><p className="truncate text-xs text-slate-500">{organization.contactEmail || 'Cuenta creada antes del panel maestro'} · {PLAN_LABELS[organization.plan] || organization.plan}</p></div>
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${organization.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{organization.status === 'active' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{organization.status === 'active' ? 'Activa' : 'Suspendida'}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onOpenSchool(organization.id)} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"><ExternalLink className="h-3.5 w-3.5" /> Abrir gestión</button>
                  {organization.id === 'colegio-mundopalabra' && <button type="button" disabled={Boolean(migratingSchool)} onClick={() => handleMigration(organization)} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-60">{migratingSchool === organization.id ? 'Recuperando…' : 'Recuperar alumnos anteriores'}</button>}
                  <button type="button" onClick={() => onStatusChange(organization.id, organization.status === 'active' ? 'suspended' : 'active')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{organization.status === 'active' ? 'Suspender' : 'Reactivar'}</button>
                </div>
              </article>
            ))}
            {!organizations.length && <p className="p-8 text-center text-sm text-slate-500">Aún no hay escuelas registradas.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
