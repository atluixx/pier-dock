import type { DockApp } from "./apps";

export function stableOpenApps(previous: DockApp[], next: DockApp[]): DockApp[] {
  const pinned: DockApp[] = [];
  const running: DockApp[] = [];
  for (const app of next) (app.pinned ? pinned : running).push(app);

  const byKey = new Map(running.map((app) => [app.key, app]));
  const kept: DockApp[] = [];
  const seen = new Set<string>();
  for (const app of previous) {
    if (app.pinned || seen.has(app.key)) continue;
    const current = byKey.get(app.key);
    if (!current) continue;
    kept.push(current);
    seen.add(app.key);
  }

  return [...pinned, ...kept, ...running.filter((app) => !seen.has(app.key))];
}
