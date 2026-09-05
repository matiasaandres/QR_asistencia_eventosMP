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
