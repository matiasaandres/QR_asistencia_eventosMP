import React, { useEffect, useState } from 'react';
import { Copy, MailPlus, Shield, UserCog } from 'lucide-react';
import { createInvitation, subscribeToMembers } from '../services/organizations';

const ROLE_LABELS = { admin: 'Administrador', operator: 'Operador de acceso', viewer: 'Solo consulta' };

export default function MembersManager({ organization }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operator');
  const [result, setResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => subscribeToMembers(organization.id, setMembers), [organization.id]);

  const handleInvite = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setResult(null);
    try {
      const invitation = await createInvitation({ organization, email, role });
      setResult({ ...invitation, email: email.trim().toLowerCase() });
      setEmail('');
    } catch (error) {
      alert(`No fue posible crear la invitación: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-700">Seguridad</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Usuarios y roles</h1>
        <p className="mt-1 text-sm text-slate-600">Cada persona usa su propia cuenta. Las invitaciones vencen después de siete días.</p>
      </div>

      <form onSubmit={handleInvite} className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <h2 className="flex items-center gap-2 font-extrabold text-sky-950"><MailPlus className="h-5 w-5" /> Invitar usuario</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operador@colegio.cl" className="rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300" />
          <select value={role} onChange={(event) => setRole(event.target.value)} className="rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-300">
            <option value="operator">Operador</option>
            <option value="viewer">Solo consulta</option>
            <option value="admin">Administrador</option>
          </select>
          <button disabled={isSaving} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-500 disabled:opacity-60">{isSaving ? 'Creando…' : 'Crear invitación'}</button>
        </div>
      </form>

      {result && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <p className="font-extrabold">Invitación creada para {result.email}</p>
          <p className="mt-1 text-sm">Envía este código por un canal seguro. La persona debe elegir “Invitación” al ingresar.</p>
          <div className="mt-3 flex items-center gap-3">
            <code className="rounded-xl bg-white px-4 py-2 font-black tracking-widest">{result.code}</code>
            <button type="button" onClick={() => navigator.clipboard.writeText(result.code)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold hover:bg-emerald-100"><Copy className="h-4 w-4" /> Copiar</button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="flex items-center gap-2 font-extrabold text-slate-900"><UserCog className="h-5 w-5 text-sky-600" /> Miembros activos ({members.length})</h2></div>
        <div className="divide-y divide-slate-100">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div><p className="font-bold text-slate-900">{member.displayName || member.email}</p><p className="text-xs text-slate-500">{member.email}</p></div>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800"><Shield className="h-3.5 w-3.5" /> {ROLE_LABELS[member.role] || member.role}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
