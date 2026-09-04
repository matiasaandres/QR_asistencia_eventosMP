import React from 'react';
import { 
  QrCode, 
  Search, 
  BarChart3, 
  Users, 
  History, 
  Settings, 
  DoorClosed,
  Cloud,
  HardDrive,
  School,
  AlertTriangle
} from 'lucide-react';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  event, 
  currentDoor, 
  onDoorChange, 
  syncMode, 
  onOpenSettings 
}) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <School className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 tracking-tight text-lg">MundoPalabra</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Acceso</span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-[180px] sm:max-w-xs font-medium">
                {event?.name || 'Control de Asistencia'}
              </p>
            </div>
          </div>

          {/* Right Info: Door Selector & Cloud Status */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Door selector pill */}
            <div className="hidden sm:flex items-center bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
              <DoorClosed className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
              <select
                value={currentDoor}
                onChange={(e) => onDoorChange(e.target.value)}
                className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
                title="Selecciona la puerta donde está operando este celular"
              >
                {(event?.doors || ['Acceso Principal']).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Sync status indicator */}
            <button
              onClick={onOpenSettings}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                syncMode === 'cloud'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : syncMode === 'error'
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
              title={
                syncMode === 'cloud'
                  ? 'Sincronizado en la nube (Firebase)'
                  : syncMode === 'offline'
                    ? 'Sin conexión: usando la copia persistente de Firebase'
                    : syncMode === 'error'
                      ? 'Error de sincronización: revisa Firebase'
                      : 'Modo local (Haz clic para configurar Firebase)'
              }
            >
              {syncMode === 'cloud' ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden md:inline">En vivo</span>
                </>
              ) : syncMode === 'error' ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span className="hidden md:inline">Error de sincronización</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden md:inline">{syncMode === 'offline' ? 'Sin conexión' : 'Local'}</span>
                </>
              )}
            </button>

            {/* Settings button */}
            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Ajustes y Firebase"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Door selector bar */}
        <div className="sm:hidden pb-2.5 pt-1 flex items-center justify-between border-t border-slate-100">
          <div className="flex items-center text-xs text-slate-600">
            <DoorClosed className="w-3.5 h-3.5 text-sky-600 mr-1" />
            <span className="font-semibold mr-1">Puerta:</span>
            <select
              value={currentDoor}
              onChange={(e) => onDoorChange(e.target.value)}
              className="bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-xs font-semibold text-sky-800"
            >
              {(event?.doors || ['Acceso Principal']).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation Bar */}
      <nav className="bg-slate-50 border-t border-slate-200 px-2 sm:px-6">
        <div className="max-w-7xl mx-auto flex space-x-1 sm:space-x-4 overflow-x-auto py-2 scrollbar-none">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'scan'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Escanear QR</span>
          </button>

          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'search'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Buscar Estudiante</span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'dashboard'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Panel en Vivo</span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'students'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Estudiantes y Credenciales</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'history'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
