/** Pontos da linha para valores de 0 a 100, com `pad` de folga em cima e embaixo. */
export function sparkPoints(values: number[], width: number, height: number, pad = 1): string {
  return values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width;
      const y = pad + (1 - Math.min(100, Math.max(0, v)) / 100) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Linha do histórico (e, com `area`, o preenchimento embaixo). A cor vem do `color` do pai. */
export function Sparkline({ values, width, height, pad = 1, area = false }: { values: number[]; width: number; height: number; pad?: number; area?: boolean }) {
  const points = values.length > 1 ? sparkPoints(values, width, height, pad) : "";
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {area && points && <polygon className="sparkline-area" points={`0,${height} ${points} ${width},${height}`} />}
      {points && <polyline className="sparkline-line" points={points} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}
