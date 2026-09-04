import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { 
  Printer, 
  Download, 
  X, 
  School, 
  Users, 
  Check, 
  ArrowLeft,
  Share2
} from 'lucide-react';

export default function QRCardPrinter({ 
  students, 
  selectedStudent = null, 
  event, 
  onClose 
}) {
  const [qrImages, setQrImages] = useState({});
  const [isGenerating, setIsGenerating] = useState(true);

  // List of students to render (single student or all students)
  const studentsToPrint = selectedStudent ? [selectedStudent] : students;

  // Generate QR Data URLs
  useEffect(() => {
    let isCancelled = false;
    const generateAll = async () => {
      setIsGenerating(true);
      const map = {};

      for (const s of studentsToPrint) {
        try {
          // The QR code contains ONLY the unique internal identifier as requested!
          const url = await QRCode.toDataURL(s.id, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 280,
            color: {
              dark: '#0f172a',
              light: '#ffffff'
            }
          });
          map[s.id] = url;
        } catch (err) {
          console.error("Error generating QR for student", s.id, err);
        }
      }

      if (!isCancelled) {
        setQrImages(map);
        setIsGenerating(false);
      }
    };

    generateAll();

    return () => {
      isCancelled = true;
    };
  }, [studentsToPrint]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSingle = (studentId, studentName) => {
    const dataUrl = qrImages[studentId];
    if (!dataUrl) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    const cleanName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `QR_${cleanName}_${studentId}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
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
              {selectedStudent ? 'Credencial QR de Estudiante' : 'Impresión de Tarjetas QR en Lote'}
            </h2>
            <p className="text-xs text-slate-500">
              {studentsToPrint.length} tarjeta(s) lista(s) para imprimir o distribuir
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {selectedStudent && (
            <button
              onClick={() => handleDownloadSingle(selectedStudent.id, selectedStudent.name)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Descargar Imagen PNG</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            disabled={isGenerating}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/30 transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Tarjetas (PDF)</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Cards Grid */}
      <div className="max-w-4xl w-full grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4 print:max-w-none print:w-full">
        {studentsToPrint.map((student) => {
          const maxCap = student.maxCapacity || 5;
          const qrUrl = qrImages[student.id];

          return (
            <div
              key={student.id}
              className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-lg flex flex-col justify-between print:shadow-none print:border-dashed print:border-2 print:border-slate-400 print:rounded-xl print:p-4 print:break-inside-avoid relative overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-xs">
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

              {/* Body: Student name & QR */}
              <div className="my-4 text-center">
                <h4 className="font-extrabold text-lg text-slate-900 leading-snug">
                  {student.name}
                </h4>
                <p className="text-xs font-mono font-bold text-slate-500 mt-0.5">
                  ID: {student.id}
                </p>

                {/* QR Container */}
                <div className="my-3 inline-block bg-white p-2.5 rounded-2xl border border-slate-200 shadow-inner">
                  {qrUrl ? (
                    <img
                      src={qrUrl}
                      alt={`Código QR para ${student.name}`}
                      className="w-40 h-40 object-contain mx-auto"
                    />
                  ) : (
                    <div className="w-40 h-40 flex items-center justify-center text-xs text-slate-400">
                      Generando QR...
                    </div>
                  )}
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
