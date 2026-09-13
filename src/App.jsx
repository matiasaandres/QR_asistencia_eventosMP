/**
 * Orquestador principal: autentica al usuario, selecciona organización y evento,
 * conecta suscripciones de datos y muestra el portal escolar o maestro.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from './components/Navbar';
import ScannerModal from './components/ScannerModal';
import CheckinPanel from './components/CheckinPanel';
import ManualSearch from './components/ManualSearch';
import Dashboard from './components/Dashboard';
import StudentsManager from './components/StudentsManager';
import HistoryLog from './components/HistoryLog';
import QRCardPrinter from './components/QRCardPrinter';
import SettingsModal from './components/SettingsModal';
import LoginScreen from './components/LoginScreen';
import EventsManager from './components/EventsManager';
import MembersManager from './components/MembersManager';
import MasterDashboard from './components/MasterDashboard';
import OperationalCenter from './components/OperationalCenter';
import FamiliesCenter from './components/FamiliesCenter';
import SeatingManager from './components/SeatingManager';
import { sounds } from './services/sound';
import { clearAuthSession, subscribeToAuth } from './services/auth';
import { canManageOrganization, canOperateAccess, isPlatformAdmin } from './services/organizationPolicy';
import {
  getSavedOrganizationId,
  saveOrganizationId,
  createSchoolWithAdministrator,
  assignSchoolAdministrator,
  importMundoPalabraReport,
  migrateLegacyMundoPalabra,
  restoreMundoPalabraStudentStates,
  subscribeToAllOrganizations,
  updateOrganizationStatus,
  updateOrganizationBrand,
  subscribeToMembership,
  subscribeToOrganizations
} from './services/organizations';
import { getCapacityState } from './services/checkinPolicy';
import { eventAllowsAccess, getEffectiveEventStatus } from './services/eventPolicy';
import {
  getCurrentEvent, saveCurrentEvent, subscribeToEvents, createEvent, updateEvent,
  archiveEvent, getCurrentDoor, setCurrentDoor, subscribeToStudents, subscribeToLogs,
  deleteLogEntry, registerCheckIn, saveStudentsList, saveStudentCapacities, saveStudentFamily, deleteStudents,
  resetEventData, migrateLegacyFamilies, migrateStudentDirectory, subscribeToDoorSessions, registerDoorPresence,
  mergeFamilies, separateFamilyMember, subscribeToFamilyHistory, fetchAllLogs, fetchLogPage,
  subscribeToEventAnalytics, ensureEventAnalytics
} from './services/storage';
import { clearSensitiveLocalData } from './services/firebase';
import { saveSeatPlan, saveVenue, subscribeToSeatPlan, subscribeToVenues } from './services/seating';

/** Muestra el estado de carga inicial de la aplicación.
 * @param {{message?: string}} props Mensaje opcional.
 * @returns {JSX.Element} Pantalla de carga.
 */
function LoadingScreen({ message = 'Cargando acceso seguro…' }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-bold text-sky-100">{message}</main>;
}

/** Compone el estado global, navegación y flujos de acceso.
 * @returns {JSX.Element} Aplicación principal.
 */
export default function App() {
  const portal = window.location.pathname.startsWith('/master') ? 'master' : 'school';
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [membership, setMembership] = useState(null);
  const [organizationReady, setOrganizationReady] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [event, setEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [currentDoor, setCurrentDoorState] = useState('Acceso Principal');
  const [students, setStudents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logAnalytics, setLogAnalytics] = useState({ totalRecords: 0, doorsList: [], activityByHour: [] });
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const allLogsLoadedRef = useRef(false);
  const [doorSessions, setDoorSessions] = useState([]);
  const [familyHistory, setFamilyHistory] = useState([]);
  const [venues, setVenues] = useState([]);
  const [seatPlan, setSeatPlan] = useState(null);
  const [syncMode, setSyncMode] = useState('local');
  const [checkinStudent, setCheckinStudent] = useState(null);
  const [printStudent, setPrintStudent] = useState(null);
  const [showPrinter, setShowPrinter] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [schoolViewForMaster, setSchoolViewForMaster] = useState(false);

  const isMaster = isPlatformAdmin(authUser);
  const role = isMaster && schoolViewForMaster ? 'admin' : membership?.role || 'viewer';
  const canManage = canManageOrganization(role);
  const canOperate = canOperateAccess(role);
  const canRegister = canOperate && syncMode !== 'offline' && syncMode !== 'error';

  useEffect(() => subscribeToAuth((user) => {
    setAuthUser(user);
    setAuthReady(true);
    if (!user) {
      setOrganizations([]);
      setOrganization(null);
      setMembership(null);
    }
  }), []);

  useEffect(() => {
    if (!authUser) return undefined;
    setOrganizationReady(false);
    const subscribe = isPlatformAdmin(authUser) ? subscribeToAllOrganizations : (onUpdate, onError) => subscribeToOrganizations(authUser.uid, onUpdate, onError);
    return subscribe((available) => {
      setOrganizations(available);
      setOrganization((current) => {
        const savedId = getSavedOrganizationId(authUser.uid);
        const selected = available.find((item) => item.id === current?.id)
          || available.find((item) => item.id === savedId)
          || available[0]
          || null;
        if (selected) saveOrganizationId(authUser.uid, selected.id);
        return selected;
      });
      setOrganizationReady(true);
    }, () => setOrganizationReady(true));
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !organization) return undefined;
    setMembership(null);
    return subscribeToMembership(organization.id, authUser.uid, setMembership, () => setMembership(null));
  }, [authUser, organization]);

  useEffect(() => {
    if (!organization) return undefined;
    const organizationId = organization.id;
    setEvents([]);
    setEvent(null);
    setStudents([]);
    setLogs([]);
    setHasMoreLogs(false);
    allLogsLoadedRef.current = false;
    setCurrentDoorState(getCurrentDoor(organizationId));
    return subscribeToEvents(organizationId, (nextEvents, mode) => {
      setEvents(nextEvents);
      if (mode) setSyncMode(mode);
      setEvent((currentEvent) => {
        const refreshed = nextEvents.find((item) => item.id === currentEvent?.id && !item.archived);
        if (refreshed) return saveCurrentEvent(organizationId, refreshed);
        const saved = getCurrentEvent(organizationId);
        const selected = nextEvents.find((item) => item.id === saved.id && !item.archived)
          || nextEvents.find((item) => !item.archived)
          || null;
        return selected ? saveCurrentEvent(organizationId, selected) : null;
      });
    });
  }, [organization]);

  useEffect(() => {
    if (!organization || !event) return undefined;
    return subscribeToStudents(organization.id, event.id, (data, mode) => {
      setStudents(data);
      if (mode) setSyncMode(mode);
    });
  }, [organization, event?.id]);

  useEffect(() => {
    if (!organization) return undefined;
    return subscribeToVenues(organization.id, (data, mode) => {
      setVenues(data);
      if (mode) setSyncMode(mode);
    });
  }, [organization]);

  useEffect(() => {
    if (!organization || !event) return undefined;
    setSeatPlan(null);
    return subscribeToSeatPlan(organization.id, event.id, (data, mode) => {
      setSeatPlan(data);
      if (mode) setSyncMode(mode);
    });
  }, [organization, event?.id]);

  useEffect(() => {
    if (!organization || !event) return undefined;
    return subscribeToDoorSessions(organization.id, event.id, setDoorSessions);
  }, [organization, event?.id]);

  useEffect(() => {
    if (!organization || !event || !canManage) return undefined;
    return subscribeToFamilyHistory(organization.id, event.id, setFamilyHistory);
  }, [organization, event?.id, canManage]);

  useEffect(() => {
    if (!organization || !event || !canOperate) return undefined;
    /** Registra periódicamente la presencia de la puerta activa.
     * @returns {Promise<void>}
     */
    const report = () => registerDoorPresence(organization.id, event.id, currentDoor).catch(() => {});
    report();
    const timer = window.setInterval(report, 30000);
    return () => window.clearInterval(timer);
  }, [organization, event?.id, currentDoor, canOperate]);

  useEffect(() => {
    if (!organization || !event || !canManage) return;
    migrateLegacyFamilies(organization.id, event.id).catch((error) => {
      console.warn('No fue posible migrar las familias anteriores:', error);
    });
  }, [organization, event?.id, canManage]);

  useEffect(() => {
    if (!organization || !canManage || events.length === 0) return;
    migrateStudentDirectory(organization.id, events.map((item) => item.id)).catch((error) => {
      console.warn('No fue posible optimizar la nómina maestra:', error);
    });
  }, [organization, canManage, events.map((item) => item.id).join('|')]);

  useEffect(() => {
    if (!organization || !event || (!membership && !isMaster)) return undefined;
    return subscribeToLogs(organization.id, event.id, (data, mode, hasMore) => {
      setLogs((current) => {
        const ids = new Set(data.map((item) => item.id));
        const boundary = data.at(-1);
        const older = boundary ? current.filter((item) => !ids.has(item.id) && (
          String(item.timestamp || '') < String(boundary.timestamp || '')
          || (item.timestamp === boundary.timestamp && item.id < boundary.id)
        )) : [];
        return [...data, ...older];
      });
      if (!allLogsLoadedRef.current) setHasMoreLogs(Boolean(hasMore));
      if (mode === 'error') setSyncMode('error');
    });
  }, [organization, event?.id, membership, isMaster]);

  useEffect(() => {
    if (!organization || !event || (!membership && !isMaster)) return undefined;
    return subscribeToEventAnalytics(organization.id, event.id, setLogAnalytics);
  }, [organization, event?.id, membership, isMaster]);

  useEffect(() => {
    if (!organization || !event || !canManage) return;
    ensureEventAnalytics(organization.id, event.id).catch((error) => {
      console.warn('No fue posible preparar los agregados del evento:', error);
    });
  }, [organization, event?.id, canManage]);

  useEffect(() => {
    if (!canManage && (activeTab === 'students' || activeTab === 'events' || activeTab === 'members' || activeTab === 'seating')) setActiveTab('dashboard');
    if (!canRegister && (activeTab === 'scan' || activeTab === 'search')) setActiveTab('dashboard');
  }, [role, activeTab, canManage, canRegister]);

  const selectableTabs = useMemo(() => ({ canManage, canOperate: canRegister }), [canManage, canRegister]);

  /** Cambia la organización activa del usuario.
   * @param {string} organizationId Identificador de la organización.
   * @returns {void}
   */
  const handleOrganizationChange = (organizationId) => {
    const selected = organizations.find((item) => item.id === organizationId);
    if (!selected || !authUser) return;
    saveOrganizationId(authUser.uid, selected.id);
    setOrganization(selected);
  };

  /** Crea una escuela con el usuario maestro actual.
   * @param {object} schoolData Datos de la escuela.
   * @returns {Promise<object>} Escuela creada.
   */
  const handleCreateSchool = (schoolData) => createSchoolWithAdministrator({ ...schoolData, masterUser: authUser });

  /** Migra los datos heredados de una organización.
   * @param {string} organizationId Identificador de la organización.
   * @returns {Promise<object>} Resultado de la migración.
   */
  const handleLegacyMigration = (organizationId) => migrateLegacyMundoPalabra({
    organizationId,
    user: authUser
  });

  /** Cierra la sesión y limpia el estado sensible de la aplicación.
   * @returns {Promise<void>}
   */
  const handleLogout = async () => {
    await clearAuthSession();
    clearSensitiveLocalData();
    setCheckinStudent(null);
    setShowPrinter(false);
    setShowSettings(false);
    setSchoolViewForMaster(false);
  };

  /** Actualiza la puerta activa del evento.
   * @param {string} newDoor Nombre de la puerta.
   * @returns {void}
   */
  const handleDoorChange = (newDoor) => {
    setCurrentDoorState(newDoor);
    setCurrentDoor(organization.id, newDoor);
  };

  /** Guarda un evento y sincroniza el evento actualmente visible.
   * @param {object} updatedEvent Datos actualizados del evento.
   * @returns {Promise<object>} Evento normalizado.
   */
  const handleSaveEvent = async (updatedEvent) => {
    const normalized = await updateEvent(organization.id, updatedEvent);
    if (event?.id === normalized.id) setEvent(normalized);
    return normalized;
  };

  /** Guarda la identidad visual de la organización activa.
   * @param {object} brand Datos de marca.
   * @returns {Promise<object>} Organización actualizada.
   */
  const handleSaveOrganizationBrand = (brand) => updateOrganizationBrand(organization.id, brand);

  /** Selecciona un evento no archivado y reinicia sus datos visibles.
   * @param {object|string} eventOrId Evento o identificador seleccionado.
   * @returns {void}
   */
  const handleEventChange = (eventOrId) => {
    const selectedId = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id;
    const selected = events.find((item) => item.id === selectedId && !item.archived);
    if (!selected) return;
    setCheckinStudent(null);
    setPrintStudent(null);
    setShowPrinter(false);
    setStudents([]);
    setLogs([]);
    setLogAnalytics({ totalRecords: 0, doorsList: [], activityByHour: [], ready: false });
    setHasMoreLogs(false);
    allLogsLoadedRef.current = false;
    setEvent(saveCurrentEvent(organization.id, selected));
  };

  /** Crea un evento y prepara su vista de asistencia.
   * @param {object} eventData Datos del evento.
   * @param {boolean} copyRoster Indica si se copia la nómina.
   * @param {Array<string>} selectedCourses Cursos que se copiarán.
   * @returns {Promise<object>} Evento creado.
   */
  const handleCreateEvent = async (eventData, copyRoster, selectedCourses) => {
    const created = await createEvent(organization.id, {
      ...eventData,
      institution: organization.name
    }, { copyStudents: copyRoster, sourceStudents: students, selectedCourses });
    setEvent(created);
    setStudents([]);
    setLogs([]);
    setLogAnalytics({ totalRecords: 0, doorsList: [], activityByHour: [], ready: false });
    setHasMoreLogs(false);
    allLogsLoadedRef.current = false;
    return created;
  };

  /** Archiva o reactiva un evento distinto del evento actual.
   * @param {string} eventId Identificador del evento.
   * @param {boolean} archived Indica si debe quedar archivado.
   * @returns {Promise<object>} Evento actualizado.
   */
  const handleArchiveEvent = async (eventId, archived) => {
    if (eventId === event?.id && archived) throw new Error('Selecciona otro evento antes de archivar el evento actual.');
    return archiveEvent(organization.id, eventId, archived);
  };

  /** Valida y selecciona el estudiante leído desde un código QR.
   * @param {string} decodedText Texto decodificado.
   * @returns {void}
   */
  const handleScanResult = (decodedText) => {
    if (!eventAllowsAccess(event)) {
      sounds.playWarning();
      const status = getEffectiveEventStatus(event);
      alert(`El evento está ${status === 'draft' ? 'en borrador o fuera de horario' : status === 'paused' ? 'pausado' : 'cerrado'}. No se pueden registrar movimientos.`);
      return;
    }
    const student = students.find((item) => item.id.toLowerCase() === decodedText.toLowerCase());
    if (!student) {
      sounds.playWarning();
      alert(`No se encontró ningún estudiante asociado al código “${decodedText}”.`);
      return;
    }
    const capacity = getCapacityState(student);
    if (capacity.isAccessBlocked) {
      sounds.playWarning();
      alert(capacity.isDisabled ? 'Este estudiante está deshabilitado para el evento.' : 'Este estudiante no está habilitado para el evento.');
      return;
    }
    capacity.isFull ? sounds.playWarning() : sounds.playSuccess();
    setCheckinStudent(student);
  };

  /** Registra un movimiento confirmado desde la interfaz.
   * @param {object} movement Datos del movimiento.
   * @returns {Promise<object>} Movimiento registrado.
   */
  const handleConfirmCheckIn = ({ studentId, count, doorName, extraPerson, movementType }) => {
    if (!canRegister) throw new Error('Los movimientos requieren conexión activa con Firebase.');
    return registerCheckIn({
      organizationId: organization.id, eventId: event.id, studentId, count, doorName, extraPerson,
      movementType, updateAnalytics: canManage
    });
  };

  /** Carga la siguiente página de movimientos del evento.
   * @returns {Promise<void>}
   */
  const handleLoadMoreLogs = async () => {
    if (loadingMoreLogs || !hasMoreLogs) return;
    setLoadingMoreLogs(true);
    try {
      const page = await fetchLogPage(organization.id, event.id, { afterLog: logs.at(-1) });
      setLogs((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        page.logs.forEach((item) => byId.set(item.id, item));
        return [...byId.values()].sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || ''))
          || String(right.id || '').localeCompare(String(left.id || '')));
      });
      setHasMoreLogs(page.hasMore);
      allLogsLoadedRef.current = !page.hasMore;
    } finally {
      setLoadingMoreLogs(false);
    }
  };

  /** Recupera todos los movimientos del evento activo.
   * @returns {Promise<Array<object>>} Movimientos completos.
   */
  const handleFetchAllLogs = () => fetchAllLogs(organization.id, event.id);

  if (!authReady) return <LoadingScreen />;
  if (!authUser) return <LoginScreen portal={portal} />;
  if (portal === 'master' && !isMaster) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-white"><h1 className="text-2xl font-black">Acceso maestro restringido</h1><p className="text-sm text-slate-300">Esta cuenta corresponde a una escuela.</p><button onClick={handleLogout} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold">Volver al ingreso</button></main>;
  if (portal === 'school' && isMaster) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-white"><h1 className="text-2xl font-black">Usa el acceso maestro</h1><p className="text-sm text-slate-300">La cuenta maestra se administra desde su portal exclusivo.</p><a href="/master" className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold">Ir al acceso maestro</a><button onClick={handleLogout} className="text-sm font-bold text-slate-300 underline">Cerrar sesión</button></main>;
  if (!organizationReady) return <LoadingScreen message="Cargando organizaciones…" />;
  if (isMaster && !schoolViewForMaster) return <MasterDashboard organizations={organizations} user={authUser} onCreate={handleCreateSchool} onAssignAccount={(data) => assignSchoolAdministrator({ ...data, masterUser: authUser })} onStatusChange={updateOrganizationStatus} onOpenSchool={(organizationId) => { handleOrganizationChange(organizationId); setSchoolViewForMaster(true); }} onMigrateLegacy={handleLegacyMigration} onImportReport={(report) => importMundoPalabraReport({ ...report, user: authUser })} onRestoreStudentStates={(organizationId) => restoreMundoPalabraStudentStates({ organizationId, user: authUser })} onLogout={handleLogout} />;
  if (!organization) return <LoadingScreen message="Tu cuenta no tiene una organización activa." />;
  if ((!membership && !isMaster) || !event) return <LoadingScreen message="Preparando el espacio de la escuela…" />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-sky-500 selection:text-white">
      <Navbar
        activeTab={activeTab} setActiveTab={setActiveTab} event={event}
        currentDoor={currentDoor} onDoorChange={handleDoorChange} events={events}
        onEventChange={handleEventChange} syncMode={syncMode}
        onOpenSettings={() => canManage && setShowSettings(true)} onLogout={handleLogout}
        onBackToMaster={isMaster ? () => setSchoolViewForMaster(false) : undefined}
        organization={organization} organizations={organizations}
        onOrganizationChange={handleOrganizationChange} role={role} permissions={selectableTabs}
      />
      <main className="flex-1 pb-16">
        {activeTab === 'scan' && canRegister && <ScannerModal onScanResult={handleScanResult} onSwitchToManualSearch={() => setActiveTab('search')} currentDoor={currentDoor} />}
        {activeTab === 'search' && canRegister && <ManualSearch students={students} onSelectStudent={setCheckinStudent} onViewQR={(student) => { setPrintStudent(student); setShowPrinter(true); }} />}
        {activeTab === 'dashboard' && <Dashboard event={event} students={students} logs={logs} analytics={logAnalytics} organization={organization} onFetchAllLogs={handleFetchAllLogs} />}
        {activeTab === 'operations' && <OperationalCenter students={students} logs={logs} doors={doorSessions} />}
        {activeTab === 'families' && canManage && <FamiliesCenter students={students} history={familyHistory} onMerge={(ids) => mergeFamilies(organization.id, event.id, ids, students)} onSplit={(familyId, studentId) => separateFamilyMember(organization.id, event.id, familyId, studentId, students)} />}
        {activeTab === 'seating' && canManage && seatPlan && <SeatingManager organization={organization} event={event} students={students} venues={venues} seatPlan={seatPlan} onSaveVenue={async (venue) => { const saved = await saveVenue(organization.id, venue); setVenues((current) => [...current.filter((item) => item.id !== saved.id), saved]); return saved; }} onSavePlan={async (plan) => { const saved = await saveSeatPlan(organization.id, event.id, plan); setSeatPlan(saved); return saved; }} />}
        {activeTab === 'students' && canManage && <StudentsManager students={students} onSaveStudents={(updated) => saveStudentsList(organization.id, event.id, updated)} onSaveCapacities={(updates) => saveStudentCapacities(organization.id, event.id, updates)} onSaveFamily={(studentId, familyId, visibleStudents = students) => saveStudentFamily(organization.id, event.id, studentId, familyId, visibleStudents)} onDeleteStudents={(ids) => deleteStudents(organization.id, event.id, ids)} onOpenCardPrinter={(student) => { setPrintStudent(student); setShowPrinter(true); }} onSelectStudent={setCheckinStudent} />}
        {activeTab === 'events' && canManage && <EventsManager events={events} currentEvent={event} students={students} onSelectEvent={handleEventChange} onCreateEvent={handleCreateEvent} onUpdateEvent={handleSaveEvent} onArchiveEvent={handleArchiveEvent} />}
        {activeTab === 'members' && canManage && <MembersManager organization={organization} currentUserId={authUser.uid} />}
        {activeTab === 'history' && <HistoryLog logs={logs} event={event} students={students} organization={organization} hasMore={hasMoreLogs} loadingMore={loadingMoreLogs} onLoadMore={handleLoadMoreLogs} onFetchAllLogs={handleFetchAllLogs} onDeleteLog={canManage ? (log) => deleteLogEntry(organization.id, event.id, log) : undefined} />}
      </main>
      {checkinStudent && canRegister && <CheckinPanel student={students.find((item) => item.id === checkinStudent.id) || checkinStudent} currentDoor={currentDoor} onConfirmCheckIn={handleConfirmCheckIn} onClose={() => setCheckinStudent(null)} seatPlan={seatPlan} venue={venues.find((item) => item.id === seatPlan?.venueId)} />}
      {showPrinter && <QRCardPrinter students={students} selectedStudent={printStudent} event={event} organization={organization} seatPlan={seatPlan} venue={venues.find((item) => item.id === seatPlan?.venueId)} onClose={() => { setShowPrinter(false); setPrintStudent(null); }} />}
      {canManage && <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} event={event} organization={organization} onSaveOrganization={handleSaveOrganizationBrand} onSaveEvent={handleSaveEvent} currentDoor={currentDoor} onDoorChange={handleDoorChange} onResetData={() => resetEventData(organization.id, event.id)} />}
    </div>
  );
}
