/** Cores de destaque das configurações. Os valores ficam em `tokens.css` (`--coral`, `--blue`…). */
export const ACCENTS = [
  { key: "coral", name: "Coral" },
  { key: "blue", name: "Azul" },
  { key: "green", name: "Verde" },
  { key: "amber", name: "Âmbar" },
  { key: "lilac", name: "Lilás" },
] as const;

export type Accent = (typeof ACCENTS)[number]["key"];
