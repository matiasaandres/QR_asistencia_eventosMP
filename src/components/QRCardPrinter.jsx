import React, { useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { getCapacityState } from '../services/checkinPolicy';
import { createStudentQrArchive } from '../services/qrArchive';
import { 
  Printer, 
  Download, 
  X, 
  Users, 
  ArrowLeft
} from 'lucide-react';

// SVG is synchronous and survives multi-page browser printing more reliably than canvas.
function StudentQRGraphic({ studentId, size = 180 }) {
  const qr = useMemo(
    () => QRCode.create(String(studentId), { errorCorrectionLevel: 'M' }),
    [studentId]
  );

  const margin = 1;
  const viewBoxSize = qr.modules.size + (margin * 2);
  const darkModulesPath = useMemo(() => {
    let path = '';

    for (let row = 0; row < qr.modules.size; row += 1) {
      for (let column = 0; column < qr.modules.size; column += 1) {
        if (qr.modules.get(row, column)) {
          path += `M${column + margin} ${row + margin}h1v1h-1z`;
        }
      }
    }

    return path;
  }, [qr, margin]);

  return (
    <svg
      id={`qr-${studentId}`}
      data-print-qr="true"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      role="img"
      aria-label={`Código QR de ${studentId}`}
      className="mx-auto block rounded-xl"
      shapeRendering="crispEdges"
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
      <path d={darkModulesPath} fill="#0f172a" />
    </svg>
  );
}

export default function QRCardPrinter({ 
  students, 
  selectedStudent = null, 
  event, 
  onClose 
}) {
  const [filterCourse, setFilterCourse] = useState('ALL');
  const [archiveProgress, setArchiveProgress] = useState(null);
  const [archiveError, setArchiveError] = useState('');

  // If a single student was clicked, only show that student
  // Otherwise show students (filtered by course if selected)
  const courses = useMemo(() => {
    const list = Array.from(new Set(students.map((s) => s.course).filter(Boolean)));
    return list.sort();
  }, [students]);

  const studentsToPrint = useMemo(() => {
    if (selectedStudent) return [selectedStudent];
    if (filterCourse === 'ALL') return students;
    return students.filter((s) => s.course === filterCourse);
  }, [selectedStudent, students, filterCourse]);

  const handlePrint = async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    // Let the browser finish the current paint before opening the print preview.
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    window.print();
  };

  const handleDownloadPNG = async (studentId, studentName) => {
    try {
      const dataUrl = await QRCode.toDataURL(String(studentId), {
        width: 1000,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanName = (studentName || 'Estudiante').replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `QR_${cleanName}_${studentId}.png`;
      a.click();
    } catch (e) {
      console.error("Error downloading QR image:", e);
    }
  };

  const handleDownloadArchive = async () => {
    setArchiveError('');
    setArchiveProgress({ phase: 'pdfs', current: 0, total: students.length });

    try {
      const archive = await createStudentQrArchive({
        students,
        event,
        onProgress: setArchiveProgress
      });
      const blob = new Blob([archive.bytes], { type: 'application/zip' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = archive.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setArchiveProgress(null);
    } catch (error) {
      console.error('Error generating QR archive:', error);
      setArchiveError(error?.message || 'No fue posible crear el archivo ZIP.');
      setArchiveProgress(null);
    }
  };

  const archiveProgressLabel = archiveProgress?.phase === 'zip'
    ? `Comprimiendo ZIP ${archiveProgress.percent || 0}%`
    : archiveProgress
      ? `Creando PDF ${archiveProgress.current} de ${archiveProgress.total}`
      : 'Descargar ZIP: un PDF por alumno';

  return (
    <div className="qr-print-overlay fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 flex flex-col items-center animate-in fade-in duration-150">
      {/* Top Action Bar (Hidden during print) */}
      <div className="bg-white rounded-2xl p-4 shadow-xl border border-slate-200 max-w-4xl w-full mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {selectedStudent ? 'Credencial QR de Estudiante' : 'Impresión de Tarjetas QR'}
            </h2>
            <p className="text-xs text-slate-500">
              {studentsToPrint.length} tarjeta(s) lista(s) para imprimir o distribuir
            </p>
          </div>
        </div>

        {/* Filter by course if in batch mode */}
        {!selectedStudent && courses.length > 0 && (
          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700 rounded-xl px-3 py-2 focus:outline-none"
          >
            <option value="ALL">Todos los cursos ({students.length})</option>
            {courses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
          {selectedStudent && (
            <button
              onClick={() => handleDownloadPNG(selectedStudent.id, selectedStudent.name)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Descargar PNG</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            title={selectedStudent
              ? 'Abre la ventana para guardar esta credencial como PDF'
              : 'Abre la ventana para guardar todos los códigos QR como PDF'}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/30 transition-all active:scale-95"
          >
            {selectedStudent
              ? <Printer className="w-4 h-4" />
              : <Download className="w-4 h-4" />}
            <span>
              {selectedStudent
                ? 'Guardar tarjeta en PDF'
                : 'Descargar todos los QR en PDF'}
            </span>
          </button>

          {!selectedStudent && (
            <button
              onClick={handleDownloadArchive}
              disabled={Boolean(archiveProgress)}
              title="Crea una carpeta por curso y un PDF de una sola página por alumno"
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 disabled:cursor-wait text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/30 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>{archiveProgressLabel}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {archiveError && (
        <div className="no-print max-w-4xl w-full mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {archiveError}
        </div>
      )}

      {/* Printable Cards Grid */}
      <div className="qr-print-grid max-w-4xl w-full grid grid-cols-1 sm:grid-cols-2 gap-6 print:max-w-none print:w-full">
        {studentsToPrint.map((student) => {
          const maxCap = getCapacityState(student).maxCapacity;

          return (
            <div
              key={student.id}
              className="qr-print-card bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-lg flex flex-col justify-between print:shadow-none print:border-dashed print:border-2 print:border-slate-400 print:rounded-xl relative overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                    MP
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">MundoPalabra</h3>
                    <p className="text-[10px] text-slate-500 font-medium">{event?.name || 'Control de Acceso'}</p>
                  </div>
                </div>

                <span className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  {student.course}
                </span>
              </div>

              {/* Body: Student name & vector QR */}
              <div className="qr-print-body my-4 text-center">
                <h4 className="font-extrabold text-lg text-slate-900 leading-snug">
                  {student.name}
                </h4>
                <p className="text-xs font-mono font-bold text-slate-500 mt-0.5">
                  ID: {student.id}
                </p>

                {/* Vector QR container */}
                <div className="qr-print-code my-3 inline-block bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                  <StudentQRGraphic studentId={student.id} size={selectedStudent ? 200 : 160} />
                </div>

                {/* Capacity badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-800">
                  <Users className="w-3.5 h-3.5 text-amber-600" />
                  <span>Válido para hasta {maxCap} personas autorizadas</span>
                </div>
              </div>

              {/* Footer / Instructions */}
              <div className="border-t border-slate-100 pt-2.5 text-center text-[10px] text-slate-500 leading-relaxed">
                Presenta este código en el acceso al evento (impreso o en la pantalla de tu celular). Los ingresos pueden ser simultáneos o por separado.
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
