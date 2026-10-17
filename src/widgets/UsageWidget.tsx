import { useSystemUsage } from "../hooks/useUsage";
import { Sparkline } from "../ui/Sparkline";
import { Tile } from "./Tile";
import { useT } from "../i18n";

/** Acima disso o valor fica em âmbar. */
export const HOT = 85;

const percent = (v: number) => `${Math.round(v)}%`;

function Meter({ name, value, history, kind, width, height }: { name: string; value: number; history: number[]; kind: "cpu" | "mem"; width: number; height: number }) {
  return (
    <span className={`usage-meter usage-${kind} ${value >= HOT ? "hot" : ""}`}>
      <span className="usage-head">
        <span className="usage-name">{name}</span>
        <span className="usage-value">{percent(value)}</span>
      </span>
      <Sparkline values={history} width={width} height={height} />
    </span>
  );
}

export function UsageWidget({ wide }: { wide: boolean }) {
  const usage = useSystemUsage();
  const cpu = usage?.cpu ?? 0;
  const mem = usage?.mem ?? 0;
  const label = useT().system.usageTile(percent(cpu), cpu >= HOT, percent(mem), mem >= HOT);

  if (!wide) {
    // O quadrado mostra o recurso mais usado.
    const showMem = mem > cpu;
    return (
      <Tile kind="system-usage" label={label} className="usage-tile small">
        <Meter
          name={showMem ? "RAM" : "CPU"}
          value={showMem ? mem : cpu}
          history={(showMem ? usage?.memHistory : usage?.cpuHistory)?.slice(-20) ?? []}
          kind={showMem ? "mem" : "cpu"}
          width={34}
          height={9}
        />
      </Tile>
    );
  }
  return (
    <Tile kind="system-usage" label={label} className="usage-tile wide">
      <Meter name="CPU" value={cpu} history={usage?.cpuHistory.slice(-30) ?? []} kind="cpu" width={70} height={14} />
      <Meter name="RAM" value={mem} history={usage?.memHistory.slice(-30) ?? []} kind="mem" width={70} height={14} />
    </Tile>
  );
}
