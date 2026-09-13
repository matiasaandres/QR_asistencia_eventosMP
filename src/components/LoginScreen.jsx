/**
 * Pantalla de acceso escolar o maestro. Gestiona login, Google, invitaciones y
 * recuperación de contraseña; la identidad final la valida Firebase Auth.
 */

import React, { useState } from 'react';
import { ArrowLeft, KeyRound, LogIn, Mail, Send, ShieldCheck, TicketCheck, Users } from 'lucide-react';
import { authenticate, authenticateWithGoogle, joinOrganization, requestPasswordReset } from '../services/auth';
import { APP_VERSION } from '../config/appVersion';

/** Traduce errores de autenticación a mensajes para el usuario.
 * @param {Error|object} error Error recibido desde Firebase.
 * @returns {string} Mensaje localizado.
 */
function authMessage(error) {
  const code = error?.code || '';
  if (code.includes('popup-closed-by-user')) return 'El inicio de sesión con Google fue cancelado.';
  if (code.includes('popup-blocked')) return 'La ventana emergente de Google fue bloqueada por el navegador.';
  if (code.includes('invalid-email')) return 'Ingresa un correo electrónico válido.';
  if (code.includes('invalid-credential')) return 'Correo o contraseña incorrectos.';
  if (code.includes('email-already-in-use')) return 'Este correo ya tiene una cuenta. Usa su contraseña actual para aceptar la invitación.';
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos seis caracteres.';
  if (code.includes('too-many-requests')) return 'Se realizaron demasiados intentos. Espera unos minutos antes de volver a probar.';
  if (code.includes('operation-not-allowed')) return 'El acceso seleccionado todavía no está habilitado en Firebase.';
  if (code.includes('network-request-failed')) return 'No hay conexión con el servicio de acceso.';
  return error?.message || 'No fue posible completar el acceso.';
}

/** Renderiza el formulario de autenticación del portal.
 * @param {{portal?: string}} props Tipo de portal.
 * @returns {JSX.Element} Pantalla de autenticación.
 */
export default function LoginScreen({ portal = 'school' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  /** Procesa el envío de autenticación, recuperación o invitación.
   * @param {SubmitEvent} event Evento de envío del formulario.
   * @returns {Promise<void>}
   */
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === 'recover') {
        await requestPasswordReset(normalizedEmail);
        setMessage('Enviamos un enlace para crear una nueva contraseña. Revisa también tu carpeta de correo no deseado.');
        return;
      }
      if (mode === 'invite') {
        await joinOrganization({ invitationCode, email: normalizedEmail, password });
        return;
      }
      await authenticate(email, password);
    } catch (authError) {
      setError(authMessage(authError));
    } finally {
      setIsSaving(false);
    }
  };

  /** Inicia sesión mediante Google.
   * @returns {Promise<void>}
   */
  const handleGoogleSignIn = async () => {
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      await authenticateWithGoogle();
    } catch (authError) {
      setError(authMessage(authError));
    } finally {
      setIsSaving(false);
    }
  };

  /** Cambia el modo visible del formulario de acceso.
   * @param {string} nextMode Nuevo modo del formulario.
   * @returns {void}
   */
  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setPassword('');
    if (nextMode !== 'invite') setInvitationCode('');
  };

  const title = mode === 'invite'
    ? 'Aceptar invitación'
    : mode === 'recover'
      ? 'Recuperar contraseña'
      : portal === 'master' ? 'Acceso Maestro' : 'Acceso Escuelas';
  const subtitle = mode === 'invite'
    ? 'Usa el código enviado por la administración de tu escuela.'
    : mode === 'recover'
      ? 'Te enviaremos un enlace seguro a tu correo.'
      : portal === 'master' ? 'Administración general de escuelas.' : 'Control de acceso para tu comunidad escolar.';

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4 selection:bg-sky-500 selection:text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white shadow-2xl shadow-black/30 overflow-hidden">
        <div className="bg-gradient-to-b from-white to-sky-50 px-7 pb-5 pt-7 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-sky-600 text-white shadow-lg shadow-sky-600/25">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-slate-950">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-7 pb-7 pt-2" noValidate>
              <>
                {mode === 'invite' && <label className="block text-sm font-bold text-slate-700">
                  Código de invitación
                  <span className="relative mt-1.5 block">
                    <TicketCheck className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input required autoComplete="one-time-code" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.toUpperCase())} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 font-mono font-bold uppercase tracking-wider outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="Código recibido" />
                  </span>
                </label>}
                <label className="block text-sm font-bold text-slate-700">
                  Correo electrónico
                  <span className="relative mt-1.5 block">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="administracion@colegio.cl" />
                  </span>
                </label>
                {mode !== 'recover' && <label className="block text-sm font-bold text-slate-700">
                  Contraseña
                  <span className="relative mt-1.5 block">
                    <KeyRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input required minLength="6" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-3 outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="Contraseña" />
                  </span>
                  {mode === 'invite' && <span className="mt-1 block text-[11px] font-medium text-slate-500">Si ya tienes una cuenta, usa tu contraseña actual. Si eres nuevo, crea una de al menos seis caracteres.</span>}
                </label>}
              </>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}
            {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">{message}</p>}

            <button disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-500 disabled:opacity-60">
              {mode === 'recover' ? <Send className="h-5 w-5" /> : mode === 'invite' ? <TicketCheck className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
              {isSaving ? 'Procesando…' : mode === 'recover' ? 'Enviar enlace de recuperación' : mode === 'invite' ? 'Aceptar e ingresar a la escuela' : 'Ingresar a la aplicación'}
            </button>

            {mode === 'login' && (
              <>
                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-3 text-slate-400 font-semibold">o también</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSaving}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:opacity-60"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  Iniciar sesión con Google
                </button>
              </>
            )}

            {mode === 'login' ? <div className="space-y-2 text-center pt-1">
              <button type="button" onClick={() => changeMode('recover')} className="block w-full text-xs font-bold text-sky-700 hover:underline">¿Olvidaste tu contraseña?</button>
              {portal === 'school' && <button type="button" onClick={() => changeMode('invite')} className="block w-full text-xs font-bold text-indigo-700 hover:underline">Tengo un código de invitación</button>}
              {portal === 'school' && <p className="text-xs font-semibold text-emerald-700">¿Necesitas recuperar un QR? Solicítalo a la administración de tu escuela.</p>}
              <p className="text-xs text-slate-400">Las cuentas escolares son creadas por la administración de la plataforma.</p>
              <a href={portal === 'master' ? '/' : '/master'} className="block text-xs font-bold text-sky-700 hover:underline">{portal === 'master' ? 'Ir al acceso de escuelas' : 'Ingresar a la cuenta maestra'}</a>
            </div> : <button type="button" onClick={() => changeMode('login')} className="flex w-full items-center justify-center gap-1 text-xs font-bold text-sky-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Volver al ingreso</button>}
            <p className="text-center text-[11px] font-semibold text-slate-400">Versión {APP_VERSION}</p>
        </form>
      </div>
    </main>
  );
}

