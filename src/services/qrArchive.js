import QRCode from 'qrcode';

const PDF_WIDTH_MM = 210;
let pdfLibraryPromise;
let zipLibraryPromise;

function loadPdfLibrary() {
  pdfLibraryPromise ||= import('jspdf').then((module) => module.jsPDF);
  return pdfLibraryPromise;
}

function loadZipLibrary() {
  zipLibraryPromise ||= import('jszip').then((module) => module.default);
  return zipLibraryPromise;
}

export function safeFilePart(value, fallback = 'Sin nombre', maxLength = 100) {
  const cleaned = String(value || '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, maxLength);

  return cleaned || fallback;
}

export function getStudentPdfPath(student) {
  const course = safeFilePart(student?.course, 'Sin curso', 70);
  const studentName = safeFilePart(student?.name, 'Alumno', 100);
  return {
    folderName: course,
    fileName: `${studentName} - ${course}.pdf`
  };
}

function addCenteredWrappedText(pdf, text, y, maxWidth, fontSize, lineHeight = 1.15) {
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(String(text || ''), maxWidth);
  pdf.text(lines, PDF_WIDTH_MM / 2, y, { align: 'center' });
  return y + (lines.length * fontSize * 0.3528 * lineHeight);
}

export async function createStudentQrPdf({ student, event }) {
  if (!student?.id || !student?.name || !student?.course) {
    throw new Error('El alumno debe tener código, nombre y curso para generar su PDF.');
  }

  const JsPDF = await loadPdfLibrary();
  const pdf = new JsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
  const eventName = event?.name || 'Control de Acceso';
  const qrDataUrl = await QRCode.toDataURL(String(student.id), {
    width: 700,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  pdf.setProperties({
    title: `${student.name} - ${student.course}`,
    subject: `Código QR de acceso - ${eventName}`,
    author: 'MundoPalabra',
    creator: 'MundoPalabra Acceso'
  });

  pdf.setFillColor(3, 105, 161);
  pdf.rect(0, 0, PDF_WIDTH_MM, 46, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(25);
  pdf.text('MundoPalabra', PDF_WIDTH_MM / 2, 19, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.text('Credencial QR de acceso', PDF_WIDTH_MM / 2, 29, { align: 'center' });
  pdf.setFontSize(10);
  pdf.text(pdf.splitTextToSize(eventName, 170), PDF_WIDTH_MM / 2, 38, { align: 'center' });

  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(18, 56, 174, 219, 5, 5, 'S');

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  let cursorY = addCenteredWrappedText(pdf, student.name, 74, 160, 20, 1.1);

  pdf.setFillColor(224, 242, 254);
  pdf.setDrawColor(125, 211, 252);
  pdf.roundedRect(55, cursorY + 2, 100, 13, 6, 6, 'FD');
  pdf.setTextColor(7, 89, 133);
  pdf.setFontSize(12);
  pdf.text(student.course, PDF_WIDTH_MM / 2, cursorY + 10.5, { align: 'center' });

  const qrSize = 105;
  const qrX = (PDF_WIDTH_MM - qrSize) / 2;
  const qrY = Math.max(101, cursorY + 23);
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 4, 4, 'FD');
  pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');

  pdf.setTextColor(71, 85, 105);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(13);
  pdf.text(`ID: ${student.id}`, PDF_WIDTH_MM / 2, qrY + qrSize + 14, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(
    pdf.splitTextToSize(
      'Presenta este código en el acceso al evento, impreso o desde la pantalla de tu celular.',
      150
    ),
    PDF_WIDTH_MM / 2,
    qrY + qrSize + 29,
    { align: 'center' }
  );

  return new Uint8Array(pdf.output('arraybuffer'));
}

export async function createStudentQrArchive({ students, event, onProgress }) {
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error('No hay estudiantes disponibles para generar el archivo ZIP.');
  }

  const JSZip = await loadZipLibrary();
  const orderedStudents = [...students].sort((a, b) => {
    const courseComparison = String(a.course || '').localeCompare(String(b.course || ''), 'es');
    return courseComparison || String(a.name || '').localeCompare(String(b.name || ''), 'es');
  });
  const zip = new JSZip();
  const usedPaths = new Set();

  for (let index = 0; index < orderedStudents.length; index += 1) {
    const student = orderedStudents[index];
    const { folderName, fileName } = getStudentPdfPath(student);
    let uniqueFileName = fileName;
    let fullPath = `${folderName}/${uniqueFileName}`;

    if (usedPaths.has(fullPath.toLocaleLowerCase('es'))) {
      const baseName = fileName.replace(/\.pdf$/i, '');
      uniqueFileName = `${baseName} - ${safeFilePart(student.id, 'ID')}.pdf`;
      fullPath = `${folderName}/${uniqueFileName}`;
    }

    usedPaths.add(fullPath.toLocaleLowerCase('es'));
    const pdfBytes = await createStudentQrPdf({ student, event });
    zip.folder(folderName).file(uniqueFileName, pdfBytes, { binary: true });
    onProgress?.({ phase: 'pdfs', current: index + 1, total: orderedStudents.length });

    if ((index + 1) % 8 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const archiveBytes = await zip.generateAsync(
    {
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    ({ percent }) => onProgress?.({ phase: 'zip', percent: Math.round(percent) })
  );
  const eventName = safeFilePart(event?.name, 'Evento', 80).replace(/\s+/g, '_');

  return {
    bytes: archiveBytes,
    fileName: `QR_por_alumno_${eventName}.zip`,
    pdfCount: orderedStudents.length
  };
}
