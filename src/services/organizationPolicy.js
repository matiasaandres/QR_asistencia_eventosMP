export const ORGANIZATION_ROLES = ['admin', 'operator', 'viewer'];
export const ORGANIZATION_STATUSES = ['active', 'suspended'];
export const ORGANIZATION_PLANS = ['pilot', 'event', 'monthly', 'annual'];

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
    ownerUid,
    memberUids,
    plan: ORGANIZATION_PLANS.includes(data.plan) ? data.plan : 'pilot',
    status: ORGANIZATION_STATUSES.includes(data.status) ? data.status : 'active'
  };
}

export function canManageOrganization(role) { return role === 'admin'; }
export function canOperateAccess(role) { return role === 'admin' || role === 'operator'; }
