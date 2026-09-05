import React, { useState, useEffect } from 'react';
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
import { sounds } from './services/sound';
import {
  AUTH_SESSION_KEY,
  clearAuthSession,
  getActiveAuthSession
} from './services/auth';
import { getCapacityState } from './services/checkinPolicy';
import { 
  getCurrentEvent, 
  saveCurrentEvent, 
  getCurrentDoor, 
  setCurrentDoor, 
  subscribeToStudents, 
  subscribeToLogs, 
  registerCheckIn, 
  saveStudentsList, 
  resetEventData 
} from './services/storage';

export default function App() {
  const [authSession, setAuthSession] = useState(getActiveAuthSession);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [event, setEvent] = useState(getCurrentEvent());
  const [currentDoor, setCurrentDoorState] = useState(getCurrentDoor());
  const [students, setStudents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [syncMode, setSyncMode] = useState('local');

  // Modals & Active actions
  const [checkinStudent, setCheckinStudent] = useState(null);
  const [printStudent, setPrintStudent] = useState(null);
  const [showPrinter, setShowPrinter] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Subscribe to students and logs
  useEffect(() => {
    if (!authSession) {
      setStudents([]);
      setLogs([]);
      return undefined;
    }

    const unsubStudents = subscribeToStudents(event.id, (data, mode) => {
      setStudents(data);
      if (mode) setSyncMode(mode);
    });

    const unsubLogs = subscribeToLogs(event.id, (data, mode) => {
      setLogs(data);
      if (mode === 'error') setSyncMode('error');
    });

    return () => {
      if (unsubStudents) unsubStudents();
      if (unsubLogs) unsubLogs();
    };
  }, [event.id, authSession]);

  useEffect(() => {
    if (!authSession) return undefined;

    const remainingTime = authSession.expiresAt - Date.now();
    if (remainingTime <= 0) {
      clearAuthSession();
      setAuthSession(null);
      return undefined;
    }

    const expirationTimer = window.setTimeout(() => {
      clearAuthSession();
      setAuthSession(null);
    }, remainingTime);

    const handleStorage = (event) => {
      if (event.key === AUTH_SESSION_KEY) {
        setAuthSession(getActiveAuthSession());
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.clearTimeout(expirationTimer);
      window.removeEventListener('storage', handleStorage);
    };
  }, [authSession]);

  const handleLogout = () => {
    clearAuthSession();
    setAuthSession(null);
    setCheckinStudent(null);
    setPrintStudent(null);
    setShowPrinter(false);
    setShowSettings(false);
  };

  // Handle door change
  const handleDoorChange = (newDoor) => {
    setCurrentDoorState(newDoor);
    setCurrentDoor(newDoor);
  };

  // Handle Event save
  const handleSaveEvent = (updatedEvent) => {
    const normalizedEvent = saveCurrentEvent(updatedEvent);
    setEvent(normalizedEvent);
  };

  // Handle QR scan detection
  const handleScanResult = (decodedText) => {
    // Look up student by code / ID or exact match
    const student = students.find((s) => s.id === decodedText || s.id.toLowerCase() === decodedText.toLowerCase());

    if (student) {
      const capacity = getCapacityState(student);
      if (capacity.isFull) {
        sounds.playWarning();
      } else {
        sounds.playSuccess();
      }
      setCheckinStudent(student);
    } else {
      sounds.playWarning();
      alert(`Código QR escaneado: "${decodedText}"\n\nNo se encontró ningún estudiante asociado a este código.`);
    }
  };

  // Perform check-in
  const handleConfirmCheckIn = async ({ studentId, count, doorName, extraPerson }) => {
    const result = await registerCheckIn({
      eventId: event.id,
      studentId,
      count,
      doorName,
      extraPerson
    });
    return result;
  };

  // Open QR Card Printer
  const handleOpenPrinter = (student = null) => {
    setPrintStudent(student);
    setShowPrinter(true);
  };

  if (!authSession) {
    return <LoginScreen onLogin={setAuthSession} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        event={event}
        currentDoor={currentDoor}
        onDoorChange={handleDoorChange}
        syncMode={syncMode}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'scan' && (
          <ScannerModal
            onScanResult={handleScanResult}
            onSwitchToManualSearch={() => setActiveTab('search')}
            currentDoor={currentDoor}
          />
        )}

        {activeTab === 'search' && (
          <ManualSearch
            students={students}
            onSelectStudent={(s) => setCheckinStudent(s)}
            onViewQR={(s) => handleOpenPrinter(s)}
          />
        )}

        {activeTab === 'dashboard' && (
          <Dashboard
            event={event}
            students={students}
            logs={logs}
          />
        )}

        {activeTab === 'students' && (
          <StudentsManager
            students={students}
            onSaveStudents={(updated) => saveStudentsList(event.id, updated)}
            onOpenCardPrinter={(s) => handleOpenPrinter(s)}
            onSelectStudent={(s) => setCheckinStudent(s)}
          />
        )}

        {activeTab === 'history' && (
          <HistoryLog
            logs={logs}
            event={event}
            students={students}
          />
        )}
      </main>

      {/* Check-in Action Modal */}
      {checkinStudent && (
        <CheckinPanel
          student={students.find((student) => student.id === checkinStudent.id) || checkinStudent}
          currentDoor={currentDoor}
          onConfirmCheckIn={handleConfirmCheckIn}
          onClose={() => setCheckinStudent(null)}
        />
      )}

      {/* QR Cards Printable Modal */}
      {showPrinter && (
        <QRCardPrinter
          students={students}
          selectedStudent={printStudent}
          event={event}
          onClose={() => {
            setShowPrinter(false);
            setPrintStudent(null);
          }}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        event={event}
        onSaveEvent={handleSaveEvent}
        currentDoor={currentDoor}
        onDoorChange={handleDoorChange}
        onResetData={() => resetEventData(event.id)}
      />
    </div>
  );
}
