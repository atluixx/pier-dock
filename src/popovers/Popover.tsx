import { useEffect } from "react";
import { ipc } from "../lib/ipc";
import { Commits } from "./Commits";
import { Contributions } from "./Contributions";
import { NowPlaying } from "./NowPlaying";
import { PullRequests } from "./PullRequests";

function Content({ kind }: { kind: string }) {
  switch (kind) {
    case "media":
      return <NowPlaying />;
    case "github-mine":
      return <PullRequests initial="mine" />;
    case "github-review":
      return <PullRequests initial="review" />;
    case "github-commits":
      return <Commits />;
    case "github-contrib":
      return <Contributions />;
    default:
      return <div className="popover-empty">Painel desconhecido.</div>;
  }
}

const LABELS: Record<string, string> = {
  media: "Tocando agora",
  "github-mine": "Seus pull requests",
  "github-review": "Revisões pendentes",
  "github-commits": "Commits recentes",
  "github-contrib": "Contribuições",
};

/** Popover de um widget: janela própria, ancorada acima da dock (ver `panels.rs`). */
export function Popover({ kind }: { kind: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ipc.closePanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <section className={`popover popover-${kind}`} aria-label={LABELS[kind]} data-glass>
      <Content kind={kind} />
    </section>
  );
}
