export interface FitItem {
  key: string;
  /** Comprimento natural no eixo da barra (px). */
  length: number;
  /** Comprimento no formato compacto, para os itens que têm um (os widgets largos). */
  compact?: number;
  /** Itens fixos nunca vão para o menu de excedentes. */
  fixed?: boolean;
}

export interface Fit {
  /** Itens que passam a ser desenhados no formato compacto. */
  compact: Set<string>;
  /** Itens que não couberam e vão para o menu, na ordem da barra. */
  overflow: string[];
}

/**
 * Decide o que fazer para os itens caberem em `available` px. Parte sempre dos comprimentos
 * naturais, nunca dos atuais: usar o que já está compactado faria a barra alternar entre os
 * estados a cada medição. Primeiro compacta os widgets largos, do fim para o começo; se ainda
 * não couber, move os últimos itens não fixos para o menu, reservando `chip` px para o botão dele.
 */
export function fitItems(items: FitItem[], available: number, gap: number, chip: number): Fit {
  const compact = new Set<string>();
  const lengths = items.map((i) => i.length);
  const total = (ls: number[]) => ls.reduce((sum, l) => sum + l, 0) + gap * Math.max(0, ls.length - 1);

  if (total(lengths) <= available) return { compact, overflow: [] };

  for (let i = items.length - 1; i >= 0 && total(lengths) > available; i--) {
    const c = items[i].compact;
    if (c == null || c >= lengths[i]) continue;
    lengths[i] = c;
    compact.add(items[i].key);
  }
  if (total(lengths) <= available) return { compact, overflow: [] };

  const kept = items.map((_, i) => i);
  const overflow: string[] = [];
  while (kept.length && total([...kept.map((i) => lengths[i]), chip]) > available) {
    let at = kept.length - 1;
    while (at >= 0 && items[kept[at]].fixed) at--;
    if (at < 0) break;
    const [i] = kept.splice(at, 1);
    overflow.unshift(items[i].key);
    compact.delete(items[i].key);
  }
  return { compact, overflow };
}
