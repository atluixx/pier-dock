import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

const cache = new Map<string, Promise<string | null>>();

function loadIcon(key: string): Promise<string | null> {
  let pending = cache.get(key);
  if (!pending) {
    pending = ipc.getIcon(key).catch(() => null);
    cache.set(key, pending);
  }
  return pending;
}

export function useIcon(key: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    loadIcon(key).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [key]);
  return src;
}
