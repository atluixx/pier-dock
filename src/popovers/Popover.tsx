import { useEffect } from "react";
import { ipc } from "../lib/ipc";
import { Calendar } from "./Calendar";
import { Commits } from "./Commits";
import { Contributions } from "./Contributions";
import { NowPlaying } from "./NowPlaying";
import { Pomodoro } from "./Pomodoro";
import { PullRequests } from "./PullRequests";
import { SystemUsage } from "./SystemUsage";
import { Weather } from "./Weather";

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
    case "weather":
      return <Weather />;
    case "pomodoro":
      return <Pomodoro />;
    case "system-usage":
      return <SystemUsage />;
    case "calendar":
      return <Calendar />;
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
  weather: "Clima",
  pomodoro: "Pomodoro",
  "system-usage": "Uso do sistema",
  calendar: "Agenda",
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
