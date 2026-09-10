import React, { useState } from 'react';
import { Building2, DatabaseBackup, Plus, X } from 'lucide-react';

export default function OrganizationsModal({
  isOpen,
  onClose,
  organizations,
  currentOrganization,
  onSelect,
  onCreate,
  onMigrateLegacy
}) {
  const [schoolName, setSchoolName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const created = await onCreate(schoolName);
      setSchoolName('');
      setMessage(`Escuela “${created.name}” creada y seleccionada.`);
    } catch (creationError) {
      setError(creationError.message || 'No fue posible crear la escuela.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMigration = async () => {
    setError('');
    setMessage('');
    setIsMigrating(true);
    try {
      const result = await onMigrateLegacy();
      setMessage(`Recuperación terminada: ${result.events} eventos, ${result.students} alumnos y ${result.logs} registros copiados.`);
    } catch (migrationError) {
      setError(migrationError.message || 'No fue posible recuperar los datos anteriores.');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
      <section role="dialog" aria-modal="true" aria-labelledby="organizations-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-700">Administración</p>
            <h2 id="organizations-title" className="mt-1 text-2xl font-black text-slate-950">Escuelas</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 space-y-2">
          {organizations.map((organization) => (
            <button key={organization.id} type="button" onClick={() => onSelect(organization.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${organization.id === currentOrganization?.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <Building2 className="h-5 w-5 text-sky-600" />
              <span className="flex-1 font-bold text-slate-900">{organization.name}</span>
              {organization.id === currentOrganization?.id && <span className="text-xs font-bold text-sky-700">Actual</span>}
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate} className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <h3 className="flex items-center gap-2 font-extrabold text-sky-950"><Plus className="h-5 w-5" /> Agregar otra escuela</h3>
          <label className="mt-3 block text-xs font-bold text-slate-700">
            Nombre de la escuela
            <input required minLength="2" maxLength="100" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="Ej: Escuela Los Alerces" className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300" />
          </label>
          <button disabled={isSaving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"><Plus className="h-4 w-4" />{isSaving ? 'Creando…' : 'Crear escuela'}</button>
        </form>

        {currentOrganization?.id === 'colegio-mundopalabra' && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="flex items-center gap-2 font-extrabold text-amber-950"><DatabaseBackup className="h-5 w-5" /> Recuperar datos anteriores</h3>
            <p className="mt-1 text-xs text-amber-900">Copia los eventos, alumnos e historial de la base anterior. La fuente no se elimina y esta operación puede repetirse.</p>
            <button type="button" disabled={isMigrating} onClick={handleMigration} className="mt-3 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">{isMigrating ? 'Recuperando…' : 'Recuperar alumnos de Mundo Palabra'}</button>
          </div>
        )}

        {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
      </section>
    </div>
  );
}
