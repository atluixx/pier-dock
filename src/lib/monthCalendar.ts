/** Local noon avoids DST transitions at midnight; every displayed day is a calendar date. */
export function monthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1, 12);
  return Array.from({ length: 42 }, (_, index) => new Date(year, month, 1 - first.getDay() + index, 12));
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
