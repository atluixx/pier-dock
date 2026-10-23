import type { DockPosition } from "../lib/ipc.ts";

export const PET_SIZE = 26;
export const PET_EDGE_PAD = 10;
const OVERLAP = 6;

/** Feet remain attached to the bar; local -Y always points away from it. */
export function petPose(position: DockPosition, rect: { x: number; y: number; width: number; height: number }, progress: number, direction: 1 | -1) {
  const vertical = position === "left" || position === "right";
  const bounds = Math.max(0, (vertical ? rect.height : rect.width) - PET_EDGE_PAD * 2 - PET_SIZE);
  const along = PET_EDGE_PAD + Math.max(0, Math.min(progress, bounds));
  const angle = { bottom: 0, top: 180, left: 90, right: -90 }[position];
  const reversed = position === "top" || position === "right";
  return {
    x: vertical ? position === "right" ? rect.x - PET_SIZE + OVERLAP : rect.x + rect.width - OVERLAP : rect.x + along,
    y: vertical ? rect.y + along : position === "bottom" ? rect.y - PET_SIZE + OVERLAP : rect.y + rect.height - OVERLAP,
    angle,
    mirror: (direction === 1) === reversed,
    bounds,
  };
}
