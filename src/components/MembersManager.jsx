import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Eye, KeyRound, MailPlus, ScanLine, Shield, ShieldCheck, Trash2, UserCheck, UserCog, UserX, XCircle } from 'lucide-react';
import { createInvitation, removeOrganizationMember, subscribeToMembers, updateOrganizationMemberStatus } from '../services/organizations';

const ROLE_LABELS = { admin: 'Administrador', operator: 'Operador de acceso', viewer: 'Solo consulta' };

const ROLE_DETAILS = [
  {
    id: 'admin',
    name: 'Administrador',
    subtitle: 'Gestión completa de la escuela',
    icon: ShieldCheck,
    accent: 'text-violet-700',
    surface: 'border-violet-200 bg-violet-50/60',
    badge: 'bg-violet-100 text-violet-800',
    recommended: 'Dirección, encargado del evento o responsable formal de la plataforma.',
    allowed: [
      'Consulta el dashboard en vivo, estadísticas por curso, ocupación, puertas y últimos ingresos.',
      'Descarga informes PDF para Dirección y UTP, reportes Excel y credenciales QR.',
      'Escanea códigos QR, busca estudiantes manualmente y registra ingresos normales o extraordinarios.',
      'Administra la nómina: agrega, importa, edita cupos, activa, deshabilita o elimina estudiantes y cursos.',
      'Crea, selecciona y archiva eventos; define fecha, cupo inicial, puertas y cursos participantes.',
      'Configura el nombre, logo y color institucional de la escuela.',
      'Corrige la bitácora eliminando registros incorrectos y puede reiniciar toda la asistencia del evento.',
      'Crea invitaciones, revisa usuarios activos o deshabilitados, reactiva cuentas y elimina accesos de la escuela.'
    ],
    restricted: [
      'No administra otras escuelas ni funciones globales de la plataforma; esas acciones pertenecen exclusivamente a la cuenta maestra.',
      'Debe reservarse para pocas personas, porque puede modificar nóminas, cupos, eventos y datos de asistencia.'
    ]
  },
  {
    id: 'operator',
    name: 'Operador de acceso',
    subtitle: 'Registro de ingresos durante el evento',
    icon: ScanLine,
    accent: 'text-sky-700',
    surface: 'border-sky-200 bg-sky-50/60',
    badge: 'bg-sky-100 text-sky-800',
    recommended: 'Personal ubicado en puertas, recepción o puntos de control.',
    allowed: [
      'Escanea credenciales QR y busca estudiantes manualmente.',
      'Registra cantidades de personas dentro del cupo disponible y confirma ingresos extraordinarios cuando corresponde.',
      'Selecciona la puerta desde la que está trabajando y puede cambiar entre eventos activos disponibles.',
      'Consulta el dashboard en vivo, el avance por curso, la actividad por hora y el flujo por puerta.',
      'Consulta la bitácora completa y descarga reportes disponibles.',
      'Puede visualizar y descargar la credencial individual de un estudiante desde la búsqueda manual.'
    ],
    restricted: [
      'No agrega, importa, elimina, deshabilita ni cambia los cupos de estudiantes.',
      'No crea, modifica ni archiva eventos y tampoco elige qué cursos forman una nueva nómina.',
      'No elimina registros del historial, no reinicia la asistencia y no cambia la identidad o configuración de la escuela.',
      'No invita usuarios ni puede asignar o cambiar roles.'
    ]
  },
  {
    id: 'viewer',
    name: 'Solo consulta',
    subtitle: 'Seguimiento sin capacidad de modificación',
    icon: Eye,
    accent: 'text-emerald-700',
    surface: 'border-emerald-200 bg-emerald-50/60',
    badge: 'bg-emerald-100 text-emerald-800',
    recommended: 'Dirección, UTP o personas que necesitan supervisar sin operar accesos.',
    allowed: [
      'Consulta el dashboard en vivo y todos sus indicadores de participación y uso de cupos.',
      'Revisa la bitácora de ingresos y puede buscar información dentro del historial.',
      'Cambia entre eventos activos para consultar sus resultados.',
      'Descarga el informe PDF de gestión y los reportes Excel disponibles.'
    ],
    restricted: [
      'No escanea QR, no busca estudiantes para registrar accesos y no confirma ingresos.',
      'No visualiza la administración de nóminas, eventos, usuarios ni configuración.',
      'No modifica estudiantes, cupos, puertas, identidad institucional o datos del evento.',
      'No corrige registros, no reinicia la asistencia y no crea invitaciones.'
    ]
  }
];

const PERMISSION_MATRIX = [
  ['Ver dashboard, estadísticas e historial', true, true, true],
  ['Descargar informes PDF y Excel', true, true, true],
  ['Cambiar entre eventos activos', true, true, true],
  ['Escanear QR y registrar ingresos', true, true, false],
  ['Buscar estudiantes y descargar su QR individual', true, true, false],
  ['Registrar un cupo extraordinario identificado', true, true, false],
  ['Administrar estudiantes, cursos y cupos', true, false, false],
  ['Crear, configurar y archivar eventos', true, false, false],
  ['Eliminar registros o reiniciar asistencia', true, false, false],
  ['Configurar nombre, logo y color de la escuela', true, false, false],
  ['Crear invitaciones y consultar miembros', true, false, false]
];

export default function MembersManager({ organization, currentUserId }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operator');
  const [result, setResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState('');

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

  const handleMemberStatus = async (member) => {
    const nextStatus = member.status === 'disabled' ? 'active' : 'disabled';
    const action = nextStatus === 'disabled' ? 'deshabilitar' : 'reactivar';
    if (!window.confirm(`¿${action[0].toUpperCase()}${action.slice(1)} a ${member.displayName || member.email}?${nextStatus === 'disabled' ? '\n\nPerderá inmediatamente el acceso a esta escuela, pero su cuenta y registro se conservarán.' : '\n\nRecuperará el acceso con el mismo rol que tenía asignado.'}`)) return;
    setBusyMemberId(member.id);
    try {
      await updateOrganizationMemberStatus({ organizationId: organization.id, userId: member.id, status: nextStatus });
    } catch (error) {
      alert(`No fue posible ${action} al usuario: ${error.message}`);
    } finally {
      setBusyMemberId('');
    }
  };

  const handleRemoveMember = async (member) => {
    const name = member.displayName || member.email;
    if (!window.confirm(`¿Eliminar el acceso de ${name}?\n\nLa persona dejará de pertenecer a esta escuela y desaparecerá de esta lista. Su cuenta general no se elimina y podrá volver a incorporarse mediante una nueva invitación.`)) return;
    setBusyMemberId(member.id);
    try {
      await removeOrganizationMember({ organizationId: organization.id, userId: member.id });
    } catch (error) {
      alert(`No fue posible eliminar el acceso: ${error.message}`);
    } finally {
      setBusyMemberId('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-700">Seguridad</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Usuarios y roles</h1>
        <p className="mt-1 text-sm text-slate-600">Cada persona usa su propia cuenta. Las invitaciones vencen después de siete días.</p>
      </div>

      <section className="space-y-4" aria-labelledby="role-guide-title">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><KeyRound className="h-5 w-5" /></div>
            <div><h2 id="role-guide-title" className="text-lg font-black text-slate-950">Guía detallada de permisos</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Asigna a cada persona el nivel mínimo que necesita para su trabajo. Los permisos se aplican dentro de esta escuela y se validan tanto en la interfaz como en la base de datos.</p></div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {ROLE_DETAILS.map((roleDetail) => {
            const RoleIcon = roleDetail.icon;
            return <article key={roleDetail.id} className={`rounded-2xl border p-5 ${roleDetail.surface}`}>
              <div className="flex items-start justify-between gap-3"><div className={`rounded-xl bg-white p-2.5 shadow-sm ${roleDetail.accent}`}><RoleIcon className="h-5 w-5" /></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${roleDetail.badge}`}>{roleDetail.name}</span></div>
              <h3 className="mt-4 text-lg font-black text-slate-950">{roleDetail.subtitle}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600"><strong>Recomendado para:</strong> {roleDetail.recommended}</p>
              <div className="mt-4"><h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Puede hacer</h4><ul className="mt-2 space-y-2">{roleDetail.allowed.map((permission) => <li key={permission} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{permission}</li>)}</ul></div>
              <div className="mt-5 border-t border-slate-200/80 pt-4"><h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-rose-800"><XCircle className="h-4 w-4" /> Límites del rol</h4><ul className="mt-2 space-y-2">{roleDetail.restricted.map((restriction) => <li key={restriction} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />{restriction}</li>)}</ul></div>
            </article>;
          })}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4"><h3 className="font-extrabold text-slate-950">Comparación rápida de permisos</h3><p className="mt-1 text-xs text-slate-500">Esta tabla resume las acciones disponibles en la aplicación.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 font-extrabold">Acción</th><th className="px-4 py-3 text-center font-extrabold">Administrador</th><th className="px-4 py-3 text-center font-extrabold">Operador</th><th className="px-4 py-3 text-center font-extrabold">Solo consulta</th></tr></thead><tbody className="divide-y divide-slate-100">{PERMISSION_MATRIX.map(([label, ...values]) => <tr key={label}><td className="px-5 py-3 font-semibold text-slate-700">{label}</td>{values.map((allowed, index) => <td key={`${label}-${index}`} className="px-4 py-3 text-center">{allowed ? <CheckCircle2 aria-label="Permitido" className="mx-auto h-4 w-4 text-emerald-600" /> : <XCircle aria-label="No permitido" className="mx-auto h-4 w-4 text-slate-300" />}</td>)}</tr>)}</tbody></table></div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><h3 className="text-sm font-extrabold">Buenas prácticas de seguridad</h3><p className="mt-1 text-xs leading-relaxed">No compartas cuentas ni contraseñas. Crea una invitación para cada persona, verifica cuidadosamente el correo y asigna Administrador solo a quienes deban modificar información sensible. Cada invitación funciona para el correo indicado, puede utilizarse una sola vez y vence después de siete días.</p></div></div>
      </section>

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
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="flex items-center gap-2 font-extrabold text-slate-900"><UserCog className="h-5 w-5 text-sky-600" /> Usuarios de la escuela ({members.length})</h2><p className="mt-1 text-xs text-slate-500">Deshabilitar conserva la cuenta y su rol. Eliminar quita completamente su acceso a esta escuela.</p></div>
        <div className="divide-y divide-slate-100">
          {members.map((member) => {
            const isOwner = member.id === organization.ownerUid;
            const isSelf = member.id === currentUserId;
            const isDisabled = member.status === 'disabled';
            const isProtected = isOwner || isSelf;
            return <div key={member.id} className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${isDisabled ? 'bg-slate-50 opacity-75' : ''}`}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-bold text-slate-900">{member.displayName || member.email}</p>{isOwner && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-800">Propietario</span>}{isSelf && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">Tu cuenta</span>}</div><p className="truncate text-xs text-slate-500">{member.email}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800"><Shield className="h-3.5 w-3.5" /> {ROLE_LABELS[member.role] || member.role}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${isDisabled ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{isDisabled ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}{isDisabled ? 'Deshabilitado' : 'Activo'}</span>
                <button type="button" disabled={isProtected || busyMemberId === member.id} onClick={() => handleMemberStatus(member)} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${isDisabled ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'}`} title={isProtected ? 'La cuenta propietaria o tu propia cuenta no puede modificarse desde aquí' : ''}>{isDisabled ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}{isDisabled ? 'Reactivar' : 'Deshabilitar'}</button>
                <button type="button" disabled={isProtected || busyMemberId === member.id} onClick={() => handleRemoveMember(member)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40" title={isProtected ? 'La cuenta propietaria o tu propia cuenta no puede eliminarse' : ''}><Trash2 className="h-3.5 w-3.5" /> Eliminar acceso</button>
              </div>
            </div>;
          })}
          {!members.length && <p className="p-6 text-center text-sm text-slate-500">No hay usuarios registrados en esta escuela.</p>}
        </div>
      </section>
    </div>
  );
}
