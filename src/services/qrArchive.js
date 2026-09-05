import QRCode from 'qrcode';
import { getCapacityState } from './checkinPolicy.js';

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

  // Reproduce the on-screen credential as a centered printable card.
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 0, PDF_WIDTH_MM, 297, 'F');

  const cardX = 18;
  const cardY = 14;
  const cardWidth = 174;
  const cardHeight = 269;
  const contentLeft = cardX + 10;
  const contentRight = cardX + cardWidth - 10;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 5, 5, 'FD');

  // Header: MP mark, institution/event and course badge.
  pdf.setFillColor(2, 132, 199);
  pdf.roundedRect(contentLeft, cardY + 10, 14, 14, 2.5, 2.5, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.text('MP', contentLeft + 7, cardY + 18.8, { align: 'center' });

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11.5);
  pdf.text('MundoPalabra', contentLeft + 18, cardY + 15.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(eventName, contentLeft + 18, cardY + 21, { maxWidth: 79 });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  const courseWidth = Math.min(57, Math.max(34, pdf.getTextWidth(student.course) + 10));
  const courseX = contentRight - courseWidth;
  pdf.setFillColor(240, 249, 255);
  pdf.setDrawColor(186, 230, 253);
  pdf.roundedRect(courseX, cardY + 11, courseWidth, 11, 5.5, 5.5, 'FD');
  pdf.setTextColor(7, 89, 133);
  pdf.text(student.course, courseX + (courseWidth / 2), cardY + 18.2, { align: 'center' });

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.35);
  pdf.line(contentLeft, cardY + 31, contentRight, cardY + 31);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  const nameBottom = addCenteredWrappedText(pdf, student.name, cardY + 47, 150, 18, 1.05);

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(10.5);
  pdf.text(`ID: ${student.id}`, PDF_WIDTH_MM / 2, nameBottom + 2.5, { align: 'center' });

  const qrSize = 104;
  const qrX = (PDF_WIDTH_MM - qrSize) / 2;
  const qrY = Math.max(cardY + 74, nameBottom + 11);
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.45);
  pdf.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 5, 5, 'FD');
  pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');

  const maxCapacity = getCapacityState(student).maxCapacity;
  const capacityLabel = maxCapacity > 0
    ? `Válido para hasta ${maxCapacity} personas autorizadas`
    : 'Sin acceso habilitado';
  const badgeY = qrY + qrSize + 12;
  pdf.setFillColor(255, 251, 235);
  pdf.setDrawColor(253, 230, 138);
  pdf.roundedRect(49, badgeY, 112, 13, 6.5, 6.5, 'FD');
  pdf.setTextColor(146, 64, 14);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.2);
  pdf.text(capacityLabel, PDF_WIDTH_MM / 2, badgeY + 8.4, { align: 'center' });

  const footerLineY = cardY + cardHeight - 36;
  pdf.setDrawColor(241, 245, 249);
  pdf.line(contentLeft, footerLineY, contentRight, footerLineY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.2);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    pdf.splitTextToSize(
      'Presenta este código en el acceso al evento (impreso o en la pantalla de tu celular). Los ingresos pueden ser simultáneos o por separado.',
      145
    ),
    PDF_WIDTH_MM / 2,
    footerLineY + 9,
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
