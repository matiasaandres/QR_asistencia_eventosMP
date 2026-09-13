/**
 * Centro de familias para consultar cupos compartidos, miembros y cambios de
 * agrupación sin duplicar la lógica de capacidad del servicio de dominio.
 */

import React, { useMemo, useState } from 'react';
import { Link2, Search, Split, Users } from 'lucide-react';
import { getFamilyGroups } from '../services/operationsPolicy.js';

/** Renderiza la gestión de familias y sus cambios.
 * @param {object} props Nómina, historial y callbacks familiares.
 * @returns {JSX.Element} Centro de familias.
 */
export default function FamiliesCenter({ students, history = [], onMerge, onSplit }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const families = useMemo(() => getFamilyGroups(students), [students]);
  const normalized = query.toLocaleLowerCase('es').trim();
  const visible = families.filter((family) => !normalized || [family.id, ...family.members.map((member) => `${member.name} ${member.course}`)].join(' ').toLocaleLowerCase('es').includes(normalized));

  /** Une las familias seleccionadas y muestra el código resultante.
   * @returns {Promise<void>}
   */
  const merge = async () => {
    if (selected.length < 2 || !confirm(`¿Unir ${selected.length} familias bajo un nuevo código automático?`)) return;
    setSaving(true);
    try { const code = await onMerge(selected); setSelected([]); alert(`Familias unidas correctamente. Nuevo código: ${code}`); }
    catch (error) { alert(`No fue posible unir las familias: ${error.message}`); }
    finally { setSaving(false); }
  };
  /** Separa un integrante de su familia actual.
   * @param {object} family Familia de origen.
   * @param {object} member Integrante que se separará.
   * @returns {Promise<void>}
   */
  const split = async (family, member) => {
    if (!confirm(`¿Separar a ${member.name} de ${family.id}? Se generará un código nuevo automáticamente.`)) return;
    setSaving(true);
    try { const code = await onSplit(family.id, member.id); alert(`Integrante separado. Nuevo código: ${code}`); }
    catch (error) { alert(`No fue posible separar al integrante: ${error.message}`); }
    finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
    <header><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-700">Administración</p><h1 className="mt-1 text-2xl font-black text-slate-950">Centro de familias</h1><p className="mt-1 text-sm text-slate-600">Consulta integrantes y cursos; une o separa familias con códigos automáticos e historial.</p></header>
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código, alumno o curso" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm"/></label><button disabled={saving || selected.length < 2} onClick={merge} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-40"><Link2 className="h-4 w-4"/>Unir seleccionadas ({selected.length})</button></div>
    <div className="grid gap-4 lg:grid-cols-2">{visible.map((family) => <article key={family.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="h-4 w-4 text-sky-600"/><h2 className="font-mono text-sm font-black text-slate-950">{family.id}</h2></div><p className="mt-1 text-xs text-slate-500">{family.courses.join(' · ')}</p></div><label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={selected.includes(family.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, family.id] : current.filter((id) => id !== family.id))}/> Seleccionar</label></div><div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center"><div><strong className="block text-lg text-slate-950">{family.maxCapacity}</strong><span className="text-[10px] font-bold text-slate-500">CUPO</span></div><div><strong className="block text-lg text-slate-950">{family.enteredCount}</strong><span className="text-[10px] font-bold text-slate-500">REGISTRADAS</span></div><div><strong className="block text-lg text-emerald-700">{family.insideCount}</strong><span className="text-[10px] font-bold text-slate-500">DENTRO</span></div></div><div className="mt-3 space-y-2">{family.members.map((member) => <div key={member.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"><div><p className="text-sm font-bold text-slate-900">{member.name}</p><p className="text-xs text-slate-500">{member.course} · {member.id}</p></div>{family.members.length > 1 && <button disabled={saving || family.enteredCount > 0} onClick={() => split(family, member)} title={family.enteredCount > 0 ? 'No se puede separar con movimientos registrados' : 'Separar en una nueva familia'} className="rounded-lg bg-amber-50 p-2 text-amber-700 disabled:opacity-30"><Split className="h-4 w-4"/></button>}</div>)}</div></article>)}</div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-slate-950">Historial de cambios familiares</h2>{!history.length ? <p className="mt-3 text-sm text-slate-500">Todavía no se han unido ni separado familias.</p> : <div className="mt-3 space-y-2">{history.slice(0, 20).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><strong>{item.action === 'MERGE' ? 'Unión' : 'Separación'}</strong> · {item.sourceFamilyIds?.join(', ')} → <span className="font-mono font-bold">{item.targetFamilyId}</span><span className="mt-1 block text-slate-500">{item.operatorEmail} · {new Date(item.timestamp).toLocaleString('es-CL')}</span></div>)}</div>}</section>
  </div>;
}
