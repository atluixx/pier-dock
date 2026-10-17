/**
 * Cores de destaque das configurações. Os valores ficam em `tokens.css` (`--coral`, `--blue`…) e os
 * nomes no dicionário (`appearance.accents`).
 */
export const ACCENTS = [{ key: "coral" }, { key: "blue" }, { key: "green" }, { key: "amber" }, { key: "lilac" }] as const;

export type Accent = (typeof ACCENTS)[number]["key"];
