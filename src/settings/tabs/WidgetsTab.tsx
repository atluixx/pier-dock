import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BatteryMedium,
  Clock,
  GitCommitHorizontal,
  GitCompare,
  GitPullRequest,
  LayoutGrid,
  Music,
  Volume2,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { WidgetConfig, WidgetKind } from "../../lib/ipc";
import { os } from "../../lib/platform";
import { moveAmong, widgetKey } from "../../dock/order";
import { useGithub } from "../../hooks/useGithub";
import { useMedia } from "../../hooks/useMedia";
import { useSystemStatus } from "../../hooks/useSystem";
import { MediaWidget } from "../../widgets/MediaWidget";
import { ContributionsWidget, GithubCommitsWidget, GithubMineWidget, GithubReviewWidget } from "../../widgets/GithubWidgets";
import { BatteryWidget, ClockWidget, NetworkWidget, VolumeWidget } from "../../widgets/SystemWidgets";
import { Card, Row, SectionLabel } from "../../ui/Card";
import { Segmented } from "../../ui/Segmented";
import { Switch } from "../../ui/Switch";
import type { TabProps } from "../shared";

interface WidgetInfo {
  name: string;
  group: string;
  description: string;
  Icon: LucideIcon;
}

const MEDIA_SOURCE = {
  macos: "Spotify e Música, pelo AppleScript",
  windows: "Controles de mídia do Windows (SMTC)",
  linux: "Players compatíveis com MPRIS",
}[os];

export const WIDGETS: Record<WidgetKind, WidgetInfo> = {
  media: { name: "Mídia", group: "Tocando agora", description: "Mostra e controla o que está tocando no Spotify, YouTube Music e outros players.", Icon: Music },
  "github-mine": { name: "Pull requests", group: "GitHub", description: "Seus pull requests abertos, com o estado dos checks.", Icon: GitPullRequest },
  "github-review": { name: "Revisões", group: "GitHub", description: "Pull requests aguardando a sua revisão, com contador.", Icon: GitCompare },
  "github-commits": { name: "Commits", group: "GitHub", description: "Seus commits recentes e quantos foram feitos hoje.", Icon: GitCommitHorizontal },
  "github-contrib": { name: "Contribuições", group: "GitHub", description: "Total do ano e o mapa das últimas 20 semanas.", Icon: LayoutGrid },
  network: { name: "Wi-Fi", group: "Sistema", description: "Rede atual. O clique abre as configurações rápidas do sistema.", Icon: Wifi },
  volume: { name: "Volume", group: "Sistema", description: "Role sobre o ícone para ajustar; o botão direito silencia.", Icon: Volume2 },
  battery: { name: "Bateria", group: "Sistema", description: "Carga e se está carregando. Some em computadores sem bateria.", Icon: BatteryMedium },
  clock: { name: "Relógio", group: "Sistema", description: "Hora e data. O clique abre a central de notificações.", Icon: Clock },
};

const RESIZABLE = new Set<WidgetKind>(["media", "github-contrib"]);
const isWidget = (key: string) => key.startsWith("widget:");

/** O widget de verdade, com os dados atuais, mas sem reagir ao mouse. */
function Preview({ widget }: { widget: WidgetConfig }) {
  const media = useMedia();
  const github = useGithub();
  const system = useSystemStatus();
  const wide = widget.size === "wide";
  const content = {
    media: <MediaWidget media={media} wide={wide} />,
    "github-mine": <GithubMineWidget data={github} />,
    "github-review": <GithubReviewWidget data={github} />,
    "github-commits": <GithubCommitsWidget data={github} />,
    "github-contrib": <ContributionsWidget data={github} wide={wide} />,
    network: <NetworkWidget status={system} />,
    volume: <VolumeWidget />,
    battery: <BatteryWidget status={system} />,
    clock: <ClockWidget />,
  }[widget.kind];
  return (
    <div className="preview-stage small" aria-hidden>
      <span className="preview-label">Pré-visualização</span>
      <div className="preview-bar" data-glass>
        {content}
      </div>
    </div>
  );
}

export function WidgetsTab({ config, update }: TabProps) {
  const [selected, setSelected] = useState<WidgetKind>(config.widgets[0]?.kind ?? "media");
  const widget = config.widgets.find((w) => w.kind === selected) ?? config.widgets[0];
  const enabled = config.widgets.filter((w) => w.enabled);

  const set = (kind: WidgetKind, patch: Partial<WidgetConfig>) =>
    update((c) => ({ widgets: c.widgets.map((w) => (w.kind === kind ? { ...w, ...patch } : w)) }));
  const move = (delta: -1 | 1) => {
    const patch = moveAmong(config, widgetKey(widget.kind), delta, isWidget);
    if (patch) update(patch);
  };
  const position = enabled.findIndex((w) => w.kind === widget.kind) + 1;
  const info = WIDGETS[widget.kind];

  return (
    <div className="split">
      <div className="split-list narrow">
        <div className="list-scroll">
          <SectionLabel>Widgets</SectionLabel>
          {config.widgets.map((w) => {
            const { name, group, Icon } = WIDGETS[w.kind];
            return (
              <div key={w.kind} className="list-item tall" aria-current={w.kind === widget.kind}>
                <button className="list-item-select" onClick={() => setSelected(w.kind)}>
                  <span className="widget-glyph" aria-hidden>
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="list-item-text">
                    <span className="list-item-name">{name}</span>
                    <span className="list-item-sub">{group}</span>
                  </span>
                </button>
                <Switch checked={w.enabled} label={`Mostrar ${name}`} onChange={(on) => set(w.kind, { enabled: on })} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="split-detail">
        <div className="detail-title">
          <span className="detail-name">{info.name}</span>
          <span className="detail-description">{info.description}</span>
        </div>
        <Preview widget={widget} />
        <Card>
          <Row label="Mostrar na dock">
            <Switch checked={widget.enabled} label={`Mostrar ${info.name}`} onChange={(on) => set(widget.kind, { enabled: on })} />
          </Row>
          {widget.kind === "media" && (
            <Row label="Fonte" description={MEDIA_SOURCE}>
              <span className="row-value">Automático</span>
            </Row>
          )}
          {RESIZABLE.has(widget.kind) && (
            <Row label="Largura">
              <Segmented
                label="Largura"
                value={widget.size}
                onChange={(size) => set(widget.kind, { size })}
                options={[
                  { value: "small", label: "Compacta" },
                  { value: "wide", label: "Larga" },
                ]}
              />
            </Row>
          )}
          {widget.enabled && (
            <Row label="Posição entre os widgets" description="Ou arraste na própria dock">
              <span className="row-value">
                {position} de {enabled.length}
              </span>
              <button className="icon-button bordered" aria-label="Mover para cima" disabled={position <= 1} onClick={() => move(-1)}>
                <ArrowUp size={16} />
              </button>
              <button className="icon-button bordered" aria-label="Mover para baixo" disabled={position >= enabled.length} onClick={() => move(1)}>
                <ArrowDown size={16} />
              </button>
            </Row>
          )}
        </Card>
      </div>
    </div>
  );
}
