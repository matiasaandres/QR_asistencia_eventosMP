import React from 'react';
import OrganizationLogo from './OrganizationLogo.jsx';
import { getEffectiveEventStatus } from '../services/eventPolicy.js';
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
  AlertTriangle,
  LogOut,
  CalendarDays,
  UserCog,
  Activity,
  UsersRound
} from 'lucide-react';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  event, 
  currentDoor, 
  onDoorChange, 
  events,
  onEventChange,
  syncMode, 
  onOpenSettings,
  onLogout,
  onBackToMaster,
  organization,
  organizations,
  onOrganizationChange,
  role,
  permissions = {}
}) {
  const eventStatus = getEffectiveEventStatus(event);
  const eventStatusLabel = eventStatus === 'open' ? 'Abierto' : eventStatus === 'paused' ? 'Pausado' : eventStatus === 'closed' ? 'Cerrado' : 'Borrador';
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex min-w-0 items-center space-x-3">
            <OrganizationLogo organization={organization} className="h-11 w-11 rounded-xl border-2 shadow-sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">{organization?.name || 'Acceso Escolar'}</span>
                <span className="hidden text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 md:inline">{role === 'admin' ? 'Administrador' : role === 'operator' ? 'Operador' : 'Consulta'}</span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-[180px] sm:max-w-xs font-medium">
                {event?.name || 'Control de Asistencia'}
              </p>
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${eventStatus === 'open' ? 'bg-emerald-100 text-emerald-800' : eventStatus === 'paused' ? 'bg-amber-100 text-amber-800' : eventStatus === 'closed' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{eventStatusLabel}</span>
            </div>
          </div>

          {/* Right Info: Door Selector & Cloud Status */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {onBackToMaster && <button onClick={onBackToMaster} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">Panel maestro</button>}
            {organizations?.length > 1 && (
              <select aria-label="Organización actual" value={organization?.id || ''} onChange={(event) => onOrganizationChange(event.target.value)} className="hidden xl:block max-w-48 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700">
                {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <div className="hidden lg:flex items-center bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1 text-xs">
              <CalendarDays className="w-3.5 h-3.5 text-sky-600 mr-1.5" />
              <select
                aria-label="Evento actual"
                value={event?.id || ''}
                onChange={(changeEvent) => onEventChange(changeEvent.target.value)}
                className="max-w-52 bg-transparent font-bold text-sky-900 focus:outline-none cursor-pointer"
              >
                {(events || []).filter((item) => !item.archived).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

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
            {permissions.canManage && <button
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
            </button>}

            {/* Settings button */}
            {permissions.canManage && <button
              onClick={onOpenSettings}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Ajustes y Firebase"
            >
              <Settings className="w-5 h-5" />
            </button>}

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden lg:inline text-xs font-bold">Salir</span>
            </button>
          </div>
        </div>

        {/* Mobile Door selector bar */}
        <div className="sm:hidden pb-2.5 pt-1 flex items-center justify-between border-t border-slate-100">
          <div className="flex min-w-0 items-center text-xs text-slate-600">
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
          <select
            aria-label="Evento actual móvil"
            value={event?.id || ''}
            onChange={(changeEvent) => onEventChange(changeEvent.target.value)}
            className="ml-2 max-w-[45%] truncate rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-900"
          >
            {(events || []).filter((item) => !item.archived).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Tabs Navigation Bar */}
      <nav className="bg-slate-50 border-t border-slate-200 px-2 sm:px-6">
        <div className="max-w-7xl mx-auto flex space-x-1 sm:space-x-4 overflow-x-auto py-2 scrollbar-none">
          {permissions.canOperate && <button
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'scan'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Escanear QR</span>
          </button>}

          {permissions.canOperate && <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'search'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Buscar Estudiante</span>
          </button>}

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

          <button onClick={() => setActiveTab('operations')} className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${activeTab === 'operations' ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'}`}><Activity className="h-4 w-4"/><span>Operaciones</span></button>

          {permissions.canManage && <button onClick={() => setActiveTab('families')} className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${activeTab === 'families' ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'}`}><UsersRound className="h-4 w-4"/><span>Familias</span></button>}

          {permissions.canManage && <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'students'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Estudiantes y Credenciales</span>
          </button>}

          {permissions.canManage && <button
            onClick={() => setActiveTab('events')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'events'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Eventos</span>
          </button>}

          {permissions.canManage && <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${activeTab === 'members' ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'}`}
          >
            <UserCog className="w-4 h-4" />
            <span>Usuarios</span>
          </button>}

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
