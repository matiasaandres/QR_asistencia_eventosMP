import React, { useState } from 'react';
import { 
  History, 
  Search, 
  DoorClosed, 
  Clock, 
  Calendar, 
  User, 
  Users,
  FileSpreadsheet
} from 'lucide-react';
import { exportToExcel } from '../services/export';

export default function HistoryLog({ 
  logs, 
  event, 
  students 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDoor, setSelectedDoor] = useState('ALL');

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      !term ||
      (log.studentName && log.studentName.toLowerCase().includes(term)) ||
      (log.course && log.course.toLowerCase().includes(term)) ||
      (log.studentId && log.studentId.toLowerCase().includes(term)) ||
      (log.guestName && log.guestName.toLowerCase().includes(term)) ||
      (log.relationship && log.relationship.toLowerCase().includes(term));

    const matchesDoor = selectedDoor === 'ALL' || log.doorName === selectedDoor;

    return matchesSearch && matchesDoor;
  });

  const doors = Array.from(new Set(logs.map((l) => l.doorName).filter(Boolean)));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-sky-600" />
            Bitácora de Ingresos Registrados
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro cronológico detallado de cada escaneo y acceso
          </p>
        </div>

        <button
          onClick={() => exportToExcel({ event, students, logs })}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Exportar a Excel</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar en el historial por estudiante, curso o código..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {doors.length > 0 && (
          <select
            value={selectedDoor}
            onChange={(e) => setSelectedDoor(e.target.value)}
            className="text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700 rounded-xl px-3 py-2 focus:outline-none"
          >
            <option value="ALL">Todas las puertas</option>
            {doors.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table of logs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Hora</th>
                <th className="py-3 px-4">Estudiante</th>
                <th className="py-3 px-4">Curso</th>
                <th className="py-3 px-4 text-center">Personas</th>
                <th className="py-3 px-4 text-center">Acumulado</th>
                <th className="py-3 px-4">Punto / Puerta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    No hay registros de ingreso que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-600 font-semibold whitespace-nowrap">
                      {log.formattedTime}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div>{log.studentName}</div>
                      {log.isExtra && (
                        <div className="mt-1 text-[11px] font-semibold text-violet-700">
                          Cupo extra: {log.guestName} ({log.relationship})
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-sky-50 text-sky-800 border border-sky-200 font-semibold px-2 py-0.5 rounded-md">
                        {log.course}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      <span className={`px-2 py-0.5 rounded-md ${
                        log.isExtra
                          ? 'bg-violet-100 text-violet-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {log.isExtra ? 'Extra +1' : `+${log.count}`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">
                      {log.accumulated} de {log.maxCapacity || 5}{log.isExtra ? ' + 1 extra' : ''}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {log.doorName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
