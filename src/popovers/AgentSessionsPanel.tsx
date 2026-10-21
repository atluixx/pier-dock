import { ipc } from "../lib/ipc";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { timeAgo } from "../lib/format";
import { useT } from "../i18n";
import { ClaudeMascotIcon } from "../dock/ClaudeMascotIcon";

/** Lista das sessões ativas; clicar numa foca a janela do terminal/IDE que a lançou. */
export function AgentSessionsPanel() {
  const agents = useAgentSessions();
  const t = useT().agentSessions;

  return (
    <>
      <header className="popover-header">
        <span className="popover-heading">{t.title}</span>
      </header>
      <div className="popover-body">
        {agents.length === 0 ? (
          <div className="popover-empty">
            <span className="empty-icon">
              <ClaudeMascotIcon size={22} />
            </span>
            <span className="empty-title">{t.empty}</span>
          </div>
        ) : (
          <ul className="list">
            {agents.map((a) => (
              <li key={`${a.provider}:${a.sessionId}`}>
                <button
                  className="list-row claude-row"
                  disabled={a.windowId === null}
                  title={a.windowId === null ? t.focusFailed : undefined}
                  onClick={() => ipc.focusAgentSession(a.provider, a.sessionId).catch(console.error)}
                >
                  <span className={`claude-dot claude-dot-${a.status}`} aria-hidden />
                  <span className="list-main">
                    <span className="list-title">{a.project || a.cwd}</span>
                    <span className="list-sub">
                      <span className="agent-provider">{t.providers[a.provider]}</span> · {t.status[a.status]} ·{" "}
                      {timeAgo(a.updatedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
