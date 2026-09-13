/**
 * Administración del catálogo de eventos: creación, edición, selección y
 * archivado según los permisos de la organización.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
  Plus,
  Users
} from 'lucide-react';

/** Formatea la fecha visible de un evento.
 * @param {string|Date} value Fecha del evento.
 * @returns {string} Fecha localizada.
 */
function formatEventDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(date);
}

/** Renderiza el administrador de eventos.
 * @param {object} props Eventos y acciones disponibles.
 * @returns {JSX.Element} Administrador de eventos.
 */
export default function EventsManager({
  events,
  currentEvent,
  students,
  onSelectEvent,
  onCreateEvent,
  onUpdateEvent,
  onArchiveEvent
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [defaultCapacity, setDefaultCapacity] = useState(4);
  const [status, setStatus] = useState('draft');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [copyRoster, setCopyRoster] = useState(true);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState('');

  const visibleEvents = useMemo(
    () => events.filter((event) => showArchived || !event.archived),
    [events, showArchived]
  );
  const courseOptions = useMemo(() => {
    const counts = new Map();
    students.filter((student) => student?.deleted !== true).forEach((student) => {
      const course = String(student.course || 'Sin curso');
      counts.set(course, (counts.get(course) || 0) + 1);
    });
    return [...counts].map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  }, [students]);
  const courseKey = courseOptions.map((course) => `${course.name}:${course.count}`).join('|');
  const selectedStudentCount = courseOptions.reduce((total, course) => (
    selectedCourses.includes(course.name) ? total + course.count : total
  ), 0);

  useEffect(() => {
    setSelectedCourses(courseOptions.map((course) => course.name));
  }, [courseKey]);

  /** Valida y crea un evento desde el formulario.
   * @param {SubmitEvent} submitEvent Evento de envío del formulario.
   * @returns {Promise<void>}
   */
  const handleCreate = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!name.trim()) return;
    if (copyRoster && selectedCourses.length === 0) {
      alert('Selecciona al menos un curso para incorporar su nómina al evento.');
      return;
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      alert('El cierre automático debe ser posterior a la apertura.');
      return;
    }
    setIsSaving(true);
    setMessage('');
    try {
      const created = await onCreateEvent({
        name: name.trim(),
        date,
        institution: currentEvent?.institution || 'Institución educativa',
        defaultCapacity: Number(defaultCapacity),
        status,
        startsAt: startsAt ? new Date(startsAt).toISOString() : '',
        endsAt: endsAt ? new Date(endsAt).toISOString() : '',
        doors: currentEvent?.doors || ['Acceso Principal']
      }, copyRoster, selectedCourses);
      setName('');
      setMessage(`Evento “${created.name}” creado y seleccionado.`);
    } catch (error) {
      alert(`No fue posible crear el evento: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /** Archiva o reactiva un evento seleccionado.
   * @param {object} event Evento que cambiará de estado.
   * @returns {Promise<void>}
   */
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
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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
          <label className="text-xs font-bold text-slate-700">Estado inicial<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm"><option value="draft">Borrador</option><option value="open">Abierto</option><option value="paused">Pausado</option><option value="closed">Cerrado</option></select></label>
          <label className="text-xs font-bold text-slate-700">Apertura automática<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm"/></label>
          <label className="text-xs font-bold text-slate-700">Cierre automático<input type="datetime-local" value={endsAt} min={startsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm"/></label>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={copyRoster} onChange={(event) => setCopyRoster(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-sky-300 text-sky-600" />
            <span><strong>Incorporar nómina desde el evento actual</strong><br />Selecciona los cursos que participarán; la asistencia comenzará en cero.</span>
          </label>
          <button disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-500 disabled:opacity-60">
            <Plus className="h-4 w-4" /> {isSaving ? 'Creando…' : 'Crear y seleccionar'}
          </button>
        </div>
        {copyRoster && (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-sky-700" /><div><h3 className="text-xs font-extrabold text-slate-900">Cursos que se incorporarán</h3><p className="text-[11px] text-slate-500">{selectedStudentCount} de {students.length} alumnos seleccionados</p></div></div>
              <div className="flex gap-2"><button type="button" onClick={() => setSelectedCourses(courseOptions.map((course) => course.name))} className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-700">Todos</button><button type="button" onClick={() => setSelectedCourses([])} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">Ninguno</button></div>
            </div>
            {courseOptions.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{courseOptions.map((course) => <label key={course.name} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${selectedCourses.includes(course.name) ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}><span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selectedCourses.includes(course.name)} onChange={(event) => setSelectedCourses((current) => event.target.checked ? [...current, course.name] : current.filter((name) => name !== course.name))} className="h-4 w-4 rounded border-sky-300 text-sky-600" /><span className="truncate text-xs font-bold text-slate-700">{course.name}</span></span><span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-slate-500">{course.count}</span></label>)}</div> : <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">El evento actual no tiene alumnos para copiar.</p>}
          </div>
        )}
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
                      {!event.archived && <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${event.status === 'open' ? 'bg-emerald-100 text-emerald-800' : event.status === 'paused' ? 'bg-amber-100 text-amber-800' : event.status === 'closed' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{event.status === 'open' ? 'Abierto' : event.status === 'paused' ? 'Pausado' : event.status === 'closed' ? 'Cerrado' : 'Borrador'}</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><CalendarDays className="h-3.5 w-3.5" /> {formatEventDate(event.date)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Cupo inicial: {event.defaultCapacity} por alumno</p>
                    {(event.startsAt || event.endsAt) && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> {event.startsAt ? `Abre ${new Date(event.startsAt).toLocaleString('es-CL')}` : 'Sin apertura automática'} · {event.endsAt ? `Cierra ${new Date(event.endsAt).toLocaleString('es-CL')}` : 'Sin cierre automático'}</p>}
                    <p className="mt-2 truncate font-mono text-[10px] text-slate-400">{event.id}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button type="button" disabled={isCurrent || event.archived} onClick={() => onSelectEvent(event)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                      {isCurrent ? 'Seleccionado' : 'Abrir evento'}
                    </button>
                    {!event.archived && <select aria-label={`Estado de ${event.name}`} value={event.status || 'open'} onChange={(change) => onUpdateEvent({ ...event, status: change.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700"><option value="draft">Borrador</option><option value="open">Abierto</option><option value="paused">Pausado</option><option value="closed">Cerrado</option></select>}
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
