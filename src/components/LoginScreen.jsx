import React, { useState } from 'react';
import { KeyRound, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { authenticate } from '../services/auth';
import { APP_VERSION } from '../config/appVersion';
import { MASTER_ADMIN_EMAIL } from '../services/organizationPolicy';

function authMessage(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential')) return 'Correo o contraseña incorrectos.';
  if (code.includes('operation-not-allowed')) return 'El acceso por correo todavía no está habilitado en Firebase.';
  if (code.includes('network-request-failed')) return 'No hay conexión con el servicio de acceso.';
  return error?.message || 'No fue posible completar el acceso.';
}

export default function LoginScreen({ portal = 'school' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (portal === 'master' && normalizedEmail !== MASTER_ADMIN_EMAIL) {
        throw new Error('Este acceso es exclusivo para la cuenta maestra.');
      }
      if (portal === 'school' && normalizedEmail === MASTER_ADMIN_EMAIL) {
        throw new Error('La cuenta maestra debe ingresar desde Acceso maestro.');
      }
      await authenticate(email, password);
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
          <h1 className="mt-4 text-2xl font-black text-slate-950">{portal === 'master' ? 'Acceso Maestro' : 'Acceso Escuelas'}</h1>
          <p className="mt-1 text-sm text-slate-500">{portal === 'master' ? 'Administración general de escuelas.' : 'Control de acceso para tu comunidad escolar.'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-7 pb-7 pt-2" noValidate>
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
              <input required minLength="6" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="Contraseña" />
            </span>
          </label>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}

          <button disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-500 disabled:opacity-60">
            <LogIn className="h-5 w-5" />
            {isSaving ? 'Ingresando…' : 'Ingresar a la aplicación'}
          </button>
          <p className="text-center text-xs text-slate-400">Las cuentas escolares son creadas por la administración de la plataforma.</p>
          <a href={portal === 'master' ? '/' : '/master'} className="block text-center text-xs font-bold text-sky-700 hover:underline">{portal === 'master' ? 'Ir al acceso de escuelas' : 'Ingresar a la cuenta maestra'}</a>
          <p className="text-center text-[11px] font-semibold text-slate-400">Versión {APP_VERSION}</p>
        </form>
      </div>
    </main>
  );
}
