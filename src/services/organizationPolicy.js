/**
 * Catálogos y reglas de autorización de organizaciones escolares.
 * Las reglas equivalentes de seguridad viven también en firestore.rules y
 * deben mantenerse sincronizadas con estas funciones de interfaz.
 */

export const ORGANIZATION_ROLES = ['admin', 'operator', 'viewer'];
export const ORGANIZATION_STATUSES = ['active', 'suspended'];
export const ORGANIZATION_PLANS = ['pilot', 'event', 'monthly', 'annual'];
export const ORGANIZATION_PLAN_DETAILS = {
  pilot: {
    label: 'Piloto',
    cadence: 'Periodo acordado',
    description: 'Puesta en marcha y evaluación de la plataforma antes de contratar una modalidad permanente.',
    features: ['Gestión de estudiantes y familias', 'Control de acceso con QR', 'Historial, reportes y respaldos']
  },
  event: {
    label: 'Por evento',
    cadence: 'Un evento contratado',
    description: 'Uso puntual para una actividad específica, sin una renovación mensual o anual.',
    features: ['Preparación de la nómina del evento', 'Control de entradas, salidas y reingresos', 'Informe final y respaldo']
  },
  monthly: {
    label: 'Mensual',
    cadence: 'Renovación mensual',
    description: 'Operación continua para escuelas que realizan actividades y controles durante el año.',
    features: ['Eventos recurrentes durante la vigencia', 'Administración de usuarios y establecimientos', 'Reportes y respaldos continuos']
  },
  annual: {
    label: 'Anual',
    cadence: 'Renovación anual',
    description: 'Continuidad institucional durante doce meses, con una sola modalidad de contratación anual.',
    features: ['Uso continuo durante el periodo anual', 'Administración integral de la escuela', 'Historial, reportes y respaldos continuos']
  }
};
export const MASTER_ADMIN_EMAIL = 'matias.andres.mh@gmail.com';

/**
 * Obtiene la descripción comercial de un plan, usando piloto como respaldo.
 * @param {string} plan Identificador del plan.
 * @returns {object} Etiqueta, periodicidad, descripción y funcionalidades.
 */
export function getOrganizationPlanDetails(plan) {
  return ORGANIZATION_PLAN_DETAILS[ORGANIZATION_PLANS.includes(plan) ? plan : 'pilot'];
}

/**
 * Convierte el nombre de una escuela en un identificador estable.
 * @param {string} name Nombre visible de la organización.
 * @param {string} suffix Sufijo opcional para evitar colisiones.
 * @returns {string} Slug seguro para documentos y rutas.
 */
export function createOrganizationId(name, suffix = '') {
  const slug = String(name || 'organizacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'organizacion';
  return suffix ? `${slug}-${suffix}` : slug;
}

/**
 * Normaliza una organización y garantiza que el propietario sea miembro.
 * @param {object} data Datos crudos de la organización.
 * @returns {object} Organización lista para la interfaz o persistencia.
 */
export function normalizeOrganization(data = {}) {
  const ownerUid = String(data.ownerUid || '').trim();
  const memberUids = [...new Set((Array.isArray(data.memberUids) ? data.memberUids : [])
    .map((uid) => String(uid || '').trim()).filter(Boolean))];
  if (ownerUid && !memberUids.includes(ownerUid)) memberUids.unshift(ownerUid);
  return {
    ...data,
    id: String(data.id || data.slug || '').trim(),
    slug: String(data.slug || data.id || '').trim(),
    name: String(data.name || 'Organización sin nombre').trim(),
    logoUrl: String(data.logoUrl || '').trim(),
    primaryColor: /^#[0-9a-f]{6}$/i.test(String(data.primaryColor || '')) ? data.primaryColor : '#0284c7',
    ownerUid,
    memberUids,
    plan: ORGANIZATION_PLANS.includes(data.plan) ? data.plan : 'pilot',
    status: ORGANIZATION_STATUSES.includes(data.status) ? data.status : 'active'
  };
}

/**
 * Indica si el rol puede administrar la configuración de una organización.
 * @param {string} role Rol de la membresía.
 * @returns {boolean} `true` cuando el rol es administrador.
 */
export function canManageOrganization(role) { return role === 'admin'; }

/**
 * Indica si el rol puede operar accesos y registrar movimientos.
 * @param {string} role Rol de la membresía.
 * @returns {boolean} `true` para administradores y operadores.
 */
export function canOperateAccess(role) { return role === 'admin' || role === 'operator'; }

/**
 * Evalúa claims y compatibilidad heredada para identificar a la cuenta maestra.
 * @param {object|null} user Usuario autenticado de Firebase.
 * @returns {boolean} `true` cuando posee privilegios de plataforma.
 */
export function isPlatformAdmin(user) {
  if (!user) return false;
  if (
    user.customClaims?.platformAdmin === true ||
    user.customClaims?.role === 'master_admin' ||
    user.platformAdmin === true ||
    user.isMasterAdmin === true ||
    user.role === 'master_admin' ||
    user.claims?.platformAdmin === true ||
    user.token?.platformAdmin === true ||
    user.token?.claims?.platformAdmin === true
  ) {
    return true;
  }
  return String(user?.email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}
