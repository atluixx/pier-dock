import { createContext, useContext, useRef, type ReactNode } from "react";
import { motion, useSpring, useTransform, type MotionValue } from "framer-motion";

interface MagnifyContext {
  mouseX: MotionValue<number>;
  base: number;
  scale: number;
}

export const MagnifyCtx = createContext<MagnifyContext | null>(null);

/** Item que cresce conforme o cursor se aproxima, como na dock do macOS. */
export function Magnify({ children }: { children: ReactNode }) {
  const ctx = useContext(MagnifyCtx)!;
  const ref = useRef<HTMLDivElement>(null);
  const range = ctx.base * 2.6;
  const distance = useTransform(ctx.mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - r.left - r.width / 2 : Infinity;
  });
  const size = useTransform(distance, [-range, 0, range], [ctx.base, ctx.base * ctx.scale, ctx.base], { clamp: true });
  const spring = useSpring(size, { mass: 0.1, stiffness: 170, damping: 14 });
  return (
    <motion.div ref={ref} className="magnify" style={{ width: spring, height: spring }}>
      {children}
    </motion.div>
  );
}
