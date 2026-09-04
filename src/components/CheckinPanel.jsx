import React, { useState } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  User, 
  GraduationCap, 
  Users, 
  Clock, 
  DoorClosed, 
  ArrowRight,
  ShieldCheck,
  AlertOctagon
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../services/sound';

export default function CheckinPanel({ 
  student, 
  currentDoor, 
  onConfirmCheckIn, 
  onClose 
}) {
  const [selectedCount, setSelectedCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  if (!student) return null;

  const parsedCapacity = Number(student.maxCapacity);
  const maxCap = Number.isFinite(parsedCapacity) ? Math.max(0, parsedCapacity) : 5;
  const entered = Number(student.enteredCount) || 0;
  const remaining = Math.max(0, maxCap - entered);
  const isFull = remaining <= 0;
  const remainingAfterSelection = Math.max(0, remaining - selectedCount);

  // Handle immediate registration
  const handleRegister = async (countToRegister) => {
    if (countToRegister > remaining || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await onConfirmCheckIn({
        studentId: student.id,
        count: countToRegister,
        doorName: currentDoor
      });

      sounds.playSuccess();
      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.7 }
        });
      } catch (e) {}

      setSuccessMessage({
        count: countToRegister,
        total: result?.newEntered || (entered + countToRegister),
        remaining: result?.remaining ?? (remaining - countToRegister)
      });

      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err) {
      alert("Error al registrar ingreso: " + err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
        
        {/* Header with Status Banner */}
        <div className={`p-5 text-white ${
          isFull 
            ? 'bg-gradient-to-r from-rose-600 to-red-700' 
            : 'bg-gradient-to-r from-emerald-600 to-teal-700'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              {isFull ? (
                <div className="p-2 bg-white/15 rounded-xl">
                  <AlertOctagon className="w-7 h-7 text-white animate-pulse" />
                </div>
              ) : (
                <div className="p-2 bg-white/15 rounded-xl">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
              )}
              <div>
                <h3 className="font-extrabold text-xl tracking-tight leading-tight">
                  {isFull ? 'CUPO COMPLETO' : 'ACCESO DISPONIBLE'}
                </h3>
                <p className="text-xs text-white/80 font-medium">
                  {isFull 
                    ? `Ya se registraron ${entered} de ${maxCap} personas autorizadas` 
                    : `Disponibles: ${remaining} de ${maxCap} personas autorizadas`
                  }
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-lg bg-black/10 hover:bg-black/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Student Info Card */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 uppercase tracking-wider mb-1">
                  <GraduationCap className="w-4 h-4" />
                  <span>{student.course || 'Sin Curso'}</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 leading-snug">
                  {student.name}
                </h2>
                <span className="inline-block mt-1 text-xs font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-semibold">
                  Cód: {student.id}
                </span>
              </div>
            </div>

            {/* Capacity Progress Bar */}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
                <span className="text-slate-600">Ingresados: {entered} de {maxCap}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isFull ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {remaining} cupos restantes
                </span>
              </div>
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
                {Array.from({ length: maxCap }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 border-r last:border-r-0 border-white/50 transition-all duration-300 ${
                      idx < entered
                        ? 'bg-amber-500'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Current Door badge */}
          <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-100/70 px-3.5 py-2 rounded-lg">
            <div className="flex items-center gap-1.5 font-medium">
              <DoorClosed className="w-4 h-4 text-slate-600" />
              <span>Registrando en: <strong className="text-slate-800">{currentDoor}</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          {/* Success Flash */}
          {successMessage ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 text-center animate-in zoom-in-95 duration-150">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1.5 animate-bounce" />
              <p className="font-bold text-base">
                ¡Ingreso de {successMessage.count} persona(s) registrado!
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Total acumulado: {successMessage.total} de {maxCap} • Restan {successMessage.remaining} cupos
              </p>
            </div>
          ) : isFull ? (
            /* Warning Screen if Cupo Completo */
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
              <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h4 className="font-bold text-rose-900 text-base">Capacidad Máxima Alcanzada</h4>
              <p className="text-xs text-rose-700 mt-1 max-w-sm mx-auto">
                No existen más cupos disponibles asociados a este estudiante. Se alcanzó el máximo de {maxCap} personas autorizadas.
              </p>
              <button
                onClick={onClose}
                className="mt-4 w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                Volver al Escáner
              </button>
            </div>
          ) : (
            /* Person Count Selection Buttons */
            <div>
              <p className="text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-600" />
                ¿Cuántas personas están ingresando en este momento?
              </p>

              {/* Select first, then confirm to prevent accidental check-ins. */}
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((num) => {
                  const isAvailable = num <= remaining;
                  return (
                    <button
                      key={num}
                      type="button"
                      disabled={!isAvailable || isSubmitting}
                      onClick={() => setSelectedCount(num)}
                      className={`h-16 flex flex-col items-center justify-center rounded-xl font-bold transition-all ${
                        selectedCount === num && isAvailable
                          ? 'bg-sky-600 border-2 border-sky-600 text-white ring-2 ring-sky-200 shadow-sm'
                          : isAvailable
                          ? 'bg-sky-50 border-2 border-sky-300 text-sky-900 hover:bg-sky-600 hover:border-sky-600 hover:text-white active:scale-95 shadow-sm'
                          : 'bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <span className="text-xl leading-none">{num}</span>
                      <span className="text-[10px] uppercase font-semibold tracking-tight mt-1">
                        {num === 1 ? 'persona' : 'personas'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-center">
                <p className="text-sm font-bold text-sky-950">
                  Ingresarán {selectedCount} {selectedCount === 1 ? 'persona' : 'personas'}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-sky-700">
                  Después de registrar quedarán {remainingAfterSelection} de {maxCap} cupos disponibles.
                </p>
              </div>

              <button
                type="button"
                disabled={isSubmitting || selectedCount > remaining}
                onClick={() => handleRegister(selectedCount)}
                className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Registrando de forma segura…'
                  : `Confirmar ingreso de ${selectedCount} ${selectedCount === 1 ? 'persona' : 'personas'}`}
              </button>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Solo se pueden registrar hasta {remaining} persona(s) más.</span>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-slate-500 hover:text-slate-700 underline font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
