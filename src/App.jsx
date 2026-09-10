import React, { useEffect, useMemo, useState } from 'react';
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
import { sounds } from './services/sound';
import { clearAuthSession, subscribeToAuth } from './services/auth';
import { canManageOrganization, canOperateAccess, isPlatformAdmin } from './services/organizationPolicy';
import {
  getSavedOrganizationId,
  saveOrganizationId,
  createSchoolWithAdministrator,
  importMundoPalabraReport,
  migrateLegacyMundoPalabra,
  subscribeToAllOrganizations,
  updateOrganizationStatus,
  subscribeToMembership,
  subscribeToOrganizations
} from './services/organizations';
import { getCapacityState } from './services/checkinPolicy';
import {
  getCurrentEvent, saveCurrentEvent, subscribeToEvents, createEvent, updateEvent,
  archiveEvent, getCurrentDoor, setCurrentDoor, subscribeToStudents, subscribeToLogs,
  deleteLogEntry, registerCheckIn, saveStudentsList, saveStudentCapacities, deleteStudents,
  resetEventData
} from './services/storage';

function LoadingScreen({ message = 'Cargando acceso seguro…' }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-bold text-sky-100">{message}</main>;
}

export default function App() {
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
    if (!organization || !event || (!membership && !isMaster)) return undefined;
    return subscribeToLogs(organization.id, event.id, (data, mode) => {
      setLogs(data);
      if (mode === 'error') setSyncMode('error');
    });
  }, [organization, event?.id, membership, isMaster]);

  useEffect(() => {
    if (!canManage && (activeTab === 'students' || activeTab === 'events' || activeTab === 'members')) setActiveTab('dashboard');
    if (!canOperate && (activeTab === 'scan' || activeTab === 'search')) setActiveTab('dashboard');
  }, [role, activeTab, canManage, canOperate]);

  const selectableTabs = useMemo(() => ({ canManage, canOperate }), [canManage, canOperate]);

  const handleOrganizationChange = (organizationId) => {
    const selected = organizations.find((item) => item.id === organizationId);
    if (!selected || !authUser) return;
    saveOrganizationId(authUser.uid, selected.id);
    setOrganization(selected);
  };

  const handleCreateSchool = (schoolData) => createSchoolWithAdministrator({ ...schoolData, masterUser: authUser });

  const handleLegacyMigration = (organizationId) => migrateLegacyMundoPalabra({
    organizationId,
    user: authUser
  });

  const handleLogout = async () => {
    await clearAuthSession();
    setCheckinStudent(null);
    setShowPrinter(false);
    setShowSettings(false);
    setSchoolViewForMaster(false);
  };

  const handleDoorChange = (newDoor) => {
    setCurrentDoorState(newDoor);
    setCurrentDoor(organization.id, newDoor);
  };

  const handleSaveEvent = async (updatedEvent) => {
    const normalized = await updateEvent(organization.id, updatedEvent);
    setEvent(normalized);
    return normalized;
  };

  const handleEventChange = (eventOrId) => {
    const selectedId = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id;
    const selected = events.find((item) => item.id === selectedId && !item.archived);
    if (!selected) return;
    setCheckinStudent(null);
    setPrintStudent(null);
    setShowPrinter(false);
    setStudents([]);
    setLogs([]);
    setEvent(saveCurrentEvent(organization.id, selected));
  };

  const handleCreateEvent = async (eventData, copyRoster) => {
    const created = await createEvent(organization.id, {
      ...eventData,
      institution: organization.name
    }, { copyStudents: copyRoster, sourceStudents: students });
    setEvent(created);
    setStudents([]);
    setLogs([]);
    return created;
  };

  const handleArchiveEvent = async (eventId, archived) => {
    if (eventId === event?.id && archived) throw new Error('Selecciona otro evento antes de archivar el evento actual.');
    return archiveEvent(organization.id, eventId, archived);
  };

  const handleScanResult = (decodedText) => {
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

  const handleConfirmCheckIn = ({ studentId, count, doorName, extraPerson }) => registerCheckIn({
    organizationId: organization.id, eventId: event.id, studentId, count, doorName, extraPerson
  });

  if (!authReady) return <LoadingScreen />;
  if (!authUser) return <LoginScreen />;
  if (!organizationReady) return <LoadingScreen message="Cargando organizaciones…" />;
  if (isMaster && !schoolViewForMaster) return <MasterDashboard organizations={organizations} user={authUser} onCreate={handleCreateSchool} onStatusChange={updateOrganizationStatus} onOpenSchool={(organizationId) => { handleOrganizationChange(organizationId); setSchoolViewForMaster(true); }} onMigrateLegacy={handleLegacyMigration} onImportReport={(report) => importMundoPalabraReport({ ...report, user: authUser })} onLogout={handleLogout} />;
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
        {activeTab === 'scan' && canOperate && <ScannerModal onScanResult={handleScanResult} onSwitchToManualSearch={() => setActiveTab('search')} currentDoor={currentDoor} />}
        {activeTab === 'search' && canOperate && <ManualSearch students={students} onSelectStudent={setCheckinStudent} onViewQR={(student) => { setPrintStudent(student); setShowPrinter(true); }} />}
        {activeTab === 'dashboard' && <Dashboard event={event} students={students} logs={logs} />}
        {activeTab === 'students' && canManage && <StudentsManager students={students} onSaveStudents={(updated) => saveStudentsList(organization.id, event.id, updated)} onSaveCapacities={(updates) => saveStudentCapacities(organization.id, event.id, updates)} onDeleteStudents={(ids) => deleteStudents(organization.id, event.id, ids)} onOpenCardPrinter={(student) => { setPrintStudent(student); setShowPrinter(true); }} onSelectStudent={setCheckinStudent} />}
        {activeTab === 'events' && canManage && <EventsManager events={events} currentEvent={event} students={students} onSelectEvent={handleEventChange} onCreateEvent={handleCreateEvent} onArchiveEvent={handleArchiveEvent} />}
        {activeTab === 'members' && canManage && <MembersManager organization={organization} />}
        {activeTab === 'history' && <HistoryLog logs={logs} event={event} students={students} onDeleteLog={canManage ? (log) => deleteLogEntry(organization.id, event.id, log) : undefined} />}
      </main>
      {checkinStudent && canOperate && <CheckinPanel student={students.find((item) => item.id === checkinStudent.id) || checkinStudent} currentDoor={currentDoor} onConfirmCheckIn={handleConfirmCheckIn} onClose={() => setCheckinStudent(null)} />}
      {showPrinter && <QRCardPrinter students={students} selectedStudent={printStudent} event={event} onClose={() => { setShowPrinter(false); setPrintStudent(null); }} />}
      {canManage && <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} event={event} onSaveEvent={handleSaveEvent} currentDoor={currentDoor} onDoorChange={handleDoorChange} onResetData={() => resetEventData(organization.id, event.id)} />}
    </div>
  );
}
