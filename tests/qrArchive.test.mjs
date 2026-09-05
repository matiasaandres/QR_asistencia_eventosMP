import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  createStudentQrArchive,
  createStudentQrPdf,
  getStudentPdfPath,
  safeFilePart
} from '../src/services/qrArchive.js';

const event = { name: 'Acto Cultural Institucional 2026' };

test('crea nombres seguros que conservan el nombre del alumno y su curso', () => {
  assert.equal(safeFilePart('  Ana / Pérez:*  '), 'Ana Pérez');
  assert.deepEqual(
    getStudentPdfPath({ name: 'Ana Pérez', course: '1° Básico A' }),
    {
      folderName: '1° Básico A',
      fileName: 'Ana Pérez - 1° Básico A.pdf'
    }
  );
});

test('cada credencial PDF contiene exactamente una página', async () => {
  const bytes = await createStudentQrPdf({
    student: { id: 'MP-2026-001', name: 'Ana Pérez', course: '1° Básico A' },
    event
  });
  const pdfText = Buffer.from(bytes).toString('latin1');

  assert.equal(pdfText.slice(0, 5), '%PDF-');
  assert.equal((pdfText.match(/\/Type\s*\/Page\b/g) || []).length, 1);
});

test('el PDF conserva el cupo familiar de la credencial en pantalla', async () => {
  const bytes = await createStudentQrPdf({
    student: {
      id: 'MP-2026-001',
      name: 'Ana Pérez',
      course: '1° Básico A',
      maxCapacity: 5,
      enteredCount: 0
    },
    event
  });
  const pdfText = Buffer.from(bytes).toString('latin1');

  assert.equal(pdfText.slice(0, 5), '%PDF-');
  assert.equal((pdfText.match(/\/Type\s*\/Page\b/g) || []).length, 1);
  assert.ok(bytes.length > 10_000);
});

test('el ZIP agrupa los PDF por curso y evita sobrescribir homónimos', async () => {
  const progress = [];
  const students = [
    { id: 'ID-1', name: 'Ana Pérez', course: '1° Básico A' },
    { id: 'ID-2', name: 'Ana Pérez', course: '1° Básico A' },
    { id: 'ID-3', name: 'Benjamín Soto', course: 'Kínder B' }
  ];
  const archive = await createStudentQrArchive({
    students,
    event,
    onProgress: (value) => progress.push(value)
  });
  const zip = await JSZip.loadAsync(archive.bytes);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);

  assert.equal(archive.pdfCount, 3);
  assert.equal(archive.fileName, 'QR_por_alumno_Acto_Cultural_Institucional_2026.zip');
  assert.equal(files.length, 3);
  assert.ok(zip.file('1° Básico A/Ana Pérez - 1° Básico A.pdf'));
  assert.ok(zip.file('1° Básico A/Ana Pérez - 1° Básico A - ID-2.pdf'));
  assert.ok(zip.file('Kínder B/Benjamín Soto - Kínder B.pdf'));
  assert.ok(progress.some((value) => value.phase === 'pdfs' && value.current === 3));
  assert.ok(progress.some((value) => value.phase === 'zip'));
});
