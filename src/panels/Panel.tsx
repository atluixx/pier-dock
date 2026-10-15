import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Music,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  XCircle,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, type GithubData, type PullRequest } from "../lib/ipc";
import { useGithub } from "../hooks/useGithub";
import { pickSession, useMedia, usePlaybackPosition, useThumbnail } from "../hooks/useMedia";
import { formatDuration, mediaSourceName, timeAgo } from "../lib/format";
import { HeatmapGrid } from "../widgets/GithubWidgets";

function PanelHeader({ title, subtitle, onRefresh, link }: { title: string; subtitle?: string; onRefresh?: () => void; link?: string }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="panel-actions">
        {onRefresh && (
          <button
            className={`icon-btn ${spinning ? "spin" : ""}`}
            title="Atualizar"
            onClick={async () => {
              setSpinning(true);
              await onRefresh();
              setSpinning(false);
            }}
          >
            <RefreshCw size={15} />
          </button>
        )}
        {link && (
          <button className="icon-btn" title="Abrir no GitHub" onClick={() => openUrl(link)}>
            <ExternalLink size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function ChecksIcon({ state }: { state?: PullRequest["checks"] }) {
  if (state === "SUCCESS") return <CheckCircle2 size={16} className="ok" />;
  if (state === "FAILURE" || state === "ERROR") return <XCircle size={16} className="fail" />;
  if (state === "PENDING" || state === "EXPECTED") return <CircleDashed size={16} className="pending" />;
  return null;
}

const REVIEW_LABELS: Record<string, string> = {
  APPROVED: "aprovado",
  CHANGES_REQUESTED: "mudanças pedidas",
  REVIEW_REQUIRED: "aguardando review",
};

function PrList({ prs, showAuthor }: { prs: PullRequest[]; showAuthor: boolean }) {
  if (!prs.length) return <div className="empty">Nada por aqui 🎉</div>;
  return (
    <ul className="list">
      {prs.map((pr) => (
        <li key={pr.url} onClick={() => openUrl(pr.url)}>
          {showAuthor && pr.authorAvatar ? <img className="avatar" src={pr.authorAvatar} alt="" /> : <ChecksIcon state={pr.checks} />}
          <div className="list-main">
            <div className="list-title">
              {pr.isDraft && <span className="pill">rascunho</span>}
              {pr.title}
            </div>
            <div className="list-sub">
              {pr.repo}#{pr.number} · {showAuthor ? `${pr.author} · ` : ""}
              {timeAgo(pr.updatedAt)}
              {pr.reviewDecision && REVIEW_LABELS[pr.reviewDecision] ? ` · ${REVIEW_LABELS[pr.reviewDecision]}` : ""}
            </div>
          </div>
          {showAuthor && <ChecksIcon state={pr.checks} />}
        </li>
      ))}
    </ul>
  );
}

function GithubError({ data }: { data: GithubData | null }) {
  if (!data) return <div className="empty">Carregando…</div>;
  if (!data.error) return null;
  return <div className="error-box">{data.error}</div>;
}

const refresh = () => ipc.githubFetch().then(() => {});

function ReviewPanel() {
  const data = useGithub();
  return (
    <>
      <PanelHeader
        title="Aguardando seu review"
        subtitle={data ? `${data.reviewCount} pull request(s)` : undefined}
        onRefresh={refresh}
        link="https://github.com/pulls/review-requested"
      />
      <GithubError data={data} />
      {data && <PrList prs={data.reviewRequests} showAuthor />}
    </>
  );
}

function MinePanel() {
  const data = useGithub();
  return (
    <>
      <PanelHeader
        title="Seus pull requests"
        subtitle={data ? `${data.myPrCount} aberto(s)` : undefined}
        onRefresh={refresh}
        link="https://github.com/pulls"
      />
      <GithubError data={data} />
      {data && <PrList prs={data.myPrs} showAuthor={false} />}
    </>
  );
}

function CommitsPanel() {
  const data = useGithub();
  return (
    <>
      <PanelHeader
        title="Commits recentes"
        subtitle={data?.login ? `@${data.login}` : undefined}
        onRefresh={refresh}
        link={data?.login ? `https://github.com/${data.login}` : undefined}
      />
      <GithubError data={data} />
      {data && !data.commits.length && <div className="empty">Nenhum commit encontrado.</div>}
      <ul className="list">
        {data?.commits.map((c) => (
          <li key={c.sha + c.repo} onClick={() => openUrl(c.url)}>
            <code className="sha">{c.sha.slice(0, 7)}</code>
            <div className="list-main">
              <div className="list-title">{c.message}</div>
              <div className="list-sub">
                {c.repo} · {timeAgo(c.date)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function ContribPanel() {
  const data = useGithub();
  const weeks = data?.weeks ?? [];
  // Rótulo do mês na primeira semana em que ele aparece (alinhado às colunas do grid).
  const monthLabels = weeks.map((week, i) => {
    const month = new Date((week[0]?.date ?? "") + "T12:00").getMonth();
    const prev = i > 0 ? new Date((weeks[i - 1][0]?.date ?? "") + "T12:00").getMonth() : -1;
    return month !== prev && i < weeks.length - 2 ? MONTHS[month] : "";
  });
  return (
    <>
      <PanelHeader
        title={`${data?.totalContributions ?? 0} contribuições no último ano`}
        subtitle={data?.login ? `@${data.login}` : undefined}
        onRefresh={refresh}
        link={data?.login ? `https://github.com/${data.login}` : undefined}
      />
      <GithubError data={data} />
      <div className="heatmap-wrap">
        <div className="heat-months">
          {monthLabels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <HeatmapGrid weeks={weeks} className="heatmap" />
        <div className="heat-legend">
          Menos
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heat l${l}`} />
          ))}
          Mais
        </div>
      </div>
    </>
  );
}

function MediaPanel() {
  const media = useMedia();
  const [preferred, setPreferred] = useState<string | null>(null);
  const session = pickSession(media, preferred);
  const cover = useThumbnail(session?.thumbnailKey);
  const position = usePlaybackPosition(session);

  if (!session) {
    return (
      <div className="empty media-empty">
        <Music size={32} />
        Nada tocando. Abra o Spotify ou o YouTube Music.
      </div>
    );
  }
  const progress = session.durationMs ? (position / session.durationMs) * 100 : 0;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!session.canSeek || !session.durationMs) return;
    const r = e.currentTarget.getBoundingClientRect();
    ipc.mediaControl(session.id, "seek", ((e.clientX - r.left) / r.width) * session.durationMs);
  };

  return (
    <div className="media-panel">
      <div className="media-big-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        {!cover && <Music size={56} />}
      </div>
      <div className="media-big-title">{session.title}</div>
      <div className="media-big-artist">
        {[session.artist, session.album].filter(Boolean).join(" · ")}
      </div>
      <div className="media-source">{mediaSourceName(session.id)}</div>
      {session.durationMs > 0 && (
        <>
          <div className={`progress ${session.canSeek ? "seekable" : ""}`} onClick={seek}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-times">
            <span>{formatDuration(position)}</span>
            <span>{formatDuration(session.durationMs)}</span>
          </div>
        </>
      )}
      <div className="media-big-buttons">
        <button disabled={!session.canPrev} onClick={() => ipc.mediaControl(session.id, "prev")}>
          <SkipBack size={22} />
        </button>
        <button className="primary" onClick={() => ipc.mediaControl(session.id, "toggle")}>
          {session.playing ? <Pause size={26} /> : <Play size={26} />}
        </button>
        <button disabled={!session.canNext} onClick={() => ipc.mediaControl(session.id, "next")}>
          <SkipForward size={22} />
        </button>
      </div>
      {media.sessions.length > 1 && (
        <div className="session-switch">
          {media.sessions.map((s) => (
            <button key={s.id} className={s.id === session.id ? "selected" : ""} onClick={() => setPreferred(s.id)}>
              {s.playing ? "▶ " : ""}
              {mediaSourceName(s.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PANELS: Record<string, () => JSX.Element> = {
  media: MediaPanel,
  "github-review": ReviewPanel,
  "github-mine": MinePanel,
  "github-commits": CommitsPanel,
  "github-contrib": ContribPanel,
};

export function Panel({ kind }: { kind: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ipc.closePanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const Content = PANELS[kind];
  return <div className="panel">{Content ? <Content /> : <div className="empty">Painel desconhecido.</div>}</div>;
}
