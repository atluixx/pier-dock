import { useState } from "react";
import { ipc } from "../lib/ipc";
import { formatBytes, formatRate } from "../lib/format";
import { keys } from "../lib/platform";
import { useSystemUsage, useTopApps } from "../hooks/useUsage";
import { ActionFooter } from "../ui/ActionFooter";
import { Sparkline } from "../ui/Sparkline";
import { HOT } from "../widgets/UsageWidget";
import { useT } from "../i18n";

function Bar({ name, value, pct, kind }: { name: string; value: string; pct: number; kind: string }) {
  return (
    <div className="usage-bar">
      <div className="usage-bar-head">
        <span>{name}</span>
        <span className="usage-bar-value">{value}</span>
      </div>
      <div className="usage-track" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <span className={`usage-fill ${kind}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SystemUsage() {
  const usage = useSystemUsage();
  const apps = useTopApps();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const t = useT().system;
  const target = selected ?? apps?.[0]?.name ?? null;

  const quit = () => {
    if (!target) return;
    ipc
      .quitAppProcesses(target)
      .then(() => setMessage(t.quitDone(target)))
      .catch((e) => setMessage(String(e)));
  };
  const cpu = usage?.cpu ?? 0;

  return (
    <>
      <div className="usage-header">
        <span className="eyebrow">{t.cpuLast60}</span>
        <span className={`usage-big ${cpu >= HOT ? "hot" : ""}`}>{Math.round(cpu)}%</span>
      </div>
      <div className={`usage-chart ${cpu >= HOT ? "hot" : ""}`} role="img" aria-label={t.cpuChart}>
        <Sparkline values={usage?.cpuHistory ?? []} width={328} height={60} pad={2} area />
      </div>
      <div className="usage-section">
        <Bar
          name={t.memory}
          value={usage ? t.usedOf(formatBytes(usage.memUsed), formatBytes(usage.memTotal)) : "…"}
          pct={usage?.mem ?? 0}
          kind={(usage?.mem ?? 0) >= HOT ? "hot" : "mem"}
        />
        <Bar
          name={t.disk}
          value={usage ? t.usedOf(formatBytes(usage.diskUsed), formatBytes(usage.diskTotal)) : "…"}
          pct={usage?.diskTotal ? (usage.diskUsed / usage.diskTotal) * 100 : 0}
          kind="disk"
        />
        <div className="usage-bar-head">
          <span>{t.network}</span>
          <span className="usage-bar-value">{usage ? `↓ ${formatRate(usage.netRx)} · ↑ ${formatRate(usage.netTx)}` : "…"}</span>
        </div>
      </div>
      <div className="usage-apps">
        <span className="eyebrow usage-apps-label">{t.topCpu}</span>
        {message && <div className="popover-meta usage-message" role="status">{message}</div>}
        <ul className="list" aria-label={t.topCpuList}>
          {(apps ?? []).map((app) => (
            <li key={app.name}>
              <button className="usage-app" aria-pressed={app.name === target} onClick={() => setSelected(app.name)}>
                <span className="usage-app-name">{app.name}</span>
                <span className="usage-bar-value">{Math.round(app.cpu)}%</span>
              </button>
            </li>
          ))}
          {apps && !apps.length && <li className="popover-meta usage-message">{t.measuring}</li>}
        </ul>
      </div>
      <ActionFooter
        context=""
        actions={[
          { label: t.monitor, keys: "↵", onClick: () => ipc.openShell("system-monitor") },
          { label: target ? t.quitApp(target) : t.quit, keys: `${keys.command} ⌫`, onClick: quit },
        ]}
      />
    </>
  );
}
