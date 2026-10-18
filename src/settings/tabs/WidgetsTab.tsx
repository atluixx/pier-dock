import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BatteryMedium,
  Bluetooth,
  CalendarDays,
  ChevronUp,
  Asterisk,
  Clock,
  CloudSun,
  Cpu,
  GitCommitHorizontal,
  GitCompare,
  GitPullRequest,
  LayoutGrid,
  Music,
  Timer,
  Volume2,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { WidgetConfig, WidgetKind } from "../../lib/ipc";
import { os, widgetSupported } from "../../lib/platform";
import { moveAmong, widgetKey } from "../../dock/order";
import { useGithub } from "../../hooks/useGithub";
import { useMedia } from "../../hooks/useMedia";
import { useBluetooth, useSystemStatus } from "../../hooks/useSystem";
import { MediaWidget } from "../../widgets/MediaWidget";
import { ContributionsWidget, GithubCommitsWidget, GithubMineWidget, GithubReviewWidget } from "../../widgets/GithubWidgets";
import { BatteryWidget, BluetoothWidget, ClockWidget, NetworkWidget, TrayWidget, VolumeWidget } from "../../widgets/SystemWidgets";
import { WeatherWidget } from "../../widgets/WeatherWidget";
import { PomodoroWidget } from "../../widgets/PomodoroWidget";
import { UsageWidget } from "../../widgets/UsageWidget";
import { CalendarWidget } from "../../widgets/CalendarWidget";
import { ClaudeWidget } from "../../widgets/ClaudeWidget";
import { useWeather } from "../../hooks/useWeather";
import { useCalendar } from "../../hooks/useCalendar";
import { useClaudeUsage } from "../../hooks/useClaudeUsage";
import { CalendarOptions, PomodoroOptions, WeatherOptions } from "./WidgetOptions";
import { Card, Row, SectionLabel } from "../../ui/Card";
import { Segmented } from "../../ui/Segmented";
import { Switch } from "../../ui/Switch";
import type { TabProps } from "../shared";
import { useT, type Dict } from "../../i18n";

type Group = keyof Dict["widgets"]["groups"];

/** Grupo e ícone de cada widget; nome e descrição vêm do dicionário (`widgets.info`). */
const WIDGETS: Record<WidgetKind, { group: Group; Icon: LucideIcon }> = {
  media: { group: "nowPlaying", Icon: Music },
  "github-mine": { group: "github", Icon: GitPullRequest },
  "github-review": { group: "github", Icon: GitCompare },
  "github-commits": { group: "github", Icon: GitCommitHorizontal },
  "github-contrib": { group: "github", Icon: LayoutGrid },
  tray: { group: "system", Icon: ChevronUp },
  network: { group: "system", Icon: Wifi },
  volume: { group: "system", Icon: Volume2 },
  bluetooth: { group: "system", Icon: Bluetooth },
  battery: { group: "system", Icon: BatteryMedium },
  clock: { group: "system", Icon: Clock },
  weather: { group: "productivity", Icon: CloudSun },
  pomodoro: { group: "productivity", Icon: Timer },
  "system-usage": { group: "system", Icon: Cpu },
  calendar: { group: "productivity", Icon: CalendarDays },
  "claude-usage": { group: "productivity", Icon: Asterisk },
};

const RESIZABLE = new Set<WidgetKind>(["media", "github-contrib", "weather", "pomodoro", "system-usage", "calendar", "claude-usage"]);
const isWidget = (key: string) => key.startsWith("widget:");

/** O widget de verdade, com os dados atuais, mas sem reagir ao mouse. */
function Preview({ widget, configured }: { widget: WidgetConfig; configured: boolean }) {
  const media = useMedia();
  const github = useGithub();
  const system = useSystemStatus();
  const [bluetooth] = useBluetooth(widget.kind === "bluetooth");
  const weather = useWeather();
  const calendar = useCalendar();
  const claude = useClaudeUsage();
  const wide = widget.size === "wide";
  const t = useT();
  const content = {
    media: <MediaWidget media={media} wide={wide} />,
    "github-mine": <GithubMineWidget data={github} />,
    "github-review": <GithubReviewWidget data={github} />,
    "github-commits": <GithubCommitsWidget data={github} />,
    "github-contrib": <ContributionsWidget data={github} wide={wide} />,
    tray: <TrayWidget />,
    network: <NetworkWidget status={system} />,
    volume: <VolumeWidget />,
    bluetooth: <BluetoothWidget bluetooth={bluetooth} />,
    battery: <BatteryWidget status={system} />,
    clock: <ClockWidget />,
    weather: <WeatherWidget data={weather} wide={wide} configured={configured} />,
    pomodoro: <PomodoroWidget wide={wide} />,
    "system-usage": <UsageWidget wide={wide} />,
    calendar: <CalendarWidget data={calendar} wide={wide} />,
    "claude-usage": <ClaudeWidget data={claude} wide={wide} />,
  }[widget.kind];
  return (
    <div className="preview-stage small" aria-hidden>
      <span className="preview-label">{t.widgets.preview}</span>
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
  const { widgets: t, common } = useT();
  const info = t.info[widget.kind];

  return (
    <div className="split">
      <div className="split-list narrow">
        <div className="list-scroll">
          <SectionLabel>Widgets</SectionLabel>
          {config.widgets.filter((w) => widgetSupported(w.kind)).map((w) => {
            const { group, Icon } = WIDGETS[w.kind];
            const { name } = t.info[w.kind];
            return (
              <div key={w.kind} className="list-item tall" aria-current={w.kind === widget.kind}>
                <button className="list-item-select" onClick={() => setSelected(w.kind)}>
                  <span className="widget-glyph" aria-hidden>
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="list-item-text">
                    <span className="list-item-name">{name}</span>
                    <span className="list-item-sub">{t.groups[group]}</span>
                  </span>
                </button>
                <Switch checked={w.enabled} label={t.show(name)} onChange={(on) => set(w.kind, { enabled: on })} />
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
        <Preview widget={widget} configured={!!config.weatherLocation} />
        <Card>
          <Row label={t.showInDock}>
            <Switch checked={widget.enabled} label={t.show(info.name)} onChange={(on) => set(widget.kind, { enabled: on })} />
          </Row>
          {widget.kind === "media" && (
            <Row label={t.source} description={t.mediaSource[os]}>
              <span className="row-value">{t.automatic}</span>
            </Row>
          )}
          {widget.kind === "weather" && <WeatherOptions config={config} update={update} />}
          {widget.kind === "pomodoro" && <PomodoroOptions config={config} update={update} />}
          {widget.kind === "calendar" && <CalendarOptions />}
          {RESIZABLE.has(widget.kind) && (
            <Row label={t.width}>
              <Segmented
                label={t.width}
                value={widget.size}
                onChange={(size) => set(widget.kind, { size })}
                options={[
                  { value: "small", label: t.compact },
                  { value: "wide", label: t.wide },
                ]}
              />
            </Row>
          )}
          {widget.enabled && (
            <Row label={t.position} description={common.dragInDock}>
              <span className="row-value">{common.positionOf(position, enabled.length)}</span>
              <button className="icon-button bordered" aria-label={common.moveUp} disabled={position <= 1} onClick={() => move(-1)}>
                <ArrowUp size={16} />
              </button>
              <button className="icon-button bordered" aria-label={common.moveDown} disabled={position >= enabled.length} onClick={() => move(1)}>
                <ArrowDown size={16} />
              </button>
            </Row>
          )}
        </Card>
      </div>
    </div>
  );
}
