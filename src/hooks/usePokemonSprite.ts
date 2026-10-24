import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

const sprites = new Map<number, string>();

export function usePokemonSprite(id: number): string | null {
  const [src, setSrc] = useState<string | null>(sprites.get(id) ?? null);
  useEffect(() => {
    const cached = sprites.get(id);
    setSrc(cached ?? null);
    if (cached) return;
    let alive = true;
    ipc
      .pokemonSprite(id)
      .then((url) => {
        sprites.set(id, url);
        if (alive) setSrc(url);
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [id]);
  return src;
}
