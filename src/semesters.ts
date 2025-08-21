// Predefined academic semesters: 2022.1–2026.2
export const semesters: string[] = Array.from({ length: 5 }, (_, i) => 2022 + i)
  .flatMap((y) => [`${y}.1`, `${y}.2`]);

export type Semester = (typeof semesters)[number];

// Utilities for working with semester codes like "2025.1"
export function parseSemester(s: string): { year: number; term: number } | null {
  const m = s.match(/^(\d{4})\.(1|2)$/);
  if (!m) return null;
  return { year: Number(m[1]), term: Number(m[2]) };
}

export function compareSemesters(a: string, b: string): number {
  const pa = parseSemester(a);
  const pb = parseSemester(b);
  if (!pa || !pb) return 0;
  if (pa.year !== pb.year) return pa.year < pb.year ? -1 : 1;
  if (pa.term !== pb.term) return pa.term < pb.term ? -1 : 1;
  return 0;
}
