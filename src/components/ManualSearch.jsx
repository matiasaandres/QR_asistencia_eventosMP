import React, { useState, useMemo } from 'react';
import { 
  Search, 
  User, 
  GraduationCap, 
  CheckCircle, 
  AlertCircle, 
  Users, 
  UserCheck, 
  Filter,
  QrCode
} from 'lucide-react';

export default function ManualSearch({ 
  students, 
  onSelectStudent,
  onViewQR
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, AVAILABLE, FULL, PENDING

  // Extract unique courses
  const courses = useMemo(() => {
    const list = Array.from(new Set(students.map((s) => s.course).filter(Boolean)));
    return list.sort();
  }, [students]);

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = 
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.course && s.course.toLowerCase().includes(term)) ||
        (s.id && s.id.toLowerCase().includes(term));

      const matchesCourse = selectedCourse === 'ALL' || s.course === selectedCourse;

      const maxCap = Number(s.maxCapacity) || 5;
      const entered = Number(s.enteredCount) || 0;
      const isFull = entered >= maxCap;
      const isPending = entered === 0;

      let matchesStatus = true;
      if (statusFilter === 'AVAILABLE') matchesStatus = !isFull;
      if (statusFilter === 'FULL') matchesStatus = isFull;
      if (statusFilter === 'PENDING') matchesStatus = isPending;

      return matchesSearch && matchesCourse && matchesStatus;
    });
  }, [students, searchTerm, selectedCourse, statusFilter]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      {/* Search Input Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-sky-600" />
            Búsqueda Manual de Estudiantes
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
            {filteredStudents.length} de {students.length} estudiantes
          </span>
        </div>

        {/* Input box */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Escribe el nombre, apellido, curso o código..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
            autoFocus
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-semibold px-2 py-1 bg-slate-200 rounded"
            >
              Borrar
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Course filter select */}
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="ALL">Todos los cursos</option>
            {courses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Status buttons */}
          <div className="flex gap-1 overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('AVAILABLE')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                statusFilter === 'AVAILABLE'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Con cupos
            </button>
            <button
              onClick={() => setStatusFilter('FULL')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                statusFilter === 'FULL'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Cupo completo
            </button>
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-2.5">
        {filteredStudents.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="font-bold text-slate-700 text-base">No se encontraron estudiantes</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Intenta buscar por otro término o verifica que el estudiante esté registrado en el sistema.
            </p>
          </div>
        ) : (
          filteredStudents.map((student) => {
            const maxCap = Number(student.maxCapacity) || 5;
            const entered = Number(student.enteredCount) || 0;
            const remaining = Math.max(0, maxCap - entered);
            const isFull = remaining <= 0;

            return (
              <div
                key={student.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/90 hover:border-sky-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                      {student.course}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {student.id}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base">
                    {student.name}
                  </h3>

                  {/* Progress Indicators */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-slate-600">
                      Asistentes: <strong className="text-slate-900">{entered}</strong> de {maxCap}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className={`font-semibold ${
                      isFull ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {isFull ? 'Cupo Completo' : `${remaining} disponible(s)`}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {onViewQR && (
                    <button
                      onClick={() => onViewQR(student)}
                      className="p-2.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-colors border border-slate-200"
                      title="Ver Código QR"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => onSelectStudent(student)}
                    className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      isFull
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                        : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-600/30'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{isFull ? 'Ver Estado' : 'Registrar Ingreso'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
