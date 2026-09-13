import test from 'node:test';
import assert from 'node:assert/strict';

const {
  authenticate,
  authenticateWithGoogle,
  clearAuthSession,
  joinOrganization,
  registerOrganization,
  requestPasswordReset,
  subscribeToAuth
} = await import('../src/services/auth.js');

test('expone el contrato actual de autenticacion Firebase', () => {
  for (const authFunction of [
    authenticate,
    authenticateWithGoogle,
    clearAuthSession,
    joinOrganization,
    registerOrganization,
    requestPasswordReset,
    subscribeToAuth
  ]) {
    assert.equal(typeof authFunction, 'function');
  }
});
