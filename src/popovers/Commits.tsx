import { GitCommitHorizontal } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useGithub } from "../hooks/useGithub";
import { timeAgo } from "../lib/format";
import { ActionFooter } from "../ui/ActionFooter";
import { GithubError, refreshGithub } from "./PullRequests";

export function Commits() {
  const data = useGithub();
  const profile = data?.login ? `https://github.com/${data.login}` : "https://github.com";
  return (
    <>
      <header className="popover-header">
        <span className="popover-heading">Commits recentes</span>
        {data?.login && <span className="popover-meta">@{data.login}</span>}
      </header>
      <div className="popover-body">
        <GithubError data={data} />
        {data && !data.error && !data.commits.length && (
          <div className="popover-empty">
            <span className="empty-icon">
              <GitCommitHorizontal size={22} strokeWidth={1.8} />
            </span>
            <span className="empty-title">Nenhum commit encontrado</span>
          </div>
        )}
        <ul className="list">
          {data?.commits.map((c) => (
            <li key={c.sha + c.repo}>
              <button className="list-row" onClick={() => openUrl(c.url)}>
                <code className="sha">{c.sha.slice(0, 7)}</code>
                <span className="list-main">
                  <span className="list-title">{c.message}</span>
                  <span className="list-sub">
                    {c.repo} · {timeAgo(c.date)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <ActionFooter
        context={data ? `Atualizado ${timeAgo(data.fetchedAt)}` : ""}
        actions={[
          { label: "Ver perfil", keys: "↵", onClick: () => openUrl(profile) },
          { label: "Atualizar", keys: "Ctrl R", onClick: refreshGithub },
        ]}
      />
    </>
  );
}
