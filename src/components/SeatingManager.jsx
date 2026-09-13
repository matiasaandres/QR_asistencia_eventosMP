/**
 * Editor de establecimientos, plantas y asignaciones de asientos por evento.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Armchair, Building2, Check, Eraser, Layers3, MousePointer2,
  Plus, Save, Sparkles, UsersRound, X
} from 'lucide-react';
import {
  assignSeats,
  autoAssignCourseOwners,
  buildSeatOwners,
  createCcbbVenue,
  createEmptySeatPlan,
  createVisualVenue,
  getAllSeats,
  getOwnersForCourse,
  releaseSeats,
  SEAT_COLORS,
  STAGE_POSITIONS,
  summarizeSeatPlan
} from '../services/seatingPolicy.js';

/** Renderiza un asiento seleccionable del plano.
 * @param {object} props Datos del asiento y callbacks de selección.
 * @returns {JSX.Element} Botón de asiento.
 */
function SeatButton({ seat, assignment, selected, onToggle, size = 32 }) {
  const background = assignment?.color || '#e2e8f0';
  const label = assignment?.ownerName
    ? `${seat.label}: ${assignment.ownerName} · ${assignment.course}`
    : assignment?.course
      ? `${seat.label}: reservado para ${assignment.course}`
      : `${seat.label}: disponible`;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onToggle(seat.id)}
      className={`relative flex items-center justify-center rounded-t-lg rounded-b-sm border-2 text-[8px] font-black transition-transform hover:-translate-y-0.5 ${selected ? 'z-10 border-slate-950 ring-2 ring-sky-300' : 'border-slate-400/70'}`}
      style={{ width: size, height: size + 4, backgroundColor: background, color: assignment ? '#ffffff' : '#475569' }}
    >
      {seat.number}
      {assignment?.ownerId && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-slate-950" />}
    </button>
  );
}

/** Muestra todos los bloques de una planta conservando su ubicación relativa. */
function SpatialFloorMap({ floor, assignments, selectedSeats, onToggle, onSelectSection, zoom }) {
  const layout = floor?.layout;
  if (!layout) return null;
  const scaledWidth = Math.round(layout.width * zoom);
  const scaledHeight = Math.round(layout.height * zoom);
  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-3">
      <div className="relative mx-auto" style={{ width: scaledWidth, height: scaledHeight }}>
        <div className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-inner" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
          {(layout.landmarks || []).map((landmark) => (
            <div
              key={landmark.id}
              className={`absolute flex items-center justify-center border-2 text-center font-black ${landmark.type === 'stage' ? 'rounded-xl border-slate-500 bg-gradient-to-b from-slate-100 to-slate-300 text-2xl tracking-[0.18em] text-slate-800' : landmark.type === 'stairs' ? 'border-lime-500 bg-lime-100 text-sm text-lime-950' : 'border-slate-300 bg-slate-50 text-xs uppercase tracking-widest text-slate-400'}`}
              style={{ left: landmark.x, top: landmark.y, width: landmark.width, height: landmark.height }}
            >
              {landmark.label}
            </div>
          ))}
          {(floor.sections || []).map((mapSection) => {
            const sectionLayout = mapSection.layout;
            if (!sectionLayout) return null;
            return (
              <section
                key={mapSection.id}
                className="absolute rounded-xl border border-transparent p-1.5 hover:border-sky-200 hover:bg-sky-50/40"
                style={{
                  left: sectionLayout.x,
                  top: sectionLayout.y,
                  width: sectionLayout.width,
                  transform: `rotate(${sectionLayout.rotation || 0}deg)`,
                  transformOrigin: 'center'
                }}
              >
                <button type="button" onClick={() => onSelectSection(mapSection)} className="mb-1 block w-full truncate text-center text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-sky-700">
                  {mapSection.name}
                </button>
                <div className="grid justify-center" style={{ gridTemplateColumns: `repeat(${mapSection.columns || 1}, ${sectionLayout.seatSize || 23}px)`, gap: sectionLayout.gap || 4 }}>
                  {(mapSection.seats || []).map((seat) => <SeatButton key={seat.id} seat={seat} assignment={assignments?.[seat.id]} selected={selectedSeats.includes(seat.id)} onToggle={onToggle} size={sectionLayout.seatSize || 23} />)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Renderiza el formulario para crear un establecimiento.
 * @param {object} props Callbacks de creación y cierre.
 * @returns {JSX.Element} Formulario de establecimiento.
 */
function VenueCreator({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState(8);
  const [seatsPerRow, setSeatsPerRow] = useState(10);
  const [rowLabelStyle, setRowLabelStyle] = useState('letters');
  const [sectionName, setSectionName] = useState('Sector general');
  const [stageLabel, setStageLabel] = useState('Escenario');
  const [stagePosition, setStagePosition] = useState('top');
  const previewRows = Math.min(8, Math.max(1, Number(rows) || 1));
  const previewColumns = Math.min(12, Math.max(1, Number(seatsPerRow) || 1));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="venue-title">
      <form className="my-6 w-full max-w-4xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl" onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length < 2) return;
        onCreate(createVisualVenue({ name, rows, seatsPerRow, rowLabelStyle, sectionName, stageLabel, stagePosition }));
      }}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="venue-title" className="text-xl font-black text-slate-900">Nuevo establecimiento</h2><p className="text-xs text-slate-500">Crea un plano inicial que después podrás asignar a cualquier evento.</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
        <div className="space-y-4">
        <label className="block text-xs font-bold text-slate-700">Nombre del recinto
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Gimnasio municipal" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-700">Nombre del sector
          <input value={sectionName} onChange={(event) => setSectionName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-slate-700">Filas
            <input type="number" min="1" max="30" value={rows} onChange={(event) => setRows(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-700">Asientos por fila
            <input type="number" min="1" max="30" value={seatsPerRow} onChange={(event) => setSeatsPerRow(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-slate-700">Etiquetas de fila
            <select value={rowLabelStyle} onChange={(event) => setRowLabelStyle(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"><option value="letters">Letras: A, B, C</option><option value="numbers">Números: 1, 2, 3</option></select>
          </label>
          <label className="text-xs font-bold text-slate-700">Ubicación del escenario
            <select value={stagePosition} onChange={(event) => setStagePosition(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">{STAGE_POSITIONS.map((position) => <option key={position} value={position}>{position === 'none' ? 'Sin escenario' : position === 'top' ? 'Arriba' : position === 'bottom' ? 'Abajo' : position === 'left' ? 'Izquierda' : 'Derecha'}</option>)}</select>
          </label>
        </div>
        <label className="block text-xs font-bold text-slate-700">Texto del escenario
          <input value={stageLabel} onChange={(event) => setStageLabel(event.target.value)} disabled={stagePosition === 'none'} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100" />
        </label>
        <button type="submit" disabled={name.trim().length < 2} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-black text-white disabled:bg-slate-300"><Plus className="h-4 w-4" />Crear establecimiento</button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Previsualización</p>
          <div className={`flex min-h-[220px] gap-3 rounded-xl border border-slate-200 bg-white p-4 ${stagePosition === 'left' || stagePosition === 'right' ? 'flex-row items-center' : 'flex-col'}`}>
            {stagePosition === 'top' && <div className="rounded-lg bg-slate-800 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white">{stageLabel || 'Escenario'}</div>}
            {stagePosition === 'left' && <div className="flex w-12 items-center justify-center rounded-lg bg-slate-800 text-center text-[9px] font-black uppercase text-white [writing-mode:vertical-rl]">{stageLabel || 'Escenario'}</div>}
            <div className="grid flex-1 gap-1.5 overflow-hidden" style={{ gridTemplateColumns: `repeat(${previewColumns}, minmax(0, 1fr))` }}>
              {Array.from({ length: previewRows * previewColumns }, (_, index) => <span key={index} className="aspect-square rounded-t-md bg-sky-500" />)}
            </div>
            {stagePosition === 'right' && <div className="flex w-12 items-center justify-center rounded-lg bg-slate-800 text-center text-[9px] font-black uppercase text-white [writing-mode:vertical-rl]">{stageLabel || 'Escenario'}</div>}
            {stagePosition === 'bottom' && <div className="rounded-lg bg-slate-800 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white">{stageLabel || 'Escenario'}</div>}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">{rows} filas × {seatsPerRow} columnas · {Math.max(1, Number(rows) || 1) * Math.max(1, Number(seatsPerRow) || 1)} asientos</p>
        </div>
        </div>
      </form>
    </div>
  );
}

/** Renderiza la gestión de establecimientos y asignaciones.
 * @param {object} props Datos del evento, nómina y plano.
 * @returns {JSX.Element} Gestor de asientos.
 */
export default function SeatingManager({ organization, event, students, venues, seatPlan, onSaveVenue, onSavePlan }) {
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [floorId, setFloorId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [course, setCourse] = useState('');
  const [color, setColor] = useState(SEAT_COLORS[0]);
  const [ownerKey, setOwnerKey] = useState('');
  const [assignmentStep, setAssignmentStep] = useState('course');
  const [zoom, setZoom] = useState(0.75);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showCreator, setShowCreator] = useState(false);

  const venue = useMemo(() => venues.find((item) => item.id === seatPlan?.venueId) || null, [venues, seatPlan?.venueId]);
  const owners = useMemo(() => buildSeatOwners(students), [students]);
  const courses = useMemo(() => [...new Set(students.map((student) => student.course).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [students]);
  const floor = venue?.floors.find((item) => item.id === floorId) || venue?.floors[0] || null;
  const section = floor?.sections.find((item) => item.id === sectionId) || floor?.sections[0] || null;
  const courseOwners = useMemo(() => getOwnersForCourse(owners, course), [owners, course]);
  const selectedOwner = courseOwners.find((owner) => owner.key === ownerKey) || null;
  const stats = summarizeSeatPlan(seatPlan, venue);
  const floorSeats = useMemo(() => (floor?.sections || []).flatMap((item) => item.seats || []), [floor]);
  const visibleSeats = floor?.layout ? floorSeats : section?.seats || [];
  const courseAssignments = Object.values(seatPlan?.assignments || {}).filter((assignment) => assignment.course === course);
  const ownerAssignmentCounts = Object.values(seatPlan?.assignments || {}).reduce((counts, assignment) => {
    if (!assignment.ownerId) return counts;
    const key = `${assignment.ownerType}:${assignment.ownerId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const courseOwnerKeys = new Set(courseOwners
    .filter((owner) => (ownerAssignmentCounts.get(owner.key) || 0) >= Math.max(1, owner.capacity || 0))
    .map((owner) => owner.key));
  const courseSeatDemand = courseOwners.reduce((total, owner) => total + Math.max(0, Math.max(1, owner.capacity || 0) - (ownerAssignmentCounts.get(owner.key) || 0)), 0);

  useEffect(() => {
    if (!venue) return;
    const nextFloor = venue.floors.find((item) => item.id === floorId) || venue.floors[0];
    setFloorId(nextFloor?.id || '');
    setSectionId((current) => nextFloor?.sections.some((item) => item.id === current) ? current : nextFloor?.sections[0]?.id || '');
    setSelectedSeats([]);
  }, [venue?.id]);

  useEffect(() => {
    if (!floor) return;
    if (!floor.sections.some((item) => item.id === sectionId)) setSectionId(floor.sections[0]?.id || '');
    setSelectedSeats([]);
  }, [floorId]);

  useEffect(() => {
    if (!course && courses.length) setCourse(courses[0]);
  }, [courses, course]);

  /** Guarda el plano de asientos y actualiza el mensaje de resultado.
   * @param {object} nextPlan Plano que se almacenará.
   * @param {string} success Mensaje para una operación exitosa.
   * @returns {Promise<void>}
   */
  const persist = async (nextPlan, success) => {
    setSaving(true);
    setMessage('');
    try {
      await onSavePlan(nextPlan);
      setSelectedSeats([]);
      setMessage(success);
    } catch (error) {
      setMessage(error?.message || 'No fue posible guardar el plano.');
    } finally {
      setSaving(false);
    }
  };

  /** Selecciona un establecimiento y carga su plano vacío.
   * @param {string} venueId Identificador del establecimiento.
   * @returns {Promise<void>}
   */
  const handleVenueChange = async (venueId) => {
    if (!venueId) {
      if (stats.assigned > 0 && !window.confirm('Quitar el establecimiento liberará las asignaciones de asientos de este evento. ¿Continuar?')) return;
      await persist(createEmptySeatPlan(event.id), 'El evento quedó configurado sin recinto ni asignación de asientos.');
      return;
    }
    const nextVenue = venues.find((item) => item.id === venueId);
    if (!nextVenue) return;
    if (stats.assigned > 0 && !window.confirm('Cambiar el establecimiento liberará las asignaciones de asientos de este evento. ¿Continuar?')) return;
    await persist(createEmptySeatPlan(event.id, nextVenue), `Plano “${nextVenue.name}” vinculado al evento.`);
  };

  /** Crea un establecimiento y lo selecciona.
   * @param {object} newVenue Datos del establecimiento.
   * @returns {Promise<void>}
   */
  const handleCreateVenue = async (newVenue) => {
    setSaving(true);
    try {
      const stored = await onSaveVenue(newVenue);
      setShowCreator(false);
      await onSavePlan(createEmptySeatPlan(event.id, stored));
      setMessage(`Establecimiento “${stored.name}” creado y seleccionado.`);
    } catch (error) {
      setMessage(error?.message || 'No fue posible crear el establecimiento.');
    } finally {
      setSaving(false);
    }
  };

  /** Crea el establecimiento predeterminado de la actividad.
   * @returns {Promise<void>}
   */
  const addCcbb = () => handleCreateVenue(createCcbbVenue());
  /** Alterna un asiento en la selección actual.
   * @param {string} seatId Identificador del asiento.
   * @returns {void}
   */
  const toggleSeat = (seatId) => setSelectedSeats((current) => current.includes(seatId) ? current.filter((id) => id !== seatId) : [...current, seatId]);

  /** Sugiere asientos libres según la capacidad del estudiante.
   * @returns {void}
   */
  const suggestSeats = () => {
    if (!visibleSeats.length) return;
    const desired = assignmentStep === 'course'
      ? Math.max(1, courseOwners.reduce((total, owner) => total + Math.max(1, owner.capacity || 0), 0))
      : Math.max(1, selectedOwner?.capacity || 0);
    const available = visibleSeats.filter((seat) => {
      const assignment = seatPlan.assignments?.[seat.id];
      return assignmentStep === 'course' ? !assignment : assignment?.course === course && !assignment.ownerId;
    }).slice(0, desired).map((seat) => seat.id);
    setSelectedSeats(available);
    setMessage(available.length < desired ? `Solo hay ${available.length} asientos libres en este sector.` : `Se seleccionaron ${available.length} asientos sugeridos.`);
  };

  /** Aplica la asignación de asientos seleccionada.
   * @returns {void}
   */
  const applyAssignment = () => {
    if (assignmentStep === 'owners' && !selectedOwner) {
      setMessage('Selecciona un alumno o familia del curso.');
      return;
    }
    if (assignmentStep === 'owners') {
      const outsideCourse = selectedSeats.filter((seatId) => seatPlan.assignments?.[seatId]?.course !== course);
      if (outsideCourse.length) {
        setMessage(`Hay ${outsideCourse.length} asiento(s) que todavía no están reservados para ${course}. Completa primero el paso 1.`);
        return;
      }
    }
    const occupied = selectedSeats.filter((seatId) => assignmentStep === 'course'
      ? seatPlan.assignments?.[seatId]
      : seatPlan.assignments?.[seatId]?.ownerId);
    if (occupied.length > 0 && !window.confirm(`${occupied.length} asiento(s) ya tienen una asignación. ¿Deseas reemplazarla?`)) return;
    const next = assignSeats(seatPlan, selectedSeats, {
      course,
      color,
      ownerId: assignmentStep === 'owners' ? selectedOwner?.id || '' : '',
      ownerType: assignmentStep === 'owners' ? selectedOwner?.type || '' : '',
      ownerName: assignmentStep === 'owners' ? selectedOwner?.name || '' : ''
    });
    persist(next, assignmentStep === 'course'
      ? `${selectedSeats.length} asiento(s) reservados para ${course}. Ya puedes pasar a asignar alumnos.`
      : `${selectedSeats.length} asiento(s) asignados a ${selectedOwner.name}.`);
  };

  /** Distribuye un asiento reservado a cada alumno o familia pendiente del curso. */
  const handleAutoAssign = () => {
    const result = autoAssignCourseOwners(seatPlan, course, courseOwners);
    persist(result.plan, `${result.assignedOwners} alumno(s) o familia(s) asignados automáticamente. ${result.pendingOwners ? `${result.pendingOwners} quedaron pendientes por falta de asientos.` : 'El curso quedó distribuido.'}`);
  };

  if (!venues.length) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Building2 className="mx-auto h-12 w-12 text-sky-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-900">Establecimientos y asientos</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">El recinto es opcional. Puedes operar este evento normalmente sin plano, o guardar varios establecimientos para reutilizarlos cuando necesites asignar asientos.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button onClick={addCcbb} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-black text-white"><Layers3 className="h-4 w-4" />Usar plano CCBB 2026</button>
            <button onClick={() => setShowCreator(true)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-700"><Plus className="h-4 w-4" />Crear otro establecimiento</button>
          </div>
          {message && <p role="status" className="mt-4 text-sm font-bold text-sky-700">{message}</p>}
        </div>
        {showCreator && <VenueCreator onCreate={handleCreateVenue} onClose={() => setShowCreator(false)} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div><h1 className="flex items-center gap-2 text-xl font-black text-slate-900"><Armchair className="h-6 w-6 text-sky-600" />Asignación de asientos</h1><p className="mt-1 text-xs text-slate-500">{organization.name} · {event.name}. Los cambios solo afectan este evento.</p></div>
        <div className="flex flex-wrap gap-2">
          <select value={venue?.id || ''} onChange={(change) => handleVenueChange(change.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800">
            <option value="">Sin recinto · evento sin asientos</option>
            {venues.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.seatCount} asientos</option>)}
          </select>
          {!venues.some((item) => item.templateKey === 'ccbb-2026') && <button onClick={addCcbb} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800">Agregar CCBB</button>}
          <button onClick={() => setShowCreator(true)} className="flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700"><Plus className="h-4 w-4" />Otro recinto</button>
        </div>
      </header>

      {!venue ? <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950"><p className="font-black">Este evento funciona sin recinto.</p><p className="mt-1 text-xs font-medium text-sky-800">La asistencia, los QR, los cupos y las puertas continúan disponibles. Selecciona un establecimiento arriba solamente si deseas administrar asientos.</p></div> : <>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[['Total', stats.total], ['Disponibles', stats.available], ['Con curso', stats.assigned], ['Con familia/alumno', stats.withOwner], ['Cursos', stats.courses]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>)}
        </section>

        <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-2" aria-label="Etapa de asignación">
              <button type="button" onClick={() => { setAssignmentStep('course'); setOwnerKey(''); setSelectedSeats([]); }} className={`rounded-xl border p-3 text-left ${assignmentStep === 'course' ? 'border-sky-500 bg-sky-50 text-sky-950 ring-2 ring-sky-100' : 'border-slate-200 text-slate-600'}`}>
                <span className="block text-[10px] font-black uppercase tracking-wider">Paso 1</span>
                <span className="mt-1 block text-xs font-black">Reservar al curso</span>
              </button>
              <button type="button" onClick={() => { setAssignmentStep('owners'); setSelectedSeats([]); }} className={`rounded-xl border p-3 text-left ${assignmentStep === 'owners' ? 'border-violet-500 bg-violet-50 text-violet-950 ring-2 ring-violet-100' : 'border-slate-200 text-slate-600'}`}>
                <span className="block text-[10px] font-black uppercase tracking-wider">Paso 2</span>
                <span className="mt-1 block text-xs font-black">Asignar alumnos</span>
              </button>
            </div>
            <div><label className="text-xs font-black text-slate-700">Curso</label><select value={course} onChange={(change) => { setCourse(change.target.value); setOwnerKey(''); setSelectedSeats([]); }} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"><option value="">Seleccionar curso</option>{courses.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="flex flex-wrap gap-2" aria-label="Color del curso">{SEAT_COLORS.map((item) => <button key={item} type="button" onClick={() => setColor(item)} aria-label={`Usar color ${item}`} className={`h-8 w-8 rounded-full border-2 ${color === item ? 'border-slate-950 ring-2 ring-sky-300' : 'border-white'}`} style={{ backgroundColor: item }}>{color === item && <Check className="mx-auto h-4 w-4 text-white" />}</button>)}</div>
            {assignmentStep === 'course' ? (
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-950">
                <p className="font-black">Reserva primero la zona del curso</p>
                <p className="mt-1">{courseAssignments.length} asientos reservados · {courseOwners.length} alumnos o familias · {courseSeatDemand} cupos aún pendientes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-xs text-violet-950">
                  <p className="font-black">Distribución del curso</p>
                  <p className="mt-1">{courseOwnerKeys.size} de {courseOwners.length} alumnos o familias ya tienen asiento.</p>
                </div>
                <div><label className="text-xs font-black text-slate-700">Alumno o familia</label><select value={ownerKey} onChange={(change) => setOwnerKey(change.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">Seleccionar de {course || 'este curso'}</option>{courseOwners.map((owner) => <option key={owner.key} value={owner.key}>{owner.type === 'family' ? 'Familia' : 'Alumno'} · {owner.name} · {Math.max(1, owner.capacity || 0)} puesto(s){courseOwnerKeys.has(owner.key) ? ' · asignado' : ''}</option>)}</select>{selectedOwner?.type === 'family' && <p className="mt-1 text-[11px] text-slate-500">Integrantes: {selectedOwner.members.join(', ')}</p>}</div>
                <button onClick={handleAutoAssign} disabled={saving || !course || !courseOwners.length || courseOwnerKeys.size >= courseOwners.length || !courseAssignments.some((assignment) => !assignment.ownerId)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-xs font-black text-violet-800 disabled:opacity-40"><UsersRound className="h-4 w-4" />Distribuir automáticamente</button>
              </div>
            )}
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><MousePointer2 className="mb-1 h-4 w-4 text-sky-600" />Pulsa asientos en cualquier bloque de la planta. El plano mantiene la ubicación, pasillos y orientación del recinto.</div>
            <button onClick={suggestSeats} disabled={!visibleSeats.length || !course || (assignmentStep === 'owners' && !selectedOwner)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-xs font-black text-violet-800 disabled:opacity-40"><Sparkles className="h-4 w-4" />{assignmentStep === 'course' ? `Sugerir ${Math.max(1, courseSeatDemand)} para el curso` : `Sugerir ${Math.max(1, selectedOwner?.capacity || 1)} reservado(s)`}</button>
            <button onClick={applyAssignment} disabled={saving || !selectedSeats.length || !course || (assignmentStep === 'owners' && !selectedOwner)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-black text-white disabled:bg-slate-300"><Save className="h-4 w-4" />{assignmentStep === 'course' ? `Reservar ${selectedSeats.length || ''} al curso` : `Asignar ${selectedSeats.length || ''} a alumno`}</button>
            <button onClick={() => persist(releaseSeats(seatPlan, selectedSeats), `${selectedSeats.length} asiento(s) liberado(s).`)} disabled={saving || !selectedSeats.length} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 py-2.5 text-xs font-black text-rose-700 disabled:opacity-40"><Eraser className="h-4 w-4" />Liberar seleccionados</button>
            {selectedOwner && selectedSeats.length > 0 && selectedSeats.length !== Math.max(1, selectedOwner.capacity || 0) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">La selección tiene {selectedSeats.length} asientos y el cupo registrado es {Math.max(1, selectedOwner.capacity || 0)}. Puedes guardarla, pero conviene revisar la diferencia.</p>}
            {message && <p role="status" className="text-xs font-bold text-sky-700">{message}</p>}
          </aside>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">{venue.floors.map((item) => <button key={item.id} onClick={() => setFloorId(item.id)} className={`rounded-xl px-4 py-2 text-xs font-black ${floor?.id === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.name}</button>)}</div>
              {floor?.layout && <label className="flex items-center gap-2 text-xs font-bold text-slate-600">Zoom<select value={zoom} onChange={(change) => setZoom(Number(change.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"><option value="0.5">50%</option><option value="0.65">65%</option><option value="0.75">75%</option><option value="0.9">90%</option><option value="1">100%</option></select></label>}
            </div>
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{floor?.sections.map((item) => <button key={item.id} title={floor.layout ? 'Seleccionar todos los asientos del bloque' : 'Mostrar bloque'} onClick={() => { setSectionId(item.id); setSelectedSeats(floor.layout ? item.seats.map((seat) => seat.id) : []); }} className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold ${section?.id === item.id ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-200 text-slate-600'}`}>{item.name}</button>)}</div>
            {floor?.layout ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-4"><div><h2 className="font-black text-slate-900">{floor.name}</h2><p className="text-xs text-slate-500">Plano completo · {floorSeats.length} asientos · seleccionados {selectedSeats.length}</p></div><button onClick={() => setSelectedSeats([])} className="text-xs font-black text-sky-700">Limpiar selección</button></div>
                <SpatialFloorMap floor={floor} assignments={seatPlan.assignments} selectedSeats={selectedSeats} onToggle={toggleSeat} onSelectSection={(item) => { setSectionId(item.id); setSelectedSeats(item.seats.map((seat) => seat.id)); }} zoom={zoom} />
              </>
            ) : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="font-black text-slate-900">{section?.name}</h2><p className="text-xs text-slate-500">{section?.seats.length || 0} asientos · seleccionados {selectedSeats.length}</p></div><button onClick={() => setSelectedSeats(section?.seats.map((seat) => seat.id) || [])} className="text-xs font-black text-sky-700">Seleccionar sector</button></div>
              <div className={`mx-auto flex min-w-max gap-4 ${venue.stage?.position === 'left' || venue.stage?.position === 'right' ? 'flex-row items-center' : 'flex-col'}`}>
                {venue.stage?.position === 'top' && <div className="rounded-xl border-2 border-slate-400 bg-slate-100 py-3 text-center text-lg font-black tracking-[0.2em] text-slate-700">{venue.stage.label}</div>}
                {venue.stage?.position === 'left' && <div className="flex w-12 items-center justify-center rounded-xl border-2 border-slate-400 bg-slate-100 py-6 text-center text-xs font-black uppercase text-slate-700 [writing-mode:vertical-rl]">{venue.stage.label}</div>}
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${section?.columns || 1}, minmax(2rem, 2.25rem))` }}>
                  {section?.seats.map((seat) => <SeatButton key={seat.id} seat={seat} assignment={seatPlan.assignments?.[seat.id]} selected={selectedSeats.includes(seat.id)} onToggle={toggleSeat} />)}
                </div>
                {venue.stage?.position === 'right' && <div className="flex w-12 items-center justify-center rounded-xl border-2 border-slate-400 bg-slate-100 py-6 text-center text-xs font-black uppercase text-slate-700 [writing-mode:vertical-rl]">{venue.stage.label}</div>}
                {venue.stage?.position === 'bottom' && <div className="rounded-xl border-2 border-slate-400 bg-slate-100 py-3 text-center text-lg font-black tracking-[0.2em] text-slate-700">{venue.stage.label}</div>}
              </div>
            </div>}
            <div className="mt-4 flex flex-wrap gap-4 text-[11px] font-bold text-slate-600"><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-200" />Disponible</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-sky-600" />Curso asignado</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-950" />Punto: familia/alumno asignado</span></div>
          </section>
        </div>
      </>}
      {showCreator && <VenueCreator onCreate={handleCreateVenue} onClose={() => setShowCreator(false)} />}
    </div>
  );
}
