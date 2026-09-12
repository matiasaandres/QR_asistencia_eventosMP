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
  AlertTriangle,
  ImagePlus,
  Palette,
  Trash2,
  Download,
  DatabaseBackup,
  Upload
} from 'lucide-react';
import {
  getSavedFirebaseConfig, 
  parseFirebaseConfig,
  saveFirebaseConfig, 
  resetFirebase 
} from '../services/firebase';
import { downloadSchoolBackup, restoreSchoolBackup } from '../services/schoolBackup';

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function optimizeLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('Selecciona un archivo de imagen.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No fue posible leer la imagen.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('El archivo no contiene una imagen válida.'));
      image.onload = () => {
        const maxSide = 520;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  event, 
  organization,
  onSaveOrganization,
  onSaveEvent, 
  currentDoor, 
  onDoorChange, 
  onResetData,
  managedCloud = true
}) {
  const [eventName, setEventName] = useState(event?.name || '');
  const [eventDate, setEventDate] = useState(event?.date || '');
  const [defaultCap, setDefaultCap] = useState(event?.defaultCapacity || 4);
  const [eventStatus, setEventStatus] = useState(event?.status || 'open');
  const [startsAt, setStartsAt] = useState(toLocalDateTime(event?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalDateTime(event?.endsAt));
  const [doorName, setDoorName] = useState(currentDoor);
  const [doorsListStr, setDoorsListStr] = useState((event?.doors || []).join(', '));
  const [schoolName, setSchoolName] = useState(organization?.name || '');
  const [logoUrl, setLogoUrl] = useState(organization?.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(organization?.primaryColor || '#0284c7');
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [brandError, setBrandError] = useState('');

  // Firebase Config State
  const [firebaseJson, setFirebaseJson] = useState('');
  const [fbStatus, setFbStatus] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupKey, setBackupKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEventName(event?.name || '');
      setEventDate(event?.date || '');
      setDefaultCap(event?.defaultCapacity || 4);
      setEventStatus(event?.status || 'open');
      setStartsAt(toLocalDateTime(event?.startsAt));
      setEndsAt(toLocalDateTime(event?.endsAt));
      setDoorName(currentDoor);
      setDoorsListStr((event?.doors || []).join(', '));
      setSchoolName(organization?.name || '');
      setLogoUrl(organization?.logoUrl || '');
      setPrimaryColor(organization?.primaryColor || '#0284c7');
      setBrandError('');

      const existingConfig = getSavedFirebaseConfig();
      if (existingConfig) {
        setFirebaseJson(JSON.stringify(existingConfig, null, 2));
        setFbStatus('CONNECTED');
      } else {
        setFirebaseJson('');
        setFbStatus('LOCAL_ONLY');
      }
    }
  }, [isOpen, event, currentDoor, organization]);

  if (!isOpen) return null;

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    const updatedDoors = doorsListStr
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const updatedEvent = {
      ...event,
      name: eventName.trim() || 'Acto Cultural',
      date: eventDate,
      defaultCapacity: Number(defaultCap) || 4,
      status: eventStatus,
      startsAt: startsAt ? new Date(startsAt).toISOString() : '',
      endsAt: endsAt ? new Date(endsAt).toISOString() : '',
      doors: updatedDoors.length > 0 ? updatedDoors : ['Acceso Principal']
    };
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      alert('El cierre automático debe ser posterior a la apertura.');
      return;
    }

    setIsSavingGeneral(true);
    try {
      await onSaveEvent(updatedEvent);
      onDoorChange(updatedDoors.includes(doorName) ? doorName : updatedDoors[0] || 'Acceso Principal');
      alert("¡Configuración general guardada exitosamente!");
    } catch (error) {
      alert(`No fue posible guardar el evento: ${error.message}`);
    } finally {
      setIsSavingGeneral(false);
    }
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
      const config = parseFirebaseConfig(firebaseJson);

      saveFirebaseConfig(config);
      resetFirebase();
      setFbStatus('CONNECTED');
      alert("¡Configuración de Firebase guardada con éxito! La página se recargará para conectar la base de datos.");
      window.location.reload();
    } catch (err) {
      alert("Error al procesar la configuración: " + err.message);
    }
  };

  const handleLogoChange = async (changeEvent) => {
    const file = changeEvent.target.files?.[0];
    if (!file) return;
    setBrandError('');
    try {
      setLogoUrl(await optimizeLogo(file));
    } catch (error) {
      setBrandError(error.message);
    } finally {
      changeEvent.target.value = '';
    }
  };

  const handleSaveBrand = async (submitEvent) => {
    submitEvent.preventDefault();
    setBrandError('');
    setIsSavingBrand(true);
    try {
      await onSaveOrganization({ name: schoolName, logoUrl, primaryColor });
    } catch (error) {
      setBrandError(error.message || 'No fue posible guardar la identidad de la escuela.');
    } finally {
      setIsSavingBrand(false);
    }
  };

  const handleResetDataClick = async () => {
    if (confirm("¿Estás seguro de que deseas reiniciar todos los ingresos del evento? Los estudiantes volverán a tener 0 personas registradas.")) {
      setIsResetting(true);
      try {
        await onResetData();
        alert("Los datos del evento han sido reiniciados.");
        onClose();
      } catch (error) {
        alert(error.message);
      } finally {
        setIsResetting(false);
      }
    }
  };

  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    setBackupMessage('');
    try {
      const summary = await downloadSchoolBackup(organization?.id, backupKey);
      setBackupMessage(`Respaldo descargado: ${summary.events} eventos, ${summary.students} alumnos y ${summary.logs} registros.`);
    } catch (error) {
      setBackupMessage(error.message || 'No fue posible descargar el respaldo.');
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleRestoreBackup = async (changeEvent) => {
    const file = changeEvent.target.files?.[0];
    changeEvent.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setBackupMessage('El respaldo supera el máximo permitido de 25 MB.');
      return;
    }
    if (!confirm('¿Restaurar este respaldo? Se reemplazarán eventos, alumnos, cupos y bitácoras de esta escuela. Las cuentas y permisos actuales se conservarán.')) return;
    setIsRestoringBackup(true);
    setBackupMessage('');
    try {
      const backup = JSON.parse(await file.text());
      const summary = await restoreSchoolBackup(organization?.id, backup, backupKey);
      setBackupMessage(`Restauración completada: ${summary.events} eventos, ${summary.students} alumnos y ${summary.logs} registros.`);
    } catch (error) {
      setBackupMessage(error instanceof SyntaxError ? 'El archivo no contiene un JSON válido.' : (error.message || 'No fue posible restaurar el respaldo.'));
    } finally {
      setIsRestoringBackup(false);
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
              <h2 className="font-extrabold text-lg">Configuración de la escuela</h2>
              <p className="text-xs text-slate-400">Identidad institucional, evento y accesos</p>
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
          <form onSubmit={handleSaveBrand} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <School className="h-4 w-4 text-sky-600" />
              <div><h3 className="text-sm font-extrabold text-slate-900">Identidad institucional</h3><p className="text-[11px] text-slate-500">Se aplicará en la app, credenciales e informes PDF.</p></div>
            </div>
            <div className="grid gap-5 p-4 sm:grid-cols-[150px_1fr]">
              <div className="space-y-2">
                <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                  {logoUrl ? <img src={logoUrl} alt="Vista previa del logo" className="h-full w-full object-contain p-3" /> : <ImagePlus className="h-9 w-9 text-slate-300" />}
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-700 hover:border-sky-300 hover:text-sky-700">
                  <ImagePlus className="h-3.5 w-3.5" /> Elegir logo
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} className="sr-only" />
                </label>
                {logoUrl && <button type="button" onClick={() => setLogoUrl('')} className="flex w-full items-center justify-center gap-1 text-[11px] font-bold text-rose-600"><Trash2 className="h-3 w-3" /> Quitar logo</button>}
              </div>
              <div className="space-y-4">
                <label className="block font-bold text-slate-700">Nombre de la escuela
                  <input required minLength="2" maxLength="100" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold outline-none focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100" />
                </label>
                <label className="block font-bold text-slate-700">Color institucional
                  <span className="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                    <Palette className="h-4 w-4 text-slate-400" /><span className="font-mono text-xs uppercase text-slate-600">{primaryColor}</span>
                  </span>
                </label>
                <p className="text-[11px] leading-relaxed text-slate-500">Recomendado: imagen PNG o SVG cuadrada, con fondo transparente. La aplicación la optimiza automáticamente.</p>
                {brandError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 font-semibold text-rose-700">{brandError}</p>}
                <button disabled={isSavingBrand} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 font-extrabold text-white shadow-sm disabled:opacity-60" style={{ backgroundColor: primaryColor }}><Save className="h-3.5 w-3.5" /> {isSavingBrand ? 'Guardando…' : 'Guardar identidad'}</button>
              </div>
            </div>
          </form>
          
          {/* Section 1: Event Info */}
          <form onSubmit={handleSaveGeneral} className="space-y-4 bg-slate-50 border border-slate-200 p-4 rounded-2xl">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-600" />
              Datos del Evento
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <label className="font-bold text-slate-700 block mb-1">Fecha:</label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Cupo Máximo por Alumno:</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={defaultCap}
                  onChange={(e) => setDefaultCap(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><label className="mb-1 block font-bold text-slate-700">Estado:</label><select value={eventStatus} onChange={(e) => setEventStatus(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-semibold text-slate-800"><option value="draft">Borrador</option><option value="open">Abierto</option><option value="paused">Pausado</option><option value="closed">Cerrado</option></select></div><div><label className="mb-1 block font-bold text-slate-700">Apertura automática:</label><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-semibold text-slate-800"/></div><div><label className="mb-1 block font-bold text-slate-700">Cierre automático:</label><input type="datetime-local" value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-semibold text-slate-800"/></div></div>

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
                disabled={isSavingGeneral}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingGeneral ? 'Guardando…' : 'Guardar Ajustes de Evento'}</span>
              </button>
            </div>
          </form>

          {/* Section 2: Firebase Free Cloud Sync */}
          {!managedCloud && <div className="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-2xl">
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
          </div>}

          {/* Section 3: School backup */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><DatabaseBackup className="h-5 w-5" /></span>
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-emerald-950">Respaldo de la escuela</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">Descarga un archivo JSON con la configuración institucional, miembros, eventos, alumnos, familias, cupos y bitácoras. Los respaldos nuevos se firman con HMAC-SHA-256.</p>
                <label className="mt-3 block max-w-sm text-[11px] font-bold text-emerald-950">
                  Clave privada del respaldo
                  <input type="password" value={backupKey} onChange={(event) => setBackupKey(event.target.value)} minLength={12} autoComplete="new-password" placeholder="Mínimo 12 caracteres; no se guarda" className="mt-1 w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                <p className="mt-1 text-[10px] text-emerald-700">Guárdala fuera de la aplicación: será necesaria para restaurar el archivo firmado.</p>
                <button type="button" onClick={handleDownloadBackup} disabled={isDownloadingBackup} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60">
                  <Download className="h-4 w-4" />
                  {isDownloadingBackup ? 'Preparando respaldo…' : 'Descargar respaldo completo'}
                </button>
                <label className={`ml-2 mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100 ${isRestoringBackup ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
                  <Upload className="h-4 w-4" />
                  {isRestoringBackup ? 'Restaurando…' : 'Subir y restaurar respaldo'}
                  <input type="file" accept="application/json,.json" disabled={isRestoringBackup} onChange={handleRestoreBackup} className="sr-only" />
                </label>
                {backupMessage && <p role="status" className="mt-2 text-[11px] font-semibold text-emerald-900">{backupMessage}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: Data Reset */}
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
              disabled={isResetting}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {isResetting ? 'Reiniciando asistencia…' : 'Reiniciar Asistencia del Evento a Cero'}
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
