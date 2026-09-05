import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { INITIAL_EVENT, INITIAL_STUDENTS } from '../src/mock/sampleStudents.js';
import { createStudentQrPdf, getStudentPdfPath } from '../src/services/qrArchive.js';

const student = INITIAL_STUDENTS[0];
const pdfBytes = await createStudentQrPdf({ student, event: INITIAL_EVENT });
const outputDirectory = new URL('../tmp/pdfs/', import.meta.url);
const { fileName } = getStudentPdfPath(student);
const outputFile = new URL(fileName, outputDirectory);

await mkdir(fileURLToPath(outputDirectory), { recursive: true });
await writeFile(fileURLToPath(outputFile), pdfBytes);
console.log(fileURLToPath(outputFile));

