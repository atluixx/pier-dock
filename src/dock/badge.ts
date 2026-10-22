const TITLE_COUNT = /^\s*[(\[](\d{1,3})\+?[)\]](?:\s|$)/;

/** Contagem que apps e sites põem no começo do título da janela: "(3) WhatsApp", "[12] Inbox". */
export function parseTitleCount(title: string): number {
  const m = TITLE_COUNT.exec(title);
  return m ? Number(m[1]) : 0;
}

export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
