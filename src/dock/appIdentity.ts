import type { DockApp } from "./apps";

function sameRecord(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const first = a as Record<string, unknown>;
  const second = b as Record<string, unknown>;
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length && keys.every((key) => first[key] === second[key]);
}

function sameApp(a: DockApp, b: DockApp): boolean {
  const { windows: aw, pinned: ap, installed: ai, ...af } = a;
  const { windows: bw, pinned: bp, installed: bi, ...bf } = b;
  return sameRecord(af, bf) && sameRecord(ap, bp) && sameRecord(ai, bi)
    && aw.length === bw.length && aw.every((window, i) => sameRecord(window, bw[i]));
}

/** Preserve unaffected app identities when another app's window/title changes. */
export function reuseDockApps(previous: DockApp[], next: DockApp[]): DockApp[] {
  const byKey = new Map(previous.map((app) => [app.key, app]));
  return next.map((app) => {
    const old = byKey.get(app.key);
    return old && sameApp(old, app) ? old : app;
  });
}
