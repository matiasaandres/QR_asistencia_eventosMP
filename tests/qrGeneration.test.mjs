import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { INITIAL_STUDENTS } from '../src/mock/sampleStudents.js';

test('genera un QR vectorial con módulos visibles para los 251 estudiantes', () => {
  assert.equal(INITIAL_STUDENTS.length, 251);

  for (const student of INITIAL_STUDENTS) {
    const qr = QRCode.create(String(student.id), { errorCorrectionLevel: 'M' });
    const moduleCount = qr.modules.size * qr.modules.size;
    let darkModules = 0;

    for (let row = 0; row < qr.modules.size; row += 1) {
      for (let column = 0; column < qr.modules.size; column += 1) {
        if (qr.modules.get(row, column)) darkModules += 1;
      }
    }

    assert.ok(qr.modules.size >= 21, `${student.id}: tamaño QR inválido`);
    assert.ok(darkModules > 0, `${student.id}: QR vacío`);
    assert.ok(darkModules < moduleCount, `${student.id}: QR completamente relleno`);
  }
});
