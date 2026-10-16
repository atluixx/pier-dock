/** Medidas da dock (px lógicos), derivadas do tamanho do ícone e da magnificação. */
export function dockMetrics(iconSize: number, magnification: number) {
  const padding = 8;
  const margin = 8;
  // 64 com o ícone padrão de 40: botão de 56 e 4 de folga em cima e embaixo.
  const barHeight = iconSize + 24;
  const reservedHeight = barHeight + margin * 2;
  const tooltipSpace = 48;
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
