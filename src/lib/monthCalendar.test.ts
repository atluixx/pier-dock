import test from "node:test";
import assert from "node:assert/strict";
import { monthDays, sameDay, dateKey } from "./monthCalendar.ts";

test("calendar includes a complete six-week grid and leap day", () => {
 const days = monthDays(2024, 1);
 assert.equal(days.length, 42);
 assert.equal(days[0].getDay(), 0);
 assert.equal(days.filter(d => d.getMonth() === 1).length, 29);
 assert.ok(days.some(d => dateKey(d) === "2024-02-29"));
 assert.equal(new Set(days.map(dateKey)).size, 42);
});
test("January includes the previous year and date comparisons ignore time", () => {
 const days = monthDays(2026, 0);
 assert.equal(dateKey(days[0]), "2025-12-28");
 assert.ok(sameDay(new Date(2026, 0, 1, 0), new Date(2026, 0, 1, 23)));
 assert.equal(sameDay(new Date(2026, 0, 1), new Date(2027, 0, 1)), false);
});
