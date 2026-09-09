import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckCircle2,
  Copy,
  Plus,
  Users
} from 'lucide-react';

function formatEventDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(date);
}

export default function EventsManager({
  events,
  currentEvent,
  students,
  onSelectEvent,
  onCreateEvent,
  onArchiveEvent
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [defaultCapacity, setDefaultCapacity] = useState(currentEvent?.defaultCapacity || 5);
  const [copyRoster, setCopyRoster] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState('');

  const visibleEvents = useMemo(
    () => events.filter((event) => showArchived || !event.archived),
    [events, showArchived]
  );

  const handleCreate = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    setMessage('');
    try {
      const created = await onCreateEvent({
        name: name.trim(),
        date,
        institution: currentEvent?.institution || 'Institución educativa',
        defaultCapacity: Number(defaultCapacity),
        doors: currentEvent?.doors || ['Acceso Principal']
      }, copyRoster);
      setName('');
      setMessage(`Evento “${created.name}” creado y seleccionado.`);
    } catch (error) {
      alert(`No fue posible crear el evento: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (event) => {
    const action = event.archived ? 'reactivar' : 'archivar';
    if (!confirm(`¿${action[0].toUpperCase()}${action.slice(1)} el evento “${event.name}”? Sus datos no se eliminarán.`)) return;
    try {
      await onArchiveEvent(event.id, !event.archived);
      setMessage(event.archived ? 'Evento reactivado.' : 'Evento archivado sin eliminar sus datos.');
    } catch (error) {
      alert(`No fue posible ${action} el evento: ${error.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-700">Administración</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Eventos</h1>
        <p className="mt-1 text-sm text-slate-600">Cada evento mantiene su propia nómina, cupos e historial de ingresos.</p>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> {message}
        </div>
      )}

      <form onSubmit={handleCreate} className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sky-950">
          <Plus className="h-5 w-5" />
          <h2 className="font-extrabold">Crear un evento nuevo</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <label className="text-xs font-bold text-slate-700">
            Nombre del evento
            <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Gala de aniversario 2026" className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Fecha
            <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Cupo inicial
            <input required type="number" min="1" max="50" value={defaultCapacity} onChange={(event) => setDefaultCapacity(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300" />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={copyRoster} onChange={(event) => setCopyRoster(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-sky-300 text-sky-600" />
            <span><strong>Copiar la nómina actual ({students.length} alumnos)</strong><br />La asistencia comenzará en cero; se conservarán identidad, curso y cupos.</span>
          </label>
          <button disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-500 disabled:opacity-60">
            <Plus className="h-4 w-4" /> {isSaving ? 'Creando…' : 'Crear y seleccionar'}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-extrabold text-slate-900">Eventos disponibles ({events.filter((event) => !event.archived).length})</h2>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivados
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleEvents.map((event) => {
            const isCurrent = event.id === currentEvent?.id;
            return (
              <article key={event.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${isCurrent ? 'border-sky-400 ring-2 ring-sky-100' : 'border-slate-200'} ${event.archived ? 'opacity-65' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-extrabold text-slate-950">{event.name}</h3>
                      {isCurrent && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-sky-700">Actual</span>}
                      {event.archived && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold uppercase text-slate-600">Archivado</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><CalendarDays className="h-3.5 w-3.5" /> {formatEventDate(event.date)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Cupo inicial: {event.defaultCapacity} por alumno</p>
                    <p className="mt-2 truncate font-mono text-[10px] text-slate-400">{event.id}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button type="button" disabled={isCurrent || event.archived} onClick={() => onSelectEvent(event)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                      {isCurrent ? 'Seleccionado' : 'Abrir evento'}
                    </button>
                    <button type="button" disabled={isCurrent && !event.archived} onClick={() => handleArchive(event)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40" title={isCurrent ? 'Selecciona otro evento antes de archivar este' : ''}>
                      {event.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                      {event.archived ? 'Reactivar' : 'Archivar'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
