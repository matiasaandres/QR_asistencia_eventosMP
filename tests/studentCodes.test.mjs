import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentCodeGenerator } from '../src/services/studentCodes.js';

test('genera códigos consecutivos únicos sin repetir códigos existentes', () => {
  const generateCode = createStudentCodeGenerator([
    { id: 'MP-2026-001' },
    { id: 'MP-2026-003' },
    { id: 'codigo-antiguo' },
  ], 2026);

  assert.equal(generateCode(), 'MP-2026-002');
  assert.equal(generateCode(), 'MP-2026-004');
  assert.equal(generateCode(), 'MP-2026-005');
});

test('la comparación de códigos existentes no distingue mayúsculas', () => {
  const generateCode = createStudentCodeGenerator([{ id: 'mp-2026-001' }], 2026);
  assert.equal(generateCode(), 'MP-2026-002');
});
