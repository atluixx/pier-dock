import { Kbd } from "./Kbd";

/** Tooltip da dock, acima do item. Decorativo: o nome acessível fica no `aria-label` do botão. */
export function Tooltip({ label, keys }: { label: string; keys?: string }) {
  return (
    <span className={`tooltip ${keys ? "with-keys" : ""}`} aria-hidden>
      <span className="tooltip-label">{label}</span>
      {keys && <Kbd keys={keys} />}
    </span>
  );
}
