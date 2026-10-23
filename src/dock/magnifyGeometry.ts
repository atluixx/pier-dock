/** Read every item before publishing positions, so subscribers cannot invalidate later reads. */
export function measureCenters<T>(items: Iterable<T>, read: (item: T) => number, publish: (item: T, center: number) => void) {
  const measured = Array.from(items, (item) => ({ item, center: read(item) }));
  for (const { item, center } of measured) publish(item, center);
}

export function magnifiedSize(cursor: number, center: number, base: number, scale: number): number {
  if (!Number.isFinite(cursor) || !Number.isFinite(center) || scale <= 1) return base;
  const influence = Math.max(0, 1 - Math.abs(cursor - center) / (base * 2.6));
  return base * (1 + (scale - 1) * influence);
}

/** A centered row/column shifts by half its total growth; widgets keep their measured gaps. */
export function projectedCenters(items: { center: number; initial: number; current: number }[]): number[] {
  const growth = items.map((item) => item.current - item.initial);
  const total = growth.reduce((sum, delta) => sum + delta, 0);
  let preceding = 0;
  return items.map((item, i) => {
    const center = item.center + preceding + growth[i] / 2 - total / 2;
    preceding += growth[i];
    return center;
  });
}
