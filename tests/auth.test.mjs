import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
  clear() {
    values.clear();
  }
};

const {
  AUTH_SESSION_DURATION_MS,
  AUTH_SESSION_KEY,
  authenticate,
  clearAuthSession,
  getActiveAuthSession
} = await import('../src/services/auth.js');

test.beforeEach(() => values.clear());

test('la duración configurada es exactamente de cinco horas', () => {
  assert.equal(AUTH_SESSION_DURATION_MS, 5 * 60 * 60 * 1000);
});

test('rechaza credenciales incorrectas sin crear sesión', () => {
  assert.equal(authenticate('mundopalabra', 'incorrecta'), null);
  assert.equal(authenticate('otro', 'mundo31036'), null);
  assert.equal(localStorage.getItem(AUTH_SESSION_KEY), null);
});

test('acepta el usuario con espacios laterales y crea una sesión válida', () => {
  const originalNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const session = authenticate('  mundopalabra  ', 'mundo31036');
    assert.deepEqual(session, {
      username: 'mundopalabra',
      expiresAt: 1_000_000 + AUTH_SESSION_DURATION_MS
    });
    assert.deepEqual(getActiveAuthSession(), session);
  } finally {
    Date.now = originalNow;
  }
});

test('elimina automáticamente sesiones vencidas o dañadas', () => {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: 'mundopalabra',
    expiresAt: Date.now() - 1
  }));
  assert.equal(getActiveAuthSession(), null);
  assert.equal(localStorage.getItem(AUTH_SESSION_KEY), null);

  localStorage.setItem(AUTH_SESSION_KEY, '{sesion-invalida');
  assert.equal(getActiveAuthSession(), null);
  assert.equal(localStorage.getItem(AUTH_SESSION_KEY), null);

  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: 'otro-usuario',
    expiresAt: Date.now() + 10_000
  }));
  assert.equal(getActiveAuthSession(), null);

  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: 'mundopalabra',
    expiresAt: 'mañana'
  }));
  assert.equal(getActiveAuthSession(), null);
});

test('cerrar sesión elimina el registro local', () => {
  localStorage.setItem(AUTH_SESSION_KEY, 'temporal');
  clearAuthSession();
  assert.equal(localStorage.getItem(AUTH_SESSION_KEY), null);
});
