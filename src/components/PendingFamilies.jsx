/**
 * Lista de familias pendientes de ingreso con búsqueda y filtros por curso.
 */

import React, { useMemo, useState } from 'react';
import { getPendingFamilies, filterPendingFamilies } from '../services/pendingFamilies.js';

/** Renderiza las familias que aún no registran ingreso.
 * @param {{students: Array<object>}} props Nómina del evento.
 * @returns {JSX.Element} Lista de familias pendientes.
 */
export default function PendingFamilies({ students }) {
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('');
  const families = useMemo(() => getPendingFamilies(students), [students]);
  const courses = [...new Set(families.map((family) => family.course))];
  const visible = filterPendingFamilies(families, { query, course });
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="pending-families-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pending-families-title" className="text-base font-extrabold text-slate-950">Familias habilitadas sin ingreso</h2>
        <span className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-bold text-amber-900">{families.length} familias</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">Alumnos activos con cupo autorizado y ninguna persona ingresada. Mientras el evento siga abierto, son familias pendientes de llegada.</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">La familia se identifica por el alumno asociado. La nómina no registra nombres de apoderados ni agrupa hermanos. El informe PDF incluye la lista completa al momento de la descarga.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="pending-family-search" className="text-xs font-bold text-slate-700">Buscar alumno</label><input id="pending-family-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o apellido" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
        <div><label htmlFor="pending-family-course" className="text-xs font-bold text-slate-700">Curso</label><select id="pending-family-course" value={course} onChange={(e) => setCourse(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Todos los cursos</option>{course && !courses.includes(course) && <option value={course}>{course}</option>}{courses.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
      </div>
      <p role="status" className="mt-3 text-xs text-slate-600">Mostrando {visible.length} de {families.length} familias sin ingreso.</p>
      {!visible.length ? <p className="py-6 text-center text-sm text-slate-500">{families.length ? 'No hay familias que coincidan con los filtros.' : 'No hay familias habilitadas con cupo y sin ingreso registrado.'}</p> : (
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 text-xs text-slate-700"><tr><th scope="col" className="p-3">Alumno / familia asociada</th><th scope="col" className="p-3">Curso</th><th scope="col" className="p-3 text-right">Cupos autorizados</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{visible.map((family, index) => <tr key={family.id || `${family.course}-${family.name}-${index}`}><td className="p-3 font-semibold text-slate-900">{family.name}<span className="mt-1 block text-xs font-normal text-amber-800">Sin ingreso registrado</span></td><td className="p-3 text-slate-600">{family.course}</td><td className="p-3 text-right text-slate-600">{family.capacity}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
