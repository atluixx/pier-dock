import { useState } from "react";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { ipc } from "../lib/ipc";
import { pickSession, useMedia, usePlaybackPosition, useThumbnail } from "../hooks/useMedia";
import { formatDuration, mediaSourceName } from "../lib/format";
import { ActionFooter } from "../ui/ActionFooter";
import { Segmented } from "../ui/Segmented";

export function NowPlaying() {
  const media = useMedia();
  const [preferred, setPreferred] = useState<string | null>(null);
  const session = pickSession(media, preferred);
  const cover = useThumbnail(session?.thumbnailKey);
  const position = usePlaybackPosition(session);

  if (!session) {
    return (
      <div className="popover-empty">
        <span className="empty-icon">
          <Music size={22} strokeWidth={1.8} />
        </span>
        <span className="empty-title">Nada tocando</span>
        <span className="empty-sub">Abra o Spotify ou o YouTube Music.</span>
      </div>
    );
  }

  const source = mediaSourceName(session.id);
  const progress = session.durationMs ? Math.min(100, (position / session.durationMs) * 100) : 0;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!session.canSeek || !session.durationMs) return;
    const r = e.currentTarget.getBoundingClientRect();
    ipc.mediaControl(session.id, "seek", ((e.clientX - r.left) / r.width) * session.durationMs);
  };
  const toggle = () => ipc.mediaControl(session.id, "toggle");

  return (
    <>
      <div className="now-playing">
        <div className="np-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
          {!cover && <Music size={28} strokeWidth={1.6} />}
        </div>
        <div className="np-text">
          <span className="eyebrow">Tocando agora · {source}</span>
          <span className="np-title">{session.title}</span>
          {session.artist && <span className="np-artist">{session.artist}</span>}
          {session.album && <span className="np-album">{session.album}</span>}
        </div>
      </div>
      {session.durationMs > 0 && (
        <div className="np-progress-wrap">
          <div
            className={`np-progress ${session.canSeek ? "seekable" : ""}`}
            role="progressbar"
            aria-label="Progresso da faixa"
            aria-valuemin={0}
            aria-valuemax={Math.round(session.durationMs / 1000)}
            aria-valuenow={Math.round(position / 1000)}
            onClick={seek}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="np-times">
            <span>{formatDuration(position)}</span>
            <span>{formatDuration(session.durationMs)}</span>
          </div>
        </div>
      )}
      <div className="np-controls">
        <button className="np-button" aria-label="Faixa anterior" disabled={!session.canPrev} onClick={() => ipc.mediaControl(session.id, "prev")}>
          <SkipBack size={18} />
        </button>
        <button className="np-play" aria-label={session.playing ? "Pausar" : "Tocar"} onClick={toggle}>
          {session.playing ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="np-button" aria-label="Próxima faixa" disabled={!session.canNext} onClick={() => ipc.mediaControl(session.id, "next")}>
          <SkipForward size={18} />
        </button>
      </div>
      <ActionFooter
        context={
          media.sessions.length > 1 ? (
            <Segmented
              label="Player"
              value={session.id}
              onChange={setPreferred}
              options={media.sessions.map((s) => ({ value: s.id, label: mediaSourceName(s.id) }))}
            />
          ) : (
            <span className="footer-source">
              <Music size={14} aria-hidden />
              {source}
            </span>
          )
        }
        actions={[{ label: session.playing ? "Pausar" : "Tocar", keys: "↵", onClick: toggle }]}
      />
    </>
  );
}
