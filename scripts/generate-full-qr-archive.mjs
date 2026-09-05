import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { INITIAL_EVENT, INITIAL_STUDENTS } from '../src/mock/sampleStudents.js';
import { createStudentQrArchive } from '../src/services/qrArchive.js';

const archive = await createStudentQrArchive({
  students: INITIAL_STUDENTS,
  event: INITIAL_EVENT,
  onProgress: ({ phase, current, total, percent }) => {
    if (phase === 'pdfs' && (current === total || current % 25 === 0)) {
      console.log(`PDF ${current}/${total}`);
    }
    if (phase === 'zip' && percent % 25 === 0) {
      console.log(`ZIP ${percent}%`);
    }
  }
});
const outputDirectory = new URL('../output/', import.meta.url);
const outputFile = new URL(archive.fileName, outputDirectory);

await mkdir(fileURLToPath(outputDirectory), { recursive: true });
await writeFile(fileURLToPath(outputFile), archive.bytes);
console.log(fileURLToPath(outputFile));

