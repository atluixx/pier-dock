/** Medidas da dock (px lógicos), derivadas do tamanho do ícone e da magnificação. */
export function dockMetrics(iconSize: number, magnification: number) {
  const padding = 8;
  const margin = 6;
  const barHeight = iconSize + padding * 2;
  const reservedHeight = barHeight + margin * 2;
  const tooltipSpace = 44;
  const hoverHeadroom = Math.max(0, iconSize * (magnification - 1)) + tooltipSpace;
  return {
    padding,
    margin,
    barHeight,
    reservedHeight,
    hoverHeadroom,
    windowHeight: reservedHeight + hoverHeadroom,
  };
}
