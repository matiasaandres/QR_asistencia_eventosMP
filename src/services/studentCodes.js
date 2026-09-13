/**
 * Generación de códigos estables para estudiantes nuevos.
 * Evita colisiones con los códigos existentes y no permite que el usuario
 * controle directamente el consecutivo.
 */

/**
 * Crea un generador de identificadores estudiantiles sin colisiones.
 * @param {Array<object>} students Estudiantes cuyos códigos deben reservarse.
 * @param {number} year Año que formará parte del identificador.
 * @returns {() => string} Función que genera el siguiente código disponible.
 */
export function createStudentCodeGenerator(students = [], year = new Date().getFullYear()) {
  const usedCodes = new Set(
    students
      .map((student) => String(student?.id ?? '').trim().toUpperCase())
      .filter(Boolean)
  );
  let sequence = 1;

  return () => {
    let candidate;

    do {
      candidate = `MP-${year}-${String(sequence).padStart(3, '0')}`;
      sequence += 1;
    } while (usedCodes.has(candidate));

    usedCodes.add(candidate);
    return candidate;
  };
}
