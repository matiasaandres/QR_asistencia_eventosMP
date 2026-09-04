import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, 
  CameraOff, 
  SwitchCamera, 
  Search, 
  AlertCircle,
  HelpCircle,
  Play,
  Square,
  Upload
} from 'lucide-react';
import { sounds } from '../services/sound';

export default function ScannerModal({ 
  onScanResult, 
  onSwitchToManualSearch,
  currentDoor
}) {
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const html5QrCodeRef = useRef(null);
  const fileInputRef = useRef(null);

  // Safely stop scanner
  const stopScannerSafe = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (err) {
        console.warn("Notice: stopScanner error caught safely", err);
      }
      try {
        html5QrCodeRef.current.clear();
      } catch (e) {}
      html5QrCodeRef.current = null;
    }
    setIsScanning(false);
  };

  // Start scanner safely
  const startScanner = async (cameraId) => {
    setIsLoadingCamera(true);
    setCameraError(null);

    await stopScannerSafe();

    const element = document.getElementById("qr-reader-viewport");
    if (!element) {
      setIsLoadingCamera(false);
      return;
    }

    try {
      const html5QrCode = new Html5Qrcode("qr-reader-viewport");
      html5QrCodeRef.current = html5QrCode;

      const cameraConfig = cameraId 
        ? cameraId 
        : { facingMode: "environment" };

      const config = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edgeSize = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
          return { width: edgeSize, height: edgeSize };
        },
        aspectRatio: 1.0
      };

      await html5QrCode.start(
        cameraConfig,
        config,
        (decodedText) => {
          sounds.playBeep();
          onScanResult(decodedText.trim());
        },
        () => {} // suppress normal scan frames
      );

      setIsScanning(true);
      setCameraError(null);
    } catch (err) {
      console.warn("Could not start camera:", err);
      setIsScanning(false);
      setCameraError(
        "No se pudo iniciar la cámara (puede estar en uso, bloqueada en los permisos del navegador o no disponible)."
      );
    } finally {
      setIsLoadingCamera(false);
    }
  };

  // Check cameras on mount
  useEffect(() => {
    let isCancelled = false;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (isCancelled) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find((d) => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('trasera') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
          );
          const defaultId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(defaultId);
          startScanner(defaultId);
        } else {
          // Try with generic constraints
          startScanner(null);
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn("getCameras error, attempting generic start:", err);
        startScanner(null);
      });

    return () => {
      isCancelled = true;
      stopScannerSafe();
    };
  }, []);

  // Switch camera toggle
  const handleToggleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    startScanner(nextCamera.id);
  };

  // Scan from file fallback
  const handleFileScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await stopScannerSafe();
      const html5QrCode = new Html5Qrcode("qr-reader-viewport");
      const decodedText = await html5QrCode.scanFile(file, true);
      sounds.playBeep();
      onScanResult(decodedText.trim());
    } catch (err) {
      alert("No se detectó ningún código QR en la imagen seleccionada.");
    } finally {
      if (selectedCameraId) {
        startScanner(selectedCameraId);
      }
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
      {/* Header Info Banner */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Camera className="w-5 h-5 text-sky-600" />
            Lector de Código QR
          </h2>
          <p className="text-xs text-slate-500">
            Apunta la cámara al código QR de la credencial familiar
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {cameras.length > 1 && (
            <button
              onClick={handleToggleCamera}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              title="Cambiar entre cámaras"
            >
              <SwitchCamera className="w-4 h-4" />
              <span className="hidden sm:inline">Cambiar</span>
            </button>
          )}

          {/* Upload file fallback */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition-colors"
            title="Escanear desde foto o archivo"
          >
            <Upload className="w-4 h-4" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileScan}
              className="hidden"
            />
          </button>
        </div>
      </div>

      {/* Viewport Frame Container */}
      <div className="relative bg-slate-900 rounded-3xl overflow-hidden shadow-xl aspect-square max-w-sm mx-auto flex items-center justify-center border-4 border-slate-800">
        <div id="qr-reader-viewport" className="w-full h-full overflow-hidden" />

        {/* Overlay laser and corners when scanning */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-64 relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-sky-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-sky-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-sky-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-sky-400 rounded-br-xl" />

              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_rgba(56,189,248,1)] scanner-laser" />
            </div>
          </div>
        )}

        {/* Loading spinner */}
        {isLoadingCamera && !cameraError && (
          <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white p-4">
            <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-xs font-semibold text-slate-300">Iniciando cámara...</span>
          </div>
        )}

        {/* Error / Fallback State */}
        {cameraError && !isLoadingCamera && (
          <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
            <CameraOff className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="font-bold text-sm">Cámara no disponible</h3>
            <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
              {cameraError}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs pt-1">
              <button
                onClick={() => startScanner(selectedCameraId)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Reintentar Cámara
              </button>
              <button
                onClick={onSwitchToManualSearch}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 transition-all"
              >
                <Search className="w-4 h-4" />
                Usar Búsqueda Manual
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Search Callout for families without QR */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-amber-900">¿La familia no trajo su código QR?</h4>
            <p className="text-xs text-amber-700">
              Puedes buscar al estudiante por su nombre, apellido o curso.
            </p>
          </div>
        </div>

        <button
          onClick={onSwitchToManualSearch}
          className="shrink-0 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Buscar</span>
        </button>
      </div>
    </div>
  );
}
