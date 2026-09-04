import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  X, 
  Cloud, 
  HardDrive, 
  Save, 
  RotateCcw, 
  Check, 
  DoorClosed, 
  Calendar, 
  School,
  ExternalLink,
  HelpCircle,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { 
  getSavedFirebaseConfig, 
  saveFirebaseConfig, 
  resetFirebase 
} from '../services/firebase';

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  event, 
  onSaveEvent, 
  currentDoor, 
  onDoorChange, 
  onResetData 
}) {
  const [eventName, setEventName] = useState(event?.name || '');
  const [defaultCap, setDefaultCap] = useState(event?.defaultCapacity || 5);
  const [doorName, setDoorName] = useState(currentDoor);
  const [doorsListStr, setDoorsListStr] = useState((event?.doors || []).join(', '));

  // Firebase Config State
  const [firebaseJson, setFirebaseJson] = useState('');
  const [fbStatus, setFbStatus] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setEventName(event?.name || '');
      setDefaultCap(event?.defaultCapacity || 5);
      setDoorName(currentDoor);
      setDoorsListStr((event?.doors || []).join(', '));

      const existingConfig = getSavedFirebaseConfig();
      if (existingConfig) {
        setFirebaseJson(JSON.stringify(existingConfig, null, 2));
        setFbStatus('CONNECTED');
      } else {
        setFirebaseJson('');
        setFbStatus('LOCAL_ONLY');
      }
    }
  }, [isOpen, event, currentDoor]);

  if (!isOpen) return null;

  const handleSaveGeneral = (e) => {
    e.preventDefault();
    const updatedDoors = doorsListStr
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const updatedEvent = {
      ...event,
      name: eventName.trim() || 'Acto Cultural',
      defaultCapacity: Number(defaultCap) || 5,
      doors: updatedDoors.length > 0 ? updatedDoors : ['Acceso Principal']
    };

    onSaveEvent(updatedEvent);
    onDoorChange(doorName);
    alert("¡Configuración general guardada exitosamente!");
  };

  const handleSaveFirebase = () => {
    if (!firebaseJson.trim()) {
      saveFirebaseConfig(null);
      resetFirebase();
      setFbStatus('LOCAL_ONLY');
      alert("Firebase desconectado. La app funcionará en modo local.");
      window.location.reload();
      return;
    }

    try {
      // Allow pasting either raw JS object or JSON
      let cleaned = firebaseJson.trim();
      if (cleaned.startsWith('const firebaseConfig =')) {
        cleaned = cleaned.replace('const firebaseConfig =', '').replace(/;$/, '').trim();
      }
      // If it has unquoted keys, loosely parse
      const config = (new Function(`return ${cleaned}`))();

      if (!config.apiKey || !config.projectId) {
        alert("La configuración debe contener al menos 'apiKey' y 'projectId'.");
        return;
      }

      saveFirebaseConfig(config);
      resetFirebase();
      setFbStatus('CONNECTED');
      alert("¡Configuración de Firebase guardada con éxito! La página se recargará para conectar la base de datos.");
      window.location.reload();
    } catch (err) {
      alert("Error al procesar la configuración: " + err.message);
    }
  };

  const handleResetDataClick = async () => {
    if (confirm("¿Estás seguro de que deseas reiniciar todos los ingresos del evento? Los estudiantes volverán a tener 0 personas registradas.")) {
      try {
        await onResetData();
        alert("Los datos del evento han sido reiniciados.");
        onClose();
      } catch (error) {
        alert(error.message);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Settings className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg">Configuración de MundoPalabra Acceso</h2>
              <p className="text-xs text-slate-400">Ajustes de evento, puerta y sincronización en la nube</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs">
          
          {/* Section 1: Event Info */}
          <form onSubmit={handleSaveGeneral} className="space-y-4 bg-slate-50 border border-slate-200 p-4 rounded-2xl">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-600" />
              Datos del Evento
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nombre del Evento:</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Cupo Máximo por Alumno:</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={defaultCap}
                  onChange={(e) => setDefaultCap(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Puntos de Acceso / Puertas habilitadas (separadas por comas):
              </label>
              <input
                type="text"
                value={doorsListStr}
                onChange={(e) => setDoorsListStr(e.target.value)}
                placeholder="Acceso Principal, Acceso Básica, Acceso Prebásica..."
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
              />
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Ajustes de Evento</span>
              </button>
            </div>
          </form>

          {/* Section 2: Firebase Free Cloud Sync */}
          <div className="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-600" />
                Sincronización en la Nube (Firebase Gratis)
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                fbStatus === 'CONNECTED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {fbStatus === 'CONNECTED' ? '● Firebase Conectado' : '○ Modo Local'}
              </span>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Para que dos o más celulares en diferentes puertas descuenten cupos al mismo tiempo y actualicen el dashboard en vivo, conecta un proyecto gratuito de <strong>Firebase Firestore</strong>.
            </p>

            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-slate-700 font-bold">
                <span>Instrucciones rápidas (3 minutos, 100% gratis):</span>
                <a
                  href="https://console.firebase.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 hover:underline flex items-center gap-1"
                >
                  <span>Ir a Firebase Console</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-500 text-[11px]">
                <li>Crea un proyecto en Firebase (ej: <em>mundopalabra-acceso</em>).</li>
                <li>Ve a <strong>Firestore Database</strong> y actívalo en modo prueba.</li>
                <li>En Configuración del proyecto, agrega una app Web (&lt;/&gt;) y copia el objeto <code>firebaseConfig</code>.</li>
                <li>Pega el código en el cuadro de abajo y haz clic en Guardar.</li>
              </ol>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Pega tu configuración de Firebase (JSON o código de objeto):
              </label>
              <textarea
                rows={4}
                value={firebaseJson}
                onChange={(e) => setFirebaseJson(e.target.value)}
                placeholder='{\n  "apiKey": "AIzaSy...",\n  "projectId": "mundopalabra-acceso",\n  ...\n}'
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setFirebaseJson('');
                  handleSaveFirebase();
                }}
                className="px-3 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 font-bold rounded-lg transition-colors"
              >
                Desconectar Firebase (Usar Modo Local)
              </button>

              <button
                type="button"
                onClick={handleSaveFirebase}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar y Conectar Firebase</span>
              </button>
            </div>
          </div>

          {/* Section 3: Data Reset */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
              Mantenimiento de Datos
            </h4>
            <p className="text-slate-500">
              Reinicia el contador de personas y bitácora para comenzar una nueva jornada o prueba.
            </p>
            <button
              onClick={handleResetDataClick}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 rounded-xl transition-colors"
            >
              Reiniciar Asistencia del Evento a Cero
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
