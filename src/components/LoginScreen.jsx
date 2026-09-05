import React, { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, User } from 'lucide-react';
import { authenticate } from '../services/auth';
import { APP_VERSION } from '../config/appVersion';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
            <p className="mt-1 text-sm text-slate-500">Ingresa tus credenciales para continuar.</p>
          </div>

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
        </div>
      </div>
    </main>
  );
}
