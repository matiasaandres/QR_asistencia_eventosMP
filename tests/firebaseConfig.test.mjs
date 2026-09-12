import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFirebaseConfig } from '../src/services/firebase.js';

const expected = {
  apiKey: 'public-key',
  authDomain: 'example.firebaseapp.com',
  projectId: 'example',
  appId: '1:123:web:abc'
};

test('acepta una configuración Firebase en JSON', () => {
  assert.deepEqual(parseFirebaseConfig(JSON.stringify(expected)), expected);
});

test('acepta el fragmento JavaScript simple entregado por Firebase sin ejecutarlo', () => {
  const snippet = `const firebaseConfig = {
    apiKey: 'public-key',
    authDomain: 'example.firebaseapp.com',
    projectId: 'example',
    appId: '1:123:web:abc'
  };`;
  assert.deepEqual(parseFirebaseConfig(snippet), expected);
});

test('rechaza código y configuraciones incompletas', () => {
  assert.throws(() => parseFirebaseConfig('globalThis.compromised = true'), /JSON/);
  assert.throws(() => parseFirebaseConfig('{"apiKey":"x"}'), /projectId/);
  assert.equal(globalThis.compromised, undefined);
});
