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
  CheckCircle2,
  SlidersHorizontal,
  UserCheck,
  UserX,
  X
} from 'lucide-react';
import { getCapacityState, normalizeCapacityValue } from '../services/checkinPolicy';
import { createStudentCodeGenerator } from '../services/studentCodes';

const BULK_IMPORT_TEMPLATE_PATH = '/Plantilla_Carga_Masiva_MundoPalabra.xlsx';

export default function StudentsManager({ 
  students, 
  onSaveStudents, 
  onDeleteStudents,
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
  const [bulkCapacity, setBulkCapacity] = useState(5);
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentCapacity, setStudentCapacity] = useState(5);
  const [isSaving, setIsSaving] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState('');

  const showStatus = (message) => {
    setImportStatus(message);
    setTimeout(() => setImportStatus(null), 4000);
  };

  const persistStudents = async (updatedStudents, successMessage) => {
    setIsSaving(true);
    try {
      await onSaveStudents(updatedStudents);
      showStatus(successMessage);
      return true;
    } catch (error) {
      console.error(error);
      alert(`No fue posible guardar el cambio: ${error.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkCapacity = async () => {
    const nextCapacity = normalizeCapacityValue(bulkCapacity, -1);
    const editableStudents = students.filter((student) => !getCapacityState(student).isRetired);
    const highestEntered = editableStudents.reduce(
      (highest, student) => Math.max(highest, getCapacityState(student).enteredCount),
      0
    );

    if (nextCapacity < 1 || nextCapacity > 50) {
      alert('La cantidad de cupos debe estar entre 1 y 50.');
      return;
    }
    if (nextCapacity < highestEntered) {
      alert(`No puedes asignar ${nextCapacity} cupos porque ya existe un alumno con ${highestEntered} ingresos registrados.`);
      return;
    }
    if (!window.confirm(`¿Cambiar el cupo a ${nextCapacity} para ${editableStudents.length} estudiantes?`)) return;

    await persistStudents(
      students.map((student) => (
        getCapacityState(student).isRetired
          ? student
          : { ...student, maxCapacity: nextCapacity }
      )),
      `Cupo actualizado a ${nextCapacity} para ${editableStudents.length} estudiantes.`
    );
  };

  const openCapacityEditor = (student) => {
    setEditingStudent(student);
    setStudentCapacity(getCapacityState(student).maxCapacity);
  };

  const handleStudentCapacity = async (event) => {
    event.preventDefault();
    if (!editingStudent) return;
    const capacity = getCapacityState(editingStudent);
    const nextCapacity = normalizeCapacityValue(studentCapacity, -1);

    if (nextCapacity < Math.max(1, capacity.enteredCount) || nextCapacity > 50) {
      alert(`El cupo debe estar entre ${Math.max(1, capacity.enteredCount)} y 50.`);
      return;
    }

    const saved = await persistStudents(
      students.map((student) => (
        student.id === editingStudent.id
          ? { ...student, maxCapacity: nextCapacity }
          : student
      )),
      `Cupo de ${editingStudent.name} actualizado a ${nextCapacity}.`
    );
    if (saved) setEditingStudent(null);
  };

  const handleToggleStudent = async (student) => {
    const willDisable = student.disabled !== true;
    if (willDisable && !window.confirm(`¿Deshabilitar a ${student.name}? Su QR dejará de permitir ingresos.`)) return;

    await persistStudents(
      students.map((current) => (
        current.id === student.id ? { ...current, disabled: willDisable } : current
      )),
      willDisable
        ? `${student.name} fue deshabilitado.`
        : `${student.name} fue reactivado.`
    );
  };

  const deleteRosterStudents = async (studentsToDelete, successMessage) => {
    setIsSaving(true);
    try {
      await onDeleteStudents(studentsToDelete.map((student) => student.id));
      showStatus(successMessage);
      return true;
    } catch (error) {
      console.error(error);
      alert(`No fue posible eliminar: ${error.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStudent = async (student) => {
    const entered = getCapacityState(student).enteredCount;
    const historyMessage = entered > 0
      ? ` Tiene ${entered} ingreso${entered === 1 ? '' : 's'} registrado${entered === 1 ? '' : 's'}; la bitácora histórica se conservará.`
      : '';
    if (!window.confirm(`¿Eliminar de la nómina a ${student.name} de ${student.course}? Su QR dejará de estar disponible.${historyMessage}`)) return;

    await deleteRosterStudents([student], `${student.name} fue eliminado de la nómina.`);
  };

  const courses = [...new Set(students.map((student) => student.course).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  const handleDeleteCourse = async () => {
    const courseStudents = students.filter((student) => student.course === courseToDelete);
    if (!courseStudents.length) {
      alert('Selecciona un curso con estudiantes.');
      return;
    }

    const registeredEntries = courseStudents.reduce(
      (total, student) => total + getCapacityState(student).enteredCount,
      0
    );
    const historyMessage = registeredEntries > 0
      ? ` La bitácora conservará ${registeredEntries} ingreso${registeredEntries === 1 ? '' : 's'} histórico${registeredEntries === 1 ? '' : 's'}.`
      : '';
    if (!window.confirm(`¿Eliminar de la nómina el curso ${courseToDelete} y sus ${courseStudents.length} estudiante${courseStudents.length === 1 ? '' : 's'}?${historyMessage}`)) return;

    const deleted = await deleteRosterStudents(
      courseStudents,
      `El curso ${courseToDelete} y sus ${courseStudents.length} estudiantes fueron eliminados.`
    );
    if (deleted) setCourseToDelete('');
  };

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

    // Use a time-based suffix so a newly created student cannot reuse the
    // document ID of a soft-deleted record that is hidden from this roster.
    const nextId = `MP-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    const studentObj = {
      id: nextId,
      name: newStudent.name.trim(),
      course: newStudent.course.trim(),
      maxCapacity: Math.max(1, normalizeCapacityValue(newStudent.maxCapacity)),
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
        const importRows = XLSX.utils.sheet_to_json(sheet);

        if (importRows.length === 0) {
          alert("El archivo no contiene estudiantes para importar. Completa al menos una fila.");
          return;
        }

        const generateStudentCode = createStudentCodeGenerator(students);
        const newEntries = importRows.map((row, idx) => {
          const name = row['Nombre'] || row['Estudiante'] || row['Alumno'] || row['Nombre Estudiante'] || `Estudiante ${idx + 1}`;
          const course = row['Curso'] || row['Nivel'] || 'General';
          const rawCapacity = row['Capacidad'] ?? row['Cupos'] ?? row['Maximo'];
          const maxCap = normalizeCapacityValue(rawCapacity);

          return {
            id: generateStudentCode(),
            name: String(name),
            course: String(course),
            maxCapacity: maxCap,
            enteredCount: 0,
            status: maxCap === 0 ? 'RETIRADO' : 'PENDIENTE'
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
            Administra los alumnos autorizados, descarga la plantilla e importa la nómina completada
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Downloadable bulk import template */}
          <a
            href={BULK_IMPORT_TEMPLATE_PATH}
            download="Plantilla_Carga_Masiva_MundoPalabra.xlsx"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Descargar plantilla Excel</span>
          </a>

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

      {/* Global capacity administration */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-indigo-950">
              <SlidersHorizontal className="h-4 w-4" />
              Cambiar cupos de todos los estudiantes
            </h2>
            <p className="mt-1 text-xs text-indigo-700">
              Se aplica a estudiantes activos y deshabilitados; no modifica a quienes figuran como retirados.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="bulk-capacity" className="mb-1 block text-xs font-bold text-indigo-900">Cupos por alumno</label>
              <input
                id="bulk-capacity"
                type="number"
                min="1"
                max="50"
                value={bulkCapacity}
                onChange={(event) => setBulkCapacity(event.target.value)}
                className="w-28 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleBulkCapacity}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-indigo-600 disabled:cursor-wait disabled:opacity-60"
            >
              {isSaving ? 'Guardando…' : 'Aplicar a todos'}
            </button>
          </div>
        </div>
      </div>

      {/* Course deletion */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-rose-950">
              <Trash2 className="h-4 w-4" />
              Eliminar un curso completo
            </h2>
            <p className="mt-1 text-xs text-rose-700">
              Elimina a todos sus estudiantes y credenciales QR. La bitácora de ingresos se conserva.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="course-to-delete" className="mb-1 block text-xs font-bold text-rose-900">Curso</label>
              <select
                id="course-to-delete"
                value={courseToDelete}
                onChange={(event) => setCourseToDelete(event.target.value)}
                className="min-w-48 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-300"
              >
                <option value="">Seleccionar curso…</option>
                {courses.map((course) => (
                  <option key={course} value={course}>
                    {course} ({students.filter((student) => student.course === course).length})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!courseToDelete || isSaving}
              onClick={handleDeleteCourse}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar curso
            </button>
          </div>
        </div>
      </div>

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
                  const capacity = getCapacityState(s);
                  const maxCap = capacity.maxCapacity;
                  const entered = capacity.enteredCount;
                  const isFull = capacity.isFull;
                  const isDisabled = capacity.isDisabled;

                  return (
                    <tr key={s.id} className={`transition-colors ${isDisabled ? 'bg-slate-100/80 opacity-75' : 'hover:bg-slate-50/70'}`}>
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
                          isDisabled
                            ? 'bg-slate-700 text-white'
                            : isFull
                            ? 'bg-rose-100 text-rose-800'
                            : entered > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isDisabled ? 'DESHABILITADO' : isFull ? 'COMPLETO' : entered > 0 ? 'PARCIAL' : 'PENDIENTE'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => openCapacityEditor(s)}
                          disabled={capacity.isRetired || isSaving}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                          title="Modificar cupos de este estudiante"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Cupos</span>
                        </button>
                        <button
                          onClick={() => handleToggleStudent(s)}
                          disabled={capacity.isRetired || isSaving}
                          className={`px-2.5 py-1 font-bold rounded-lg transition-colors inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40 ${isDisabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                          title={isDisabled ? 'Reactivar estudiante' : 'Deshabilitar estudiante'}
                        >
                          {isDisabled ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                          <span>{isDisabled ? 'Activar' : 'Deshabilitar'}</span>
                        </button>
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
                          disabled={capacity.isAccessBlocked}
                          className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                        >
                          Ingreso
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(s)}
                          disabled={isSaving}
                          className="px-2.5 py-1 bg-rose-700 hover:bg-rose-600 disabled:cursor-wait disabled:opacity-50 text-white font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                          title="Eliminar estudiante de la nómina"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
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

      {/* Modal: edit individual capacity */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Modificar cupos</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{editingStudent.name}</p>
              </div>
              <button type="button" onClick={() => setEditingStudent(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleStudentCapacity} className="mt-5 space-y-4">
              <div>
                <label htmlFor="student-capacity" className="mb-1.5 block text-xs font-bold text-slate-700">Cantidad máxima de personas</label>
                <input
                  id="student-capacity"
                  type="number"
                  min={Math.max(1, getCapacityState(editingStudent).enteredCount)}
                  max="50"
                  required
                  autoFocus
                  value={studentCapacity}
                  onChange={(event) => setStudentCapacity(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Ya se registraron {getCapacityState(editingStudent).enteredCount} ingresos; el cupo no puede quedar por debajo de esa cantidad.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingStudent(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
                <button type="submit" disabled={isSaving} className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-sky-500 disabled:cursor-wait disabled:opacity-60">
                  {isSaving ? 'Guardando…' : 'Guardar cupos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
