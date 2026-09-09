import React, { useState } from 'react';
import { Building2, KeyRound, LogIn, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { authenticate, joinOrganization, registerOrganization } from '../services/auth';
import { APP_VERSION } from '../config/appVersion';

function authMessage(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential')) return 'Correo o contraseña incorrectos.';
  if (code.includes('email-already-in-use')) return 'Ese correo ya tiene una cuenta.';
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('operation-not-allowed')) return 'El acceso por correo todavía no está habilitado en Firebase.';
  if (code.includes('network-request-failed')) return 'No hay conexión con el servicio de acceso.';
  return error?.message || 'No fue posible completar el acceso.';
}

export default function LoginScreen() {
  const [mode, setMode] = useState('login');
  const [schoolName, setSchoolName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      if (mode === 'register') {
        await registerOrganization({ schoolName, email, password });
      } else if (mode === 'join') {
        await joinOrganization({ invitationCode, email, password });
      } else {
        await authenticate(email, password);
      }
    } catch (authError) {
      setError(authMessage(authError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4 selection:bg-sky-500 selection:text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white shadow-2xl shadow-black/30 overflow-hidden">
        <div className="bg-gradient-to-b from-white to-sky-50 px-7 pb-5 pt-7 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-600 text-white shadow-lg shadow-sky-600/25">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-slate-950">Acceso Escolar</h1>
          <p className="mt-1 text-sm text-slate-500">Control de acceso seguro para eventos escolares.</p>
        </div>

        <div className="mx-7 mb-5 grid grid-cols-3 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Tipo de acceso">
          <button type="button" onClick={() => { setMode('login'); setError(''); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === 'login' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>Ingresar</button>
          <button type="button" onClick={() => { setMode('register'); setError(''); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === 'register' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>Nueva escuela</button>
          <button type="button" onClick={() => { setMode('join'); setError(''); }} className={`rounded-lg px-2 py-2 text-sm font-bold ${mode === 'join' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}>Invitación</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-7 pb-7" noValidate>
          {mode === 'register' && (
            <label className="block text-sm font-bold text-slate-700">
              Nombre de la escuela
              <span className="relative mt-1.5 block">
                <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input required minLength="2" maxLength="100" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="Colegio Ejemplo" />
              </span>
            </label>
          )}
          {mode === 'join' && (
            <label className="block text-sm font-bold text-slate-700">
              Código de invitación
              <input required value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.toUpperCase())} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono uppercase tracking-widest outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="CÓDIGO" />
            </label>
          )}
          <label className="block text-sm font-bold text-slate-700">
            Correo electrónico
            <span className="relative mt-1.5 block">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="administracion@colegio.cl" />
            </span>
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Contraseña
            <span className="relative mt-1.5 block">
              <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input required minLength="6" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="Mínimo 6 caracteres" />
            </span>
          </label>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}

          <button disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-500 disabled:opacity-60">
            {mode === 'register' ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            {isSaving ? 'Procesando…' : mode === 'register' ? 'Crear escuela y cuenta' : mode === 'join' ? 'Aceptar invitación' : 'Ingresar a la aplicación'}
          </button>
          <p className="text-center text-xs text-slate-400">Cada escuela mantiene sus usuarios, eventos y estudiantes separados.</p>
          <p className="text-center text-[11px] font-semibold text-slate-400">Versión {APP_VERSION}</p>
        </form>
      </div>
    </main>
  );
}
