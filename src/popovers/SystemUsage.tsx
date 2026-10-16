import { useState } from "react";
import { ipc } from "../lib/ipc";
import { formatBytes, formatRate } from "../lib/format";
import { keys } from "../lib/platform";
import { useSystemUsage, useTopApps } from "../hooks/useUsage";
import { ActionFooter } from "../ui/ActionFooter";
import { Sparkline } from "../ui/Sparkline";
import { HOT } from "../widgets/UsageWidget";

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
  const target = selected ?? apps?.[0]?.name ?? null;

  const quit = () => {
    if (!target) return;
    ipc
      .quitAppProcesses(target)
      .then(() => setMessage(`${target} foi encerrado.`))
      .catch((e) => setMessage(String(e)));
  };
  const cpu = usage?.cpu ?? 0;

  return (
    <>
      <div className="usage-header">
        <span className="eyebrow">CPU · últimos 60 s</span>
        <span className={`usage-big ${cpu >= HOT ? "hot" : ""}`}>{Math.round(cpu)}%</span>
      </div>
      <div className={`usage-chart ${cpu >= HOT ? "hot" : ""}`} role="img" aria-label="Gráfico de uso de CPU nos últimos 60 segundos">
        <Sparkline values={usage?.cpuHistory ?? []} width={328} height={60} pad={2} area />
      </div>
      <div className="usage-section">
        <Bar
          name="Memória"
          value={usage ? `${formatBytes(usage.memUsed)} de ${formatBytes(usage.memTotal)}` : "…"}
          pct={usage?.mem ?? 0}
          kind={(usage?.mem ?? 0) >= HOT ? "hot" : "mem"}
        />
        <Bar
          name="Disco"
          value={usage ? `${formatBytes(usage.diskUsed)} de ${formatBytes(usage.diskTotal)}` : "…"}
          pct={usage?.diskTotal ? (usage.diskUsed / usage.diskTotal) * 100 : 0}
          kind="disk"
        />
        <div className="usage-bar-head">
          <span>Rede</span>
          <span className="usage-bar-value">{usage ? `↓ ${formatRate(usage.netRx)} · ↑ ${formatRate(usage.netTx)}` : "…"}</span>
        </div>
      </div>
      <div className="usage-apps">
        <span className="eyebrow usage-apps-label">Mais usando CPU</span>
        {message && <div className="popover-meta usage-message" role="status">{message}</div>}
        <ul className="list" aria-label="Apps que mais usam CPU">
          {(apps ?? []).map((app) => (
            <li key={app.name}>
              <button className="usage-app" aria-pressed={app.name === target} onClick={() => setSelected(app.name)}>
                <span className="usage-app-name">{app.name}</span>
                <span className="usage-bar-value">{Math.round(app.cpu)}%</span>
              </button>
            </li>
          ))}
          {apps && !apps.length && <li className="popover-meta usage-message">Medindo…</li>}
        </ul>
      </div>
      <ActionFooter
        context=""
        actions={[
          { label: "Monitor do sistema", keys: "↵", onClick: () => ipc.openShell("system-monitor") },
          { label: target ? `Encerrar ${target}` : "Encerrar", keys: `${keys.command} ⌫`, onClick: quit },
        ]}
      />
    </>
  );
}
