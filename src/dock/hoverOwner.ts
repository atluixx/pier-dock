type Reset = () => void;

/** Hover has one owner. Moving across N items should reset one previous item, not N listeners. */
export function createHoverOwner() {
  let owner: Reset | undefined;
  return {
    claim(next: Reset) {
      if (owner === next) return;
      const previous = owner;
      owner = next;
      previous?.();
    },
    reset(except?: Reset) {
      if (owner === except) return;
      const previous = owner;
      owner = undefined;
      previous?.();
    },
    release(current: Reset) {
      if (owner === current) owner = undefined;
    },
  };
}
