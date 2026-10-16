import { useState } from "react";
import { CheckCircle2, CircleDashed, GitPullRequest, XCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, type GithubData, type PullRequest } from "../lib/ipc";
import { useGithub } from "../hooks/useGithub";
import { timeAgo } from "../lib/format";
import { keys } from "../lib/platform";
import { ActionFooter } from "../ui/ActionFooter";
import { Segmented } from "../ui/Segmented";

export const refreshGithub = () => ipc.githubFetch().then(() => {});

function ChecksIcon({ state }: { state?: PullRequest["checks"] }) {
  if (state === "SUCCESS") return <CheckCircle2 size={16} className="ok" aria-label="Checks passaram" />;
  if (state === "FAILURE" || state === "ERROR") return <XCircle size={16} className="fail" aria-label="Checks falharam" />;
  if (state === "PENDING" || state === "EXPECTED") return <CircleDashed size={16} className="pending" aria-label="Checks rodando" />;
  return null;
}

const REVIEW_LABELS: Record<string, string> = {
  APPROVED: "aprovado",
  CHANGES_REQUESTED: "mudanças pedidas",
  REVIEW_REQUIRED: "aguardando review",
};

export function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="popover-empty">
      <span className="empty-icon">
        <GitPullRequest size={22} strokeWidth={1.8} />
      </span>
      <span className="empty-title">{title}</span>
      <span className="empty-sub">{sub}</span>
    </div>
  );
}

export function GithubError({ data }: { data: GithubData | null }) {
  if (!data) return <div className="popover-loading">Carregando…</div>;
  if (!data.error) return null;
  return (
    <div className="error-box" role="alert">
      {data.error}
    </div>
  );
}

function PrList({ prs, showAuthor }: { prs: PullRequest[]; showAuthor: boolean }) {
  return (
    <ul className="list">
      {prs.map((pr) => (
        <li key={pr.url}>
          <button className="list-row" onClick={() => openUrl(pr.url)}>
            {!showAuthor ? (
              <ChecksIcon state={pr.checks} />
            ) : pr.authorAvatar ? (
              <img className="avatar" src={pr.authorAvatar} alt="" />
            ) : (
              <span className="avatar avatar-fallback" aria-hidden>
                {pr.author.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="list-main">
              <span className="list-title">
                {pr.isDraft && <span className="pill">rascunho</span>}
                {pr.title}
              </span>
              <span className="list-sub">
                {pr.repo}#{pr.number} · {showAuthor ? `${pr.author} · ` : ""}
                {timeAgo(pr.updatedAt)}
                {pr.reviewDecision && REVIEW_LABELS[pr.reviewDecision] ? ` · ${REVIEW_LABELS[pr.reviewDecision]}` : ""}
              </span>
            </span>
            {showAuthor && <ChecksIcon state={pr.checks} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

type Tab = "mine" | "review";

/** Seus PRs e os que esperam o seu review, no mesmo popover; o widget clicado escolhe a aba. */
export function PullRequests({ initial }: { initial: Tab }) {
  const data = useGithub();
  const [tab, setTab] = useState<Tab>(initial);
  const prs = (tab === "mine" ? data?.myPrs : data?.reviewRequests) ?? [];
  const link = tab === "mine" ? "https://github.com/pulls" : "https://github.com/pulls/review-requested";
  const updated = data ? `Atualizado ${timeAgo(data.fetchedAt)}.` : "";

  return (
    <>
      <header className="popover-header">
        <span className="popover-heading">Pull requests</span>
        <Segmented
          label="Lista"
          value={tab}
          onChange={setTab}
          options={[
            { value: "mine", label: `Abertos ${data?.myPrCount ?? 0}` },
            { value: "review", label: `Revisões ${data?.reviewCount ?? 0}` },
          ]}
        />
      </header>
      <div className="popover-body">
        <GithubError data={data} />
        {data &&
          !data.error &&
          (prs.length ? (
            <PrList prs={prs} showAuthor={tab === "review"} />
          ) : (
            <EmptyState
              title={tab === "mine" ? "Nenhum pull request aberto" : "Nenhuma revisão pendente"}
              sub={`Tudo limpo por aqui. ${updated}`}
            />
          ))}
      </div>
      <ActionFooter
        context={
          <span className="footer-source">
            <GitPullRequest size={14} aria-hidden />
            GitHub
          </span>
        }
        actions={[
          { label: "Abrir no GitHub", keys: "↵", onClick: () => openUrl(link) },
          { label: "Atualizar", keys: `${keys.command} R`, onClick: refreshGithub },
        ]}
      />
    </>
  );
}
