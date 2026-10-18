/** Medidas da dock (px lógicos), derivadas do tamanho do ícone e da magnificação. */
export function dockMetrics(iconSize: number, magnification: number, fullWidth = false) {
  const padding = 8;
  const margin = 8;
  // 64 com o ícone padrão de 40: botão de 56 e 4 de folga em cima e embaixo.
  const barHeight = iconSize + 24;
  // Na largura total a barra encosta na borda de baixo, então o espaço reservado é a própria
  // altura da barra: as janelas maximizadas encostam nela. Sem isso sobram as duas margens (16px)
  // entre a janela e a dock.
  const reservedHeight = fullWidth ? barHeight : barHeight + margin * 2;
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
