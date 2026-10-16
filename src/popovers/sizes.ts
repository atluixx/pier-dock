/** Margem transparente da janela em volta do popover, para a sombra (igual a `--panel-inset`). */
export const PANEL_INSET = 18;

/** Tamanho visível (px lógicos) do popover de cada widget, sem a margem da sombra. */
export const PANEL_SIZES: Record<string, [number, number]> = {
  media: [380, 258],
  "github-review": [440, 400],
  "github-mine": [440, 400],
  "github-commits": [440, 400],
  "github-contrib": [500, 228],
};
