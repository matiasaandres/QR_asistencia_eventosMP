import React, { useMemo } from 'react';
import { Activity, AlertTriangle, DoorClosed, Radio, ShieldAlert, Users } from 'lucide-react';
import { buildDoorMetrics, buildOperationalAlerts, getInsideTotal } from '../services/operationsPolicy.js';

const formatTime = (value) => value ? new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : 'Sin movimientos';

export default function OperationalCenter({ students, logs, doors }) {
  const metrics = useMemo(() => buildDoorMetrics(doors, logs), [doors, logs]);
  const alerts = useMemo(() => buildOperationalAlerts({ students, logs, doors }), [students, logs, doors]);
  const inside = getInsideTotal(students);
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-700">Operación en vivo</p><h1 className="mt-1 text-2xl font-black text-slate-950">Puertas y alertas</h1><p className="mt-1 text-sm text-slate-600">Supervisa dispositivos, operadores y movimientos del evento.</p></header>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><Users className="h-5 w-5 text-emerald-700"/><p className="mt-2 text-3xl font-black text-emerald-950">{inside}</p><p className="text-xs font-bold text-emerald-800">Personas actualmente dentro</p></div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><Radio className="h-5 w-5 text-sky-700"/><p className="mt-2 text-3xl font-black text-sky-950">{metrics.filter((door) => door.connected).length}</p><p className="text-xs font-bold text-sky-800">Dispositivos conectados</p></div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><ShieldAlert className="h-5 w-5 text-amber-700"/><p className="mt-2 text-3xl font-black text-amber-950">{alerts.length}</p><p className="text-xs font-bold text-amber-800">Alertas operativas</p></div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-extrabold text-slate-950"><DoorClosed className="h-5 w-5 text-violet-600"/> Panel de puertas</h2>
        {!metrics.length ? <p className="py-8 text-center text-sm text-slate-500">Las puertas aparecerán cuando un operador abra la aplicación.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">Puerta</th><th className="p-3">Operador</th><th className="p-3">Dispositivo</th><th className="p-3">Conexión</th><th className="p-3">Último movimiento</th><th className="p-3 text-right">Flujo/min</th></tr></thead><tbody className="divide-y divide-slate-100">{metrics.map((door) => <tr key={door.id}><td className="p-3 font-extrabold text-slate-900">{door.doorName}</td><td className="p-3 text-slate-600">{door.operatorEmail}</td><td className="p-3 text-slate-600">{door.deviceLabel}</td><td className="p-3"><span className={`rounded-full px-2 py-1 font-bold ${door.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{door.connected ? 'En línea' : 'Desconectada'}</span></td><td className="p-3 text-slate-600">{formatTime(door.lastMovementAt)}{door.lastMovementType ? ` · ${door.lastMovementType === 'EXIT' ? 'Salida' : door.lastMovementType === 'REENTRY' ? 'Reingreso' : 'Ingreso'}` : ''}</td><td className="p-3 text-right text-lg font-black text-violet-700">{door.flowPerMinute}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-extrabold text-slate-950"><AlertTriangle className="h-5 w-5 text-amber-600"/> Alertas operativas</h2>
        {!alerts.length ? <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Sin alertas activas.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{alerts.map((alert) => <article key={alert.id} className={`rounded-xl border p-4 ${alert.severity === 'high' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}><h3 className="font-extrabold text-slate-950">{alert.title}</h3><p className="mt-1 text-sm text-slate-700">{alert.detail}</p></article>)}</div>}
      </section>
    </div>
  );
}
