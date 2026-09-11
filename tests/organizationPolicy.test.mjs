import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageOrganization, canOperateAccess, createOrganizationId, getOrganizationPlanDetails, normalizeOrganization, ORGANIZATION_PLANS } from '../src/services/organizationPolicy.js';

test('crea identificadores estables y seguros para cada escuela', () => {
  assert.equal(createOrganizationId('Colegio Ñuñoa Norte'), 'colegio-nunoa-norte');
  assert.equal(createOrganizationId('  Escuela #12  '), 'escuela-12');
});

test('normaliza planes, estado y membresía del propietario', () => {
  const organization = normalizeOrganization({ id: 'colegio-demo', name: 'Colegio Demo', ownerUid: 'owner', memberUids: [], plan: 'monthly' });
  assert.equal(organization.slug, 'colegio-demo');
  assert.deepEqual(organization.memberUids, ['owner']);
  assert.equal(organization.plan, 'monthly');
  assert.equal(organization.status, 'active');
});

test('define información visible para cada plan comercial', () => {
  ORGANIZATION_PLANS.forEach((plan) => {
    const details = getOrganizationPlanDetails(plan);
    assert.ok(details.label);
    assert.ok(details.cadence);
    assert.ok(details.description);
    assert.equal(details.features.length, 3);
  });
  assert.equal(getOrganizationPlanDetails('unknown').label, 'Piloto');
});

test('separa administración, operación y consulta', () => {
  assert.equal(canManageOrganization('admin'), true);
  assert.equal(canManageOrganization('operator'), false);
  assert.equal(canOperateAccess('admin'), true);
  assert.equal(canOperateAccess('operator'), true);
  assert.equal(canOperateAccess('viewer'), false);
});
