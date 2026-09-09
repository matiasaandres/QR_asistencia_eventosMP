import React, { useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  DoorClosed,
  FileSpreadsheet,
  Gauge,
  GraduationCap,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users
} from 'lucide-react';
import { exportToExcel } from '../services/export';
import { getCapacityState } from '../services/checkinPolicy';

const clampPercentage = (value) => Math.min(100, Math.max(0, value));

function MetricCard({ label, value, detail, icon: Icon, tone = 'sky' }) {
  const tones = {
    sky: { line: 'from-sky-500 to-cyan-500', icon: 'bg-sky-50 text-sky-700' },
    emerald: { line: 'from-emerald-500 to-teal-500', icon: 'bg-emerald-50 text-emerald-700' },
    amber: { line: 'from-amber-500 to-orange-500', icon: 'bg-amber-50 text-amber-700' },
    violet: { line: 'from-violet-500 to-indigo-500', icon: 'bg-violet-50 text-violet-700' }
  };
  const colors = tones[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${colors.line}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${colors.icon}`}><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

export default function Dashboard({ event, students, logs }) {
  const stats = useMemo(() => {
    const activeStudents = students.filter((student) => !getCapacityState(student).isAccessBlocked);
    const totalStudents = activeStudents.length;
    let familiesEntered = 0;
    let totalPeopleEntered = 0;
    let totalCapacity = 0;
    let completeFamilies = 0;
    let partialFamilies = 0;
    const courseMap = {};

    activeStudents.forEach((student) => {
      const capacity = getCapacityState(student);
      const courseName = student.course || 'Sin curso';
      totalCapacity += capacity.maxCapacity;
      totalPeopleEntered += capacity.enteredCount;
      if (capacity.enteredCount > 0) familiesEntered += 1;
      if (capacity.enteredCount >= capacity.maxCapacity && capacity.maxCapacity > 0) completeFamilies += 1;
      else if (capacity.enteredCount > 0) partialFamilies += 1;

      if (!courseMap[courseName]) {
        courseMap[courseName] = { name: courseName, totalStudents: 0, familiesEntered: 0, peopleEntered: 0, capacity: 0 };
      }
      courseMap[courseName].totalStudents += 1;
      courseMap[courseName].capacity += capacity.maxCapacity;
      courseMap[courseName].peopleEntered += capacity.enteredCount;
      if (capacity.enteredCount > 0) courseMap[courseName].familiesEntered += 1;
    });

    const familiesPending = Math.max(0, totalStudents - familiesEntered);
    const attendancePercentage = totalStudents > 0 ? Math.round((familiesEntered / totalStudents) * 100) : 0;
    const capacityPercentage = totalCapacity > 0 ? Math.round((totalPeopleEntered / totalCapacity) * 100) : 0;

    const doorMap = {};
    logs.forEach((log) => {
      const doorName = log.doorName || 'Sin puerta';
      if (!doorMap[doorName]) doorMap[doorName] = { name: doorName, records: 0, people: 0 };
      doorMap[doorName].records += 1;
      doorMap[doorName].people += Number(log.count) || 0;
    });

    const hourMap = {};
    logs.forEach((log) => {
      const date = new Date(log.timestamp);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}`;
      if (!hourMap[key]) {
        hourMap[key] = { key, label: `${String(date.getHours()).padStart(2, '0')}:00`, people: 0, records: 0 };
      }
      hourMap[key].people += Number(log.count) || 0;
      hourMap[key].records += 1;
    });

    return {
      totalStudents,
      familiesEntered,
      familiesPending,
      totalPeopleEntered,
      totalCapacity,
      completeFamilies,
      partialFamilies,
      attendancePercentage,
      capacityPercentage,
      availableCapacity: Math.max(0, totalCapacity - totalPeopleEntered),
      averageGroup: familiesEntered > 0 ? (totalPeopleEntered / familiesEntered).toFixed(1) : '0.0',
      extraGuests: activeStudents.filter((student) => student.extraGuest).length,
      coursesList: Object.values(courseMap).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })),
      doorsList: Object.values(doorMap).sort((a, b) => b.people - a.people),
      activityByHour: Object.values(hourMap).sort((a, b) => a.key.localeCompare(b.key)).slice(-8)
    };
  }, [students, logs]);

  const peakHourlyPeople = Math.max(1, ...stats.activityByHour.map((hour) => hour.people));
  const peakDoorPeople = Math.max(1, ...stats.doorsList.map((door) => door.people));
  const completeStop = (stats.completeFamilies / Math.max(1, stats.totalStudents)) * 100;
  const partialStop = ((stats.completeFamilies + stats.partialFamilies) / Math.max(1, stats.totalStudents)) * 100;
  const familyDonut = { background: `conic-gradient(#10b981 0 ${completeStop}%, #38bdf8 0 ${partialStop}%, #e2e8f0 0 100%)` };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-sky-950 to-indigo-900 p-6 text-white shadow-xl shadow-sky-950/15">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Datos en vivo
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold text-sky-100">{logs.length} movimientos</span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{event?.name || 'Control de Acceso'}</h1>
            <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-sky-100/75 sm:text-sm">
              Estado general del recinto, avance por curso y actividad sincronizada desde todos los accesos.
            </p>
          </div>
          <button
            onClick={() => exportToExcel({ event, students, logs })}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-lg transition hover:bg-sky-50 active:scale-95"
            title="Descargar resumen en formato Excel"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Descargar Excel
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Alumnos activos" value={stats.totalStudents} detail={`${stats.familiesEntered} familias presentes`} icon={Users} tone="sky" />
        <MetricCard label="Personas dentro" value={stats.totalPeopleEntered} detail={`de ${stats.totalCapacity} cupos autorizados`} icon={TrendingUp} tone="emerald" />
        <MetricCard label="Familias pendientes" value={stats.familiesPending} detail={`${stats.attendancePercentage}% ya registró llegada`} icon={Clock} tone="amber" />
        <MetricCard label="Cupos disponibles" value={stats.availableCapacity} detail={`${stats.capacityPercentage}% de ocupación`} icon={Gauge} tone="violet" />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-950"><UserCheck className="h-5 w-5 text-emerald-600" /> Avance de familias</h2>
              <p className="mt-0.5 text-xs text-slate-500">Estado actual de los alumnos habilitados</p>
            </div>
            <span className="text-2xl font-black text-emerald-600">{stats.attendancePercentage}%</span>
          </div>
          <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
            <div className="relative h-40 w-40 shrink-0 rounded-full p-4" style={familyDonut} aria-label={`Avance de familias: ${stats.attendancePercentage}%`}>
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner">
                <span className="text-4xl font-black text-slate-950">{stats.familiesEntered}</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">de {stats.totalStudents}</span>
              </div>
            </div>
            <div className="w-full space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5"><span className="flex items-center gap-2 font-bold text-emerald-800"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Cupo completo</span><strong>{stats.completeFamilies}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-sky-50 px-3 py-2.5"><span className="flex items-center gap-2 font-bold text-sky-800"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Ingreso parcial</span><strong>{stats.partialFamilies}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2.5"><span className="flex items-center gap-2 font-bold text-slate-700"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Sin ingreso</span><strong>{stats.familiesPending}</strong></div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-950"><BarChart3 className="h-5 w-5 text-indigo-600" /> Actividad por hora</h2>
              <p className="mt-0.5 text-xs text-slate-500">Personas registradas en las últimas franjas activas</p>
            </div>
            <div className="rounded-xl bg-indigo-50 px-3 py-2 text-right"><p className="text-[10px] font-bold uppercase text-indigo-500">Promedio por familia</p><p className="text-lg font-black text-indigo-800">{stats.averageGroup}</p></div>
          </div>
          {stats.activityByHour.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center text-slate-400"><Activity className="mb-2 h-8 w-8 opacity-40" /><p className="text-xs">La actividad aparecerá con el primer ingreso.</p></div>
          ) : (
            <div className="mt-5 flex h-52 items-end gap-2 rounded-2xl bg-gradient-to-b from-slate-50 to-white px-3 pb-3 pt-6 sm:gap-3">
              {stats.activityByHour.map((hour) => {
                const height = Math.max(8, (hour.people / peakHourlyPeople) * 100);
                return (
                  <div key={hour.key} className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                    <span className="mb-1 text-[10px] font-extrabold text-indigo-700 opacity-0 transition-opacity group-hover:opacity-100">{hour.people}</span>
                    <div className="relative flex flex-1 items-end justify-center"><div className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-indigo-600 to-sky-400 shadow-sm transition-all duration-500 group-hover:from-indigo-500 group-hover:to-cyan-300" style={{ height: `${height}%` }} title={`${hour.people} personas en ${hour.records} registros`} /></div>
                    <span className="mt-2 truncate text-[10px] font-bold text-slate-500">{hour.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div><h2 className="flex items-center gap-2 text-base font-extrabold text-slate-950"><GraduationCap className="h-5 w-5 text-sky-600" /> Rendimiento por curso</h2><p className="mt-0.5 text-xs text-slate-500">Familias presentes y uso del cupo autorizado</p></div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{stats.coursesList.length} cursos</span>
          </div>
          <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {stats.coursesList.map((course) => {
              const familiesPct = course.totalStudents > 0 ? Math.round((course.familiesEntered / course.totalStudents) * 100) : 0;
              const capacityPct = course.capacity > 0 ? Math.round((course.peopleEntered / course.capacity) * 100) : 0;
              return (
                <div key={course.name} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-sky-200 hover:bg-sky-50/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-slate-900">{course.name}</span>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><span className="rounded-md bg-white px-2 py-1 text-slate-600 shadow-sm">{course.familiesEntered}/{course.totalStudents} familias</span><span className="rounded-md bg-sky-100 px-2 py-1 text-sky-800">{course.peopleEntered} personas</span></div>
                  </div>
                  <div className="mt-3 grid grid-cols-[76px_1fr_38px] items-center gap-2 text-[10px] font-bold text-slate-500">
                    <span>Asistencia</span><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${clampPercentage(familiesPct)}%` }} /></div><span className="text-right text-emerald-700">{familiesPct}%</span>
                    <span>Ocupación</span><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-sky-500" style={{ width: `${clampPercentage(capacityPct)}%` }} /></div><span className="text-right text-sky-700">{capacityPct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-extrabold text-slate-950"><DoorClosed className="h-5 w-5 text-violet-600" /> Flujo por puerta</h2><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Personas</span></div>
            {stats.doorsList.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Sin movimientos registrados.</p> : (
              <div className="mt-4 space-y-3">
                {stats.doorsList.map((door, index) => (
                  <div key={door.name}>
                    <div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-bold text-slate-700">{door.name}</span><span className="font-black text-violet-700">{door.people}</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${index === 0 ? 'bg-gradient-to-r from-violet-600 to-indigo-500' : 'bg-violet-300'}`} style={{ width: `${(door.people / peakDoorPeople) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3"><h2 className="flex items-center gap-2 text-base font-extrabold text-slate-950"><Sparkles className="h-5 w-5 text-amber-500" /> Últimos ingresos</h2><span className="text-[10px] font-bold text-emerald-600">● EN VIVO</span></div>
            {logs.length === 0 ? <div className="py-8 text-center text-slate-400"><p className="text-xs">Esperando el primer ingreso.</p></div> : (
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {logs.slice(0, 6).map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5">
                    <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{log.studentName}</p><p className="truncate text-[10px] font-medium text-slate-500">{log.course} · {log.doorName}</p></div>
                    <div className="shrink-0 text-right"><span className={`rounded-md px-2 py-1 text-[10px] font-black ${log.isExtra ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>{log.isExtra ? '+1 extra' : `+${log.count}`}</span><p className="mt-1 font-mono text-[9px] text-slate-400">{log.formattedTime}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-slate-900">{stats.capacityPercentage}%</p><p className="text-[10px] font-bold uppercase text-slate-500">Ocupación total</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-slate-900">{stats.averageGroup}</p><p className="text-[10px] font-bold uppercase text-slate-500">Personas por familia</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-violet-700">{stats.extraGuests}</p><p className="text-[10px] font-bold uppercase text-slate-500">Cupos extra activos</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-slate-900">{stats.doorsList.length}</p><p className="text-[10px] font-bold uppercase text-slate-500">Puertas con actividad</p></div>
      </section>
    </div>
  );
}
