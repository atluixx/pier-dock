import { Asterisk } from "lucide-react";
import type { ClaudeUsage } from "../lib/ipc";
import { limitLevel, tightest } from "../lib/claudeUsage";
import { formatPercent, formatResetIn, formatTokens } from "../lib/format";
import { Ring } from "../ui/Ring";
import { Tile } from "./Tile";
import { useT } from "../i18n";

/**
 * Anel do limite mais apertado entre a sessão de 5h e a semana. Sem dado o anel fica vazio e o
 * número vira "--": o cache de limites só existe depois que o Claude Code roda uma vez.
 */
export function ClaudeWidget({ data, wide }: { data: ClaudeUsage | null; wide: boolean }) {
  const limit = tightest(data);
  const level = limitLevel(limit.percent);
  const progress = (limit.percent ?? 0) / 100;
  const t = useT().claude;
  const parts = [
    limit.percent === null ? t.tileNoData : t.tileLimit(limit.name, formatPercent(limit.percent), formatResetIn(limit.resetsIn)),
  ];
  if (data?.todayTokens) parts.push(t.tileTokensToday(formatTokens(data.todayTokens)));
  // O cache congela com o Claude Code fechado; avisar é melhor do que passar um número velho por atual.
  if (data?.stale && data.ageMin) parts.push(t.collectedAgo(formatResetIn(data.ageMin)));
  const className = `claude-tile ${wide ? "wide" : "small"} claude-${level} ${data?.stale ? "stale" : ""}`;

  if (!wide) {
    return (
      <Tile kind="claude-usage" label={parts.join(" · ")} className={className}>
        <Ring size={40} radius={16.5} stroke={2.5} progress={progress} />
        <span className="claude-mark">
          <Asterisk size={9} strokeWidth={2.6} aria-hidden />
          <span className="claude-percent">
            {limit.percent ?? "--"}
            {limit.percent !== null && <small>%</small>}
          </span>
        </span>
      </Tile>
    );
  }

  return (
    <Tile kind="claude-usage" label={parts.join(" · ")} className={className}>
      <span className="claude-ring">
        <Ring size={34} radius={14} stroke={2.5} progress={progress} />
        <Asterisk size={12} strokeWidth={2.4} aria-hidden />
      </span>
      <span className="claude-text">
        <span className="claude-value">{formatPercent(limit.percent)}</span>
        <span className="claude-caption">{limit.percent === null ? t.title : limit.name}</span>
      </span>
    </Tile>
  );
}
