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

/**
 * Where the row ends up under the cursor. An icon's size depends on where its center is, and the
 * centers move as the sizes grow, so this iterates until the two agree. Targeting these sizes,
 * rather than the centers of a row still in motion, keeps the neighbors from growing past their
 * final size on the way there (the centers they were read from lag a frame behind).
 */
export function settledSizes(cursor: number, items: { center: number; initial: number }[], base: number, scale: number): number[] {
  if (!Number.isFinite(cursor) || scale <= 1) return items.map(() => base);
  let sizes = items.map((item) => item.initial);
  for (let pass = 0; pass < 24; pass++) {
    const centers = projectedCenters(items.map((item, i) => ({ ...item, current: sizes[i] })));
    const next = centers.map((center) => magnifiedSize(cursor, center, base, scale));
    const moved = next.reduce((most, size, i) => Math.max(most, Math.abs(size - sizes[i])), 0);
    sizes = next;
    if (moved < 0.01) break;
  }
  return sizes;
}
