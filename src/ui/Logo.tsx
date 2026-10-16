/**
 * Símbolo: três apps sobre a barra (o píer); o do meio, em destaque, é o app em foco.
 * `simple` deixa só a barra e o app do meio, para ícones de 32px ou menos.
 */
export function Logo({ size = 16, mono = false, simple = false }: { size?: number; mono?: boolean; simple?: boolean }) {
  const focus = mono ? "currentColor" : "var(--accent)";
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="6" y="38" width="52" height="14" rx="7" fill="currentColor" opacity="0.32" />
      {!simple && <rect x="12" y="24" width="11" height="11" rx="3.5" fill="currentColor" />}
      <rect x="26.5" y="15" width="11" height="20" rx="3.5" fill={focus} />
      {!simple && <rect x="41" y="24" width="11" height="11" rx="3.5" fill="currentColor" />}
      {!simple && <circle cx="32" cy="45" r="2.2" fill={focus} />}
    </svg>
  );
}
