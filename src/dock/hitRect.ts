export interface HitRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export function sameHitRect(a: HitRect, b: HitRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.radius === b.radius;
}

/** One native request at a time. Keep the newest geometry rather than queueing stale frames. */
export function latestSender<T>(send: (value: T) => Promise<unknown>, equal: (a: T, b: T) => boolean, onError: (error: unknown) => void) {
  let latest: T | undefined;
  let applied: T | undefined;
  let running = false;
  let disposed = false;
  const pump = () => {
    if (running || disposed || latest === undefined) return;
    const value = latest;
    latest = undefined;
    if (applied !== undefined && equal(applied, value)) return;
    running = true;
    Promise.resolve().then(() => send(value)).then(() => { applied = value; }, onError).finally(() => {
      running = false;
      pump();
    });
  };
  return {
    submit(value: T) { latest = value; pump(); },
    dispose() { disposed = true; latest = undefined; },
  };
}
