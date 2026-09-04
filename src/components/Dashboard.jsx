import React, { useMemo } from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  FileSpreadsheet, 
  TrendingUp, 
  GraduationCap, 
  DoorClosed,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { exportToExcel } from '../services/export';

export default function Dashboard({ 
  event, 
  students, 
  logs 
}) {
  // Compute Key Metrics
  const stats = useMemo(() => {
    const totalStudents = students.length;
    let familiesEntered = 0;
    let totalPeopleEntered = 0;

    students.forEach((s) => {
      const entered = Number(s.enteredCount) || 0;
      if (entered > 0) {
        familiesEntered += 1;
        totalPeopleEntered += entered;
      }
    });

    const familiesPending = Math.max(0, totalStudents - familiesEntered);
    const attendancePercentage = totalStudents > 0 ? Math.round((familiesEntered / totalStudents) * 100) : 0;

    // By course breakdown
    const courseMap = {};
    students.forEach((s) => {
      const c = s.course || 'Sin Curso';
      if (!courseMap[c]) {
        courseMap[c] = {
          name: c,
          totalStudents: 0,
          familiesEntered: 0,
          peopleEntered: 0
        };
      }
      courseMap[c].totalStudents += 1;
      const count = Number(s.enteredCount) || 0;
      if (count > 0) {
        courseMap[c].familiesEntered += 1;
        courseMap[c].peopleEntered += count;
      }
    });

    const coursesList = Object.values(courseMap).sort((a, b) => a.name.localeCompare(b.name));

    return {
      totalStudents,
      familiesEntered,
      familiesPending,
      totalPeopleEntered,
      attendancePercentage,
      coursesList
    };
  }, [students]);

  const handleExport = () => {
    exportToExcel({ event, students, logs });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner with Title and Export Button */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Monitor en Tiempo Real
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
            {event?.name || 'Control de Acceso'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Actualización automática e instantánea desde todos los celulares en portería.
          </p>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-95"
          title="Descargar resumen en formato Excel"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Descargar Planilla Excel</span>
        </button>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Estudiantes */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estudiantes</span>
            <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900">{stats.totalStudents}</div>
            <p className="text-xs text-slate-500 mt-1">Total registrados</p>
          </div>
        </div>

        {/* Familias con Asistencia */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Familias con Ingreso</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-emerald-700">{stats.familiesEntered}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${stats.attendancePercentage}%` }} 
                />
              </div>
              <span className="text-xs font-bold text-emerald-700">{stats.attendancePercentage}%</span>
            </div>
          </div>
        </div>

        {/* Familias Pendientes */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Familias Pendientes</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-700">{stats.familiesPending}</div>
            <p className="text-xs text-slate-500 mt-1">Aún no registran llegada</p>
          </div>
        </div>

        {/* Total Personas Ingresadas */}
        <div className="bg-gradient-to-br from-sky-600 to-indigo-700 rounded-2xl p-5 shadow-lg shadow-sky-600/20 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-sky-100 uppercase tracking-wider">Total Personas</span>
            <div className="p-2 bg-white/20 text-white rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-white">{stats.totalPeopleEntered}</div>
            <p className="text-xs text-sky-100 mt-1">Asistentes en el recinto</p>
          </div>
        </div>
      </div>

      {/* Grid: Course breakdown & Live feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance by Course (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-sky-600" />
              Asistencia por Curso
            </h2>
            <span className="text-xs text-slate-500">Familias presentes y asistentes</span>
          </div>

          <div className="space-y-3">
            {stats.coursesList.map((course) => {
              const pct = course.totalStudents > 0 
                ? Math.round((course.familiesEntered / course.totalStudents) * 100) 
                : 0;
              return (
                <div key={course.name} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-900 font-extrabold text-sm">{course.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">
                        {course.familiesEntered} de {course.totalStudents} familias ({pct}%)
                      </span>
                      <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md font-bold text-[11px]">
                        {course.peopleEntered} personas
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live check-in feed (1 col) */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-sky-600" />
              Últimos Ingresos
            </h2>
            <span className="text-xs font-semibold text-emerald-600 animate-pulse">● En Vivo</span>
          </div>

          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <DoorClosed className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Aún no se han registrado ingresos en este evento.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {logs.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100 transition-colors flex items-start justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 leading-tight">
                        {log.studentName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <span>{log.course}</span>
                      <span>•</span>
                      <span className="text-slate-400">{log.doorName}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-xs">
                      +{log.count} pers.
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      {log.formattedTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
