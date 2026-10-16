import { openUrl } from "@tauri-apps/plugin-opener";
import { useClaudeUsage } from "../hooks/useClaudeUsage";
import { limitLevel, windows, type LimitWindow } from "../lib/claudeUsage";
import { formatPercent, formatResetIn, formatTokens, shortModel } from "../lib/format";
import { ActionFooter } from "../ui/ActionFooter";

/** Barra de uma janela de limite. Percentual desconhecido fica vazia, não em zero. */
function Limit({ limit }: { limit: LimitWindow }) {
  const level = limitLevel(limit.percent);
  return (
    <div className="usage-bar">
      <div className="usage-bar-head">
        <span>{limit.name}</span>
        <span className="usage-bar-value">
          {formatPercent(limit.percent)}
          {limit.resetsIn !== null && limit.resetsIn > 0 && <> · reseta em {formatResetIn(limit.resetsIn)}</>}
        </span>
      </div>
      <div
        className="usage-track"
        role="meter"
        aria-label={limit.name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={limit.percent ?? 0}
      >
        <span className={`usage-fill claude-${level}`} style={{ width: `${limit.percent ?? 0}%` }} />
      </div>
    </div>
  );
}

/** "atualizado há 4 min"; com o Claude Code fechado há mais de 15 min, "coletado há 45min". */
function freshness(ageMin: number, stale: boolean): string {
  if (stale) return `coletado há ${formatResetIn(ageMin)}`;
  return ageMin < 1 ? "atualizado agora" : `atualizado há ${ageMin} min`;
}

export function ClaudeUsage() {
  const usage = useClaudeUsage();
  const [session, weekly] = windows(usage);
  const unknown = session.percent === null && weekly.percent === null;

  return (
    <>
      <div className="usage-header">
        <span className="eyebrow">Limites da conta</span>
        {usage && usage.ageMin !== null && (
          <span
            className={`popover-meta ${usage.stale ? "claude-stale" : ""}`}
            title={usage.stale ? "O Claude Code só atualiza os percentuais enquanto está aberto." : undefined}
          >
            {freshness(usage.ageMin, usage.stale)}
          </span>
        )}
      </div>
      <div className="claude-limits">
        <Limit limit={session} />
        <Limit limit={weekly} />
        {unknown && <span className="popover-meta">Abra o Claude Code uma vez para ele registrar os limites.</span>}
      </div>
      <div className="usage-section">
        <span className="eyebrow">Tokens</span>
        <div className="usage-bar-head">
          <span>Hoje</span>
          <span className="usage-bar-value">{usage ? `${formatTokens(usage.todayTokens)} · ${usage.todayMessages} msgs` : "…"}</span>
        </div>
        <div className="usage-bar-head">
          <span>Bloco de 5h</span>
          <span className="usage-bar-value">{usage ? formatTokens(usage.blockTokens) : "…"}</span>
        </div>
        {usage?.topModel && (
          <div className="usage-bar-head">
            <span>Modelo</span>
            <span className="usage-bar-value">{shortModel(usage.topModel)}</span>
          </div>
        )}
      </div>
      <ActionFooter
        context="Claude Code"
        actions={[{ label: "Ver no claude.ai", keys: "↵", onClick: () => openUrl("https://claude.ai/settings/usage") }]}
      />
    </>
  );
}
