import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { 
  Users, 
  UserPlus, 
  Upload, 
  Printer, 
  Search, 
  QrCode, 
  Trash2, 
  Edit3, 
  FileSpreadsheet,
  AlertCircle,
  Plus,
  CheckCircle2
} from 'lucide-react';

export default function StudentsManager({ 
  students, 
  onSaveStudents, 
  onOpenCardPrinter, 
  onSelectStudent 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: '',
    course: '',
    maxCapacity: 5
  });
  const [importStatus, setImportStatus] = useState(null);

  const filteredStudents = students.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.course && s.course.toLowerCase().includes(term)) ||
      (s.id && s.id.toLowerCase().includes(term))
    );
  });

  const handleAddStudent = (e) => {
    e.preventDefault();
    if (!newStudent.name.trim() || !newStudent.course.trim()) return;

    const nextId = `MP-${new Date().getFullYear()}-${String(students.length + 1).padStart(3, '0')}`;
    const studentObj = {
      id: nextId,
      name: newStudent.name.trim(),
      course: newStudent.course.trim(),
      maxCapacity: Number(newStudent.maxCapacity) || 5,
      enteredCount: 0,
      status: 'PENDIENTE'
    };

    onSaveStudents([...students, studentObj]);
    setNewStudent({ name: '', course: '', maxCapacity: 5 });
    setShowAddModal(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (!rows || rows.length === 0) {
          alert("El archivo no contiene filas válidas.");
          return;
        }

        const newEntries = rows.map((row, idx) => {
          const name = row['Nombre'] || row['Estudiante'] || row['Alumno'] || row['Nombre Estudiante'] || `Estudiante ${idx + 1}`;
          const course = row['Curso'] || row['Nivel'] || 'General';
          const maxCap = Number(row['Capacidad'] || row['Cupos'] || row['Maximo'] || 5);
          const customId = row['Codigo'] || row['ID'] || `MP-${new Date().getFullYear()}-${String(students.length + idx + 1).padStart(3, '0')}`;

          return {
            id: String(customId),
            name: String(name),
            course: String(course),
            maxCapacity: maxCap,
            enteredCount: 0,
            status: 'PENDIENTE'
          };
        });

        // Merge keeping existing records if they have enteredCount
        const existingMap = new Map(students.map((s) => [s.id, s]));
        newEntries.forEach((entry) => {
          if (!existingMap.has(entry.id)) {
            existingMap.set(entry.id, entry);
          }
        });

        const updatedList = Array.from(existingMap.values());
        onSaveStudents(updatedList);
        setImportStatus(`¡Se importaron con éxito ${newEntries.length} estudiantes desde el archivo!`);
        setTimeout(() => setImportStatus(null), 4000);
      } catch (err) {
        console.error(err);
        alert("Error al leer el archivo Excel/CSV: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner and Actions */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-600" />
            Nómina de Estudiantes y Credenciales
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administra los alumnos autorizados y genera sus códigos QR institucionales
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* File Upload (Excel/CSV) */}
          <label className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Importar Excel / CSV</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {/* Add Student Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Estudiante</span>
          </button>

          {/* Print All Cards */}
          <button
            onClick={() => onOpenCardPrinter(null)}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/30 transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Tarjetas QR</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {importStatus && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2 text-xs font-bold animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{importStatus}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, curso o código..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Estudiante</th>
                <th className="py-3 px-4">Curso</th>
                <th className="py-3 px-4 text-center">Ingresados / Cupo</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    No se encontraron estudiantes.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const maxCap = Number(s.maxCapacity) || 5;
                  const entered = Number(s.enteredCount) || 0;
                  const isFull = entered >= maxCap;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {s.id}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {s.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-sky-50 text-sky-800 border border-sky-200 font-semibold px-2 py-0.5 rounded-md">
                          {s.course}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700">
                        {entered} de {maxCap}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isFull
                            ? 'bg-rose-100 text-rose-800'
                            : entered > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isFull ? 'COMPLETO' : entered > 0 ? 'PARCIAL' : 'PENDIENTE'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => onOpenCardPrinter(s)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-600 font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                          title="Ver o imprimir credencial QR"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Ver QR</span>
                        </button>
                        <button
                          onClick={() => onSelectStudent(s)}
                          className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg transition-colors"
                        >
                          Ingreso
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Student */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-extrabold text-lg text-slate-900">Agregar Estudiante</h3>
            <form onSubmit={handleAddStudent} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nombre Completo:</label>
                <input
                  type="text"
                  required
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="Ej: Martina Pérez Morales"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Curso:</label>
                <input
                  type="text"
                  required
                  value={newStudent.course}
                  onChange={(e) => setNewStudent({ ...newStudent, course: e.target.value })}
                  placeholder="Ej: Kínder A"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Capacidad Máxima Autorizada (personas):</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  required
                  value={newStudent.maxCapacity}
                  onChange={(e) => setNewStudent({ ...newStudent, maxCapacity: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-md shadow-sky-600/30"
                >
                  Guardar Estudiante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
