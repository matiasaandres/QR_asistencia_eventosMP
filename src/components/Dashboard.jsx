import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  DoorClosed,
  FileSpreadsheet,
  FileText,
  Gauge,
  GraduationCap,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users
} from 'lucide-react';
import { exportToExcel } from '../services/export';
import { getCapacityState } from '../services/checkinPolicy';
import { getUniqueCapacityStudents } from '../services/familyPolicy';
import PendingFamilies from './PendingFamilies.jsx';
import OrganizationLogo from './OrganizationLogo.jsx';

const clampPercentage = (value) => Math.min(100, Math.max(0, value));

function MetricCard({ label, value, detail, icon: Icon, tone = 'sky', progress }) {
  const tones = {
    sky: { line: 'from-sky-500 to-cyan-500', icon: 'bg-sky-50 text-sky-700' },
    emerald: { line: 'from-emerald-500 to-teal-500', icon: 'bg-emerald-50 text-emerald-700' },
    amber: { line: 'from-amber-500 to-orange-500', icon: 'bg-amber-50 text-amber-700' },
    violet: { line: 'from-violet-500 to-indigo-500', icon: 'bg-violet-50 text-violet-700' }
  };
  const colors = tones[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] transition duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${colors.line}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>
          {Number.isFinite(progress) && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full bg-gradient-to-r ${colors.line}`} style={{ width: `${clampPercentage(progress)}%` }} /></div>}
        </div>
        <div className={`rounded-xl p-2.5 ${colors.icon}`}><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

export default function Dashboard({ event, students, logs, analytics, organization, onFetchAllLogs }) {
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const handleDownloadReport = async () => {
    if (reportBusy) return;
    setReportBusy(true);
    setReportError('');
    try {
      const { downloadManagementReport } = await import('../services/managementReport.js');
      const completeLogs = onFetchAllLogs ? await onFetchAllLogs() : logs;
      await downloadManagementReport({ event, students, logs: completeLogs, organization });
    } catch (error) {
      console.error('No se pudo generar el informe PDF', error);
      setReportError('No se pudo generar el informe PDF. Intenta descargarlo nuevamente.');
    } finally {
      setReportBusy(false);
    }
  };
  const stats = useMemo(() => {
    const activeStudents = students.filter((student) => !getCapacityState(student).isAccessBlocked);
    const totalStudents = activeStudents.length;
    const capacityGroups = getUniqueCapacityStudents(activeStudents);
    const totalFamilies = capacityGroups.length;
    let familiesEntered = 0;
    let totalPeopleEntered = 0;
    let totalCapacity = 0;
    let completeFamilies = 0;
    let partialFamilies = 0;
    const courseMap = {};

    capacityGroups.forEach((student) => {
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

    const familiesPending = Math.max(0, totalFamilies - familiesEntered);
    const attendancePercentage = totalFamilies > 0 ? Math.round((familiesEntered / totalFamilies) * 100) : 0;
    const capacityPercentage = totalCapacity > 0 ? Math.round((totalPeopleEntered / totalCapacity) * 100) : 0;

    const doorMap = {};
    logs.forEach((log) => {
      const doorName = log.doorName || 'Sin puerta';
      if (!doorMap[doorName]) doorMap[doorName] = { name: doorName, records: 0, people: 0, exits: 0, reentries: 0, movements: 0 };
      const count = Math.max(0, Number(log.count) || 0);
      const admissions = log.movementType === 'EXIT' ? 0 : Math.max(0, Number(log.newAdmissions ?? (log.movementType === 'REENTRY' ? 0 : count)) || 0);
      doorMap[doorName].records += 1;
      doorMap[doorName].people += admissions;
      doorMap[doorName].exits += log.movementType === 'EXIT' ? count : 0;
      doorMap[doorName].reentries += log.movementType === 'REENTRY' ? Math.max(0, Number(log.reentries ?? (count - admissions)) || 0) : 0;
      doorMap[doorName].movements += count;
    });

    const hourMap = {};
    logs.forEach((log) => {
      const date = new Date(log.timestamp);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}`;
      if (!hourMap[key]) {
        hourMap[key] = { key, label: `${String(date.getHours()).padStart(2, '0')}:00`, people: 0, records: 0 };
      }
      hourMap[key].people += log.movementType === 'EXIT' ? 0 : Math.max(0, Number(log.newAdmissions ?? (log.movementType === 'REENTRY' ? 0 : log.count)) || 0);
      hourMap[key].records += 1;
    });

    const recentDoors = Object.values(doorMap).sort((a, b) => b.people - a.people);
    const recentHours = Object.values(hourMap).sort((a, b) => a.key.localeCompare(b.key)).slice(-8);
    const analyticsIsCurrent = Boolean(analytics?.ready)
      && (!logs[0]?.id || analytics.lastLogId === logs[0].id);
    return {
      totalStudents,
      totalFamilies,
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
      extraGuests: capacityGroups.filter((student) => getCapacityState(student).hasExtraGuest).length,
      coursesList: Object.values(courseMap).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })),
      totalRecords: analyticsIsCurrent ? analytics.totalRecords : logs.length,
      doorsList: analyticsIsCurrent ? analytics.doorsList : recentDoors,
      activityByHour: analyticsIsCurrent ? analytics.activityByHour : recentHours
    };
  }, [students, logs, analytics]);

  const peakHourlyPeople = Math.max(1, ...stats.activityByHour.map((hour) => hour.people));
  const peakDoorPeople = Math.max(1, ...stats.doorsList.map((door) => door.people));
  const completeStop = (stats.completeFamilies / Math.max(1, stats.totalFamilies)) * 100;
  const partialStop = ((stats.completeFamilies + stats.partialFamilies) / Math.max(1, stats.totalFamilies)) * 100;
  const familyDonut = { background: `conic-gradient(#10b981 0 ${completeStop}%, #38bdf8 0 ${partialStop}%, #e2e8f0 0 100%)` };
  const leadingCourse = stats.coursesList.reduce((best, course) => {
    const attendance = course.totalStudents > 0 ? Math.round(course.familiesEntered / course.totalStudents * 100) : 0;
    return !best || attendance > best.attendance ? { ...course, attendance } : best;
  }, null);
  const busiestDoor = stats.doorsList[0] || null;
  const brandColor = organization?.primaryColor || '#0284c7';
  const eventDate = event?.date ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(new Date(`${event.date}T12:00:00`)) : 'Fecha no definida';

  return (
    <div className="dashboard-shell mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6" style={{ '--school-brand': brandColor }}>
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
        <div className="absolute inset-y-0 right-0 w-2/3 opacity-90" style={{ background: `radial-gradient(circle at 72% 32%, ${brandColor}88, transparent 48%)` }} />
        <div className="absolute -bottom-28 -left-10 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <OrganizationLogo organization={organization} inverse className="h-16 w-16 rounded-2xl border border-white/20 shadow-xl sm:h-20 sm:w-20" iconClassName="h-9 w-9" />
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Datos en vivo
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold text-sky-100">{stats.totalRecords} movimientos</span>
            </div>
            <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.18em] text-white/55">{organization?.name || event?.institution || 'Acceso Escolar'}</p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-tight sm:text-4xl">{event?.name || 'Control de Acceso'}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/65"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {eventDate}</span><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {event?.doors?.length || 1} puntos de acceso</span></div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <button
            onClick={handleDownloadReport}
            disabled={reportBusy}
            aria-busy={reportBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-100 px-4 py-2.5 text-xs font-extrabold text-sky-950 shadow-lg transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >
            <FileText className="h-4 w-4" /> {reportBusy ? 'Generando informe…' : 'Informe PDF · Dirección y UTP'}
          </button>
          <button
            onClick={() => exportToExcel({ event, students, logs, organization })}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-lg transition hover:bg-sky-50 active:scale-95"
            title="Descargar resumen en formato Excel"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Descargar Excel
          </button>
          </div>
        </div>
      </section>
      {reportError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{reportError}</p>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Alumnos activos" value={stats.totalStudents} detail={`${stats.familiesEntered} familias presentes`} icon={Users} tone="sky" progress={stats.attendancePercentage} />
        <MetricCard label="Personas ingresadas" value={stats.totalPeopleEntered} detail={`de ${stats.totalCapacity} cupos autorizados`} icon={TrendingUp} tone="emerald" progress={stats.capacityPercentage} />
        <MetricCard label="Familias pendientes" value={stats.familiesPending} detail={`${stats.attendancePercentage}% ya registró llegada`} icon={Clock} tone="amber" progress={100 - stats.attendancePercentage} />
        <MetricCard label="Cupos disponibles" value={stats.availableCapacity} detail={`${stats.capacityPercentage}% de uso acumulado`} icon={Gauge} tone="violet" progress={100 - stats.capacityPercentage} />
      </section>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-900 p-3 text-white shadow-sm md:grid-cols-3">
        <div className="rounded-xl bg-white/[0.06] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Pulso operativo</p><p className="mt-2 text-lg font-black">{stats.attendancePercentage >= 75 ? 'Alta participación' : stats.attendancePercentage >= 40 ? 'Flujo en desarrollo' : 'Inicio de jornada'}</p><p className="mt-1 text-xs text-slate-400">{stats.attendancePercentage}% de las familias ya registró ingreso.</p></div>
        <div className="rounded-xl bg-white/[0.06] p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Curso destacado</p><ArrowUpRight className="h-4 w-4" style={{ color: brandColor }} /></div><p className="mt-2 truncate text-lg font-black">{leadingCourse?.name || 'Sin datos'}</p><p className="mt-1 text-xs text-slate-400">{leadingCourse ? `${leadingCourse.attendance}% de participación familiar` : 'Aún no hay cursos habilitados.'}</p></div>
        <div className="rounded-xl bg-white/[0.06] p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Acceso más activo</p><DoorClosed className="h-4 w-4" style={{ color: brandColor }} /></div><p className="mt-2 truncate text-lg font-black">{busiestDoor?.name || 'Sin movimientos'}</p><p className="mt-1 text-xs text-slate-400">{busiestDoor ? `${busiestDoor.people} personas registradas` : 'Esperando el primer ingreso.'}</p></div>
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">de {stats.totalFamilies}</span>
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
            <div><h2 className="flex items-center gap-2 text-base font-extrabold text-slate-950"><GraduationCap className="h-5 w-5 text-sky-600" /> Rendimiento por curso</h2><p className="mt-1 text-sm text-slate-600">Consulta cuántas familias llegaron y cuántas personas ingresaron.</p></div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{stats.coursesList.length} cursos</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">Una familia cuenta como presente cuando ingresa al menos una persona. Los cupos indican el total de personas autorizadas para el curso.</p>
          <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {stats.coursesList.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Los cursos aparecerán cuando haya alumnos habilitados en la nómina.</p>}
            {stats.coursesList.map((course) => {
              const familiesPct = course.totalStudents > 0 ? Math.round((course.familiesEntered / course.totalStudents) * 100) : 0;
              const capacityPct = course.capacity > 0 ? Math.round((course.peopleEntered / course.capacity) * 100) : 0;
              return (
                <div key={course.name} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-sky-200 hover:bg-sky-50/40">
                  <h3 className="text-base font-extrabold text-slate-900">{course.name}</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-100 bg-white p-3">
                      <p className="text-sm font-bold text-slate-700">Familias presentes</p>
                      <p className="mt-1 text-sm text-slate-600"><strong className="text-2xl font-black text-slate-950">{course.familiesEntered}</strong> de {course.totalStudents} familias</p>
                      <p className="mt-2 text-xs font-semibold text-emerald-800">{familiesPct}% de las familias ya llegó</p>
                      <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${clampPercentage(familiesPct)}%` }} /></div>
                      <p className="mt-2 text-xs text-slate-600">Familias sin ingreso: <strong>{Math.max(0, course.totalStudents - course.familiesEntered)}</strong></p>
                    </div>
                    <div className="rounded-xl border border-sky-100 bg-white p-3">
                      <p className="text-sm font-bold text-slate-700">Personas que ingresaron</p>
                      <p className="mt-1 text-sm text-slate-600"><strong className="text-2xl font-black text-slate-950">{course.peopleEntered}</strong> de {course.capacity} personas autorizadas</p>
                      <p className="mt-2 text-xs font-semibold text-sky-800">{capacityPct}% de los cupos utilizados</p>
                      <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${clampPercentage(capacityPct)}%` }} /></div>
                      <p className="mt-2 text-xs text-slate-600">Cupos disponibles: <strong>{Math.max(0, course.capacity - course.peopleEntered)}</strong></p>
                    </div>
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

      <PendingFamilies students={students} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-slate-900">{stats.capacityPercentage}%</p><p className="text-[10px] font-bold uppercase text-slate-500">Ocupación total</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-slate-900">{stats.averageGroup}</p><p className="text-[10px] font-bold uppercase text-slate-500">Personas por familia</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-violet-700">{stats.extraGuests}</p><p className="text-[10px] font-bold uppercase text-slate-500">Cupos extra activos</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-2xl font-black text-slate-900">{stats.doorsList.length}</p><p className="text-[10px] font-bold uppercase text-slate-500">Puertas con actividad</p></div>
      </section>
    </div>
  );
}
