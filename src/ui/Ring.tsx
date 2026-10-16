/** Anel de progresso: `progress` de 0 a 1, começando no topo. A cor vem do `color` do pai. */
export function Ring({ size, radius, stroke, progress }: { size: number; radius: number; stroke: number; progress: number }) {
  const c = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="ring-track" cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} />
      <circle
        className="ring-value"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </svg>
  );
}
