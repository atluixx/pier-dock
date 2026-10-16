import type { ReactNode } from "react";

/** Rótulo de seção em caixa alta ("NA DOCK", "SINCRONIZAÇÃO"). */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {aside && <span>{aside}</span>}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

/** Linha de ajuste: rótulo e descrição à esquerda, controle à direita. */
export function Row({ label, description, children, id }: { label: ReactNode; description?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="row">
      <div className="row-text">
        <span className="row-label" id={id}>
          {label}
        </span>
        {description && <span className="row-description">{description}</span>}
      </div>
      {children && <div className="row-control">{children}</div>}
    </div>
  );
}
