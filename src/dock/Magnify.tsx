import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { motion, useMotionValue, useMotionValueEvent, useSpring, useTransform, type MotionValue } from "framer-motion";
import type { DockPosition } from "../lib/ipc";
import { isVertical } from "./layout";
import { magnifiedSize, measureCenters, projectedCenters } from "./magnifyGeometry";

interface MagnifyContext {
  mouse: MotionValue<number>;
  base: number;
  scale: number;
  position: DockPosition;
}
interface Geometry {
  register: (element: HTMLElement, center: MotionValue<number>, size: MotionValue<number>) => () => void;
  measure: () => void;
}
export const MagnifyCtx = createContext<MagnifyContext | null>(null);
const GeometryCtx = createContext<Geometry | null>(null);

/** Geometry changes with layout, not every pointer event. One observer serves the whole dock. */
export function MagnifyProvider({ value, children }: { value: MagnifyContext; children: ReactNode }) {
  const geometry = useMemo(() => {
    type Item = { center: MotionValue<number>; size: MotionValue<number>; anchor: number; length: number };
    const items = new Map<HTMLElement, Item>();
    const project = () => {
      const ordered = [...items.values()].sort((a, b) => a.anchor - b.anchor);
      const centers = projectedCenters(ordered.map((item) => ({ center: item.anchor, initial: item.length, current: item.size.get() })));
      ordered.forEach((item, i) => item.center.set(centers[i]));
    };
    const measure = () => {
      // Record layout only on entry, configuration/reordering, or widget resizes.
      measureCenters(items.keys(), (element) => {
        const rect = element.getBoundingClientRect();
        const item = items.get(element)!;
        item.length = isVertical(value.position) ? rect.height : rect.width;
        return isVertical(value.position) ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
      }, (element, center) => { items.get(element)!.anchor = center; });
      project();
    };
    return {
      measure,
      register(element: HTMLElement, center: MotionValue<number>, size: MotionValue<number>) {
        items.set(element, { center, size, anchor: Infinity, length: size.get() });
        // The slot's current size is already known: derive neighboring positions
        // without asking the browser to measure the animated layout again.
        const unsubscribe = size.on("change", project);
        return () => { unsubscribe(); items.delete(element); };
      },
    };
  }, [value.position]);
  // Reordering, widget changes and configuration updates can move an unchanged-size icon.
  useLayoutEffect(() => geometry.measure());
  useLayoutEffect(() => {
    const bar = document.querySelector(".dock-bar");
    const observer = new ResizeObserver(geometry.measure);
    // App slot resizes are accounted for algebraically. Watch other items for
    // independent changes (clock text, media metadata, battery state, etc.).
    bar?.querySelectorAll(":scope > .widget-slot, :scope > .divider-item").forEach((element) => observer.observe(element));
    window.addEventListener("resize", geometry.measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", geometry.measure); };
  });
  const outside = useRef(true);
  useMotionValueEvent(value.mouse, "change", (cursor) => {
    if (Number.isFinite(cursor) && outside.current) geometry.measure();
    outside.current = !Number.isFinite(cursor);
  });
  return <MagnifyCtx.Provider value={value}><GeometryCtx.Provider value={geometry}>{children}</GeometryCtx.Provider></MagnifyCtx.Provider>;
}

/** The slot preserves spacing, tooltips and hit targets; only the artwork is scaled. */
export function Magnify({ children }: { children: ReactNode }) {
  const ctx = useContext(MagnifyCtx)!;
  const geometry = useContext(GeometryCtx)!;
  const ref = useRef<HTMLDivElement>(null);
  const center = useMotionValue(Infinity);
  const size = useTransform([ctx.mouse, center], ([cursor, midpoint]: number[]) => magnifiedSize(cursor, midpoint, ctx.base, ctx.scale));
  const spring = useSpring(size, { mass: 0.1, stiffness: 170, damping: 14 });
  useLayoutEffect(() => geometry.register(ref.current!, center, spring), [geometry, center, spring]);
  const scale = useTransform(spring, (value) => value / ctx.base);
  return (
    <motion.div ref={ref} className="magnify" style={{ width: spring, height: spring }}>
      <motion.div className="magnify-artwork" style={{ width: ctx.base, height: ctx.base, scale }}>
        {children}
      </motion.div>
    </motion.div>
  );
}
