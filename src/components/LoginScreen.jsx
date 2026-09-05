import React, { useState } from 'react';
import { KeyRound, LogIn, QrCode, ShieldCheck, User, Users } from 'lucide-react';
import { authenticate } from '../services/auth';
import { findStudentForGuardian } from '../services/guardianAccess';
import { APP_VERSION } from '../config/appVersion';

export default function LoginScreen({ onLogin, students = [], onGuardianQr }) {
  const [accessType, setAccessType] = useState('staff');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rut, setRut] = useState('');
  const [course, setCourse] = useState('');
  const [error, setError] = useState('');

  const courses = Array.from(new Set(
    students
      .filter((student) => student.status !== 'RETIRADO' && student.rut)
      .map((student) => student.course)
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const session = authenticate(username, password);

    if (!session) {
      setError('Nombre de usuario o contraseña incorrectos.');
      return;
    }

    setError('');
    onLogin(session);
  };

  const handleGuardianSubmit = (event) => {
    event.preventDefault();
    const student = findStudentForGuardian(students, rut, course);

    if (!student) {
      setError('No encontramos un estudiante activo con ese RUT y curso. Revisa los datos e intenta nuevamente.');
      return;
    }

    setError('');
    onGuardianQr(student);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4 selection:bg-sky-500 selection:text-white">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 overflow-hidden border border-white/20">
          <div className="px-7 pt-7 pb-5 text-center bg-gradient-to-b from-white to-sky-50">
            <img
              src="/logo-mundopalabra.png"
              alt="Logo de MundoPalabra"
              className="h-40 w-full object-contain mx-auto"
            />
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              Acceso autorizado
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Control de Asistencia</h1>
            <p className="mt-1 text-sm text-slate-500">Acceso del personal y recuperación de QR para apoderados.</p>
          </div>

          <div className="mx-7 mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Tipo de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={accessType === 'staff'}
              onClick={() => { setAccessType('staff'); setError(''); }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${accessType === 'staff' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
            >
              <ShieldCheck className="h-4 w-4" />
              Personal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={accessType === 'guardian'}
              onClick={() => { setAccessType('guardian'); setError(''); }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${accessType === 'guardian' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
            >
              <Users className="h-4 w-4" />
              Apoderados
            </button>
          </div>

          {accessType === 'staff' ? (
          <form onSubmit={handleSubmit} className="px-7 pb-7 space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="block text-sm font-bold text-slate-700 mb-1.5">
                Nombre de usuario
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setError('');
                  }}
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  placeholder="Usuario"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError('');
                  }}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  placeholder="Contraseña"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-sky-600/25 transition hover:bg-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-200"
            >
              <LogIn className="w-5 h-5" />
              Ingresar a la aplicación
            </button>

            <p className="text-center text-xs text-slate-400">
              La sesión permanecerá activa durante 5 horas.
            </p>
            <p className="text-center text-[11px] font-semibold text-slate-400" aria-label={`Versión de la aplicación ${APP_VERSION}`}>
              Versión {APP_VERSION}
            </p>
          </form>
          ) : (
          <form onSubmit={handleGuardianSubmit} className="px-7 pb-7 space-y-4" noValidate>
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
              Ingresa el RUT del estudiante y selecciona su curso para recuperar su QR.
            </div>

            <div>
              <label htmlFor="guardian-rut" className="block text-sm font-bold text-slate-700 mb-1.5">RUT del estudiante</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="guardian-rut"
                  type="text"
                  value={rut}
                  onChange={(event) => { setRut(event.target.value); setError(''); }}
                  autoComplete="off"
                  inputMode="text"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  placeholder="12.345.678-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="guardian-course" className="block text-sm font-bold text-slate-700 mb-1.5">Curso</label>
              <select
                id="guardian-course"
                value={course}
                onChange={(event) => { setCourse(event.target.value); setError(''); }}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              >
                <option value="">Selecciona el curso</option>
                {courses.map((courseName) => <option key={courseName} value={courseName}>{courseName}</option>)}
              </select>
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={!students.length}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-sky-600/25 transition hover:bg-sky-500 disabled:cursor-wait disabled:bg-slate-300 focus:outline-none focus:ring-4 focus:ring-sky-200"
            >
              <QrCode className="w-5 h-5" />
              {students.length ? 'Generar mi QR' : 'Cargando estudiantes…'}
            </button>

            <p className="text-center text-xs text-slate-400">El QR contiene solo el código interno del estudiante, no su RUT.</p>
            <p className="text-center text-[11px] font-semibold text-slate-400">Versión {APP_VERSION}</p>
          </form>
          )}
        </div>
      </div>
    </main>
  );
}
