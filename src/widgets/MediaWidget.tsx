import { useRef } from "react";
import { Music, Pause, Play, SkipForward } from "lucide-react";
import { ipc, type MediaState } from "../lib/ipc";
import { pickSession, usePlaybackPosition, useThumbnail } from "../hooks/useMedia";
import { mediaSourceName } from "../lib/format";
import { Tooltip } from "../ui/Tooltip";
import { Tile, togglePanel, useHover } from "./Tile";

export function MediaWidget({ media, wide }: { media: MediaState; wide: boolean }) {
  const session = pickSession(media);
  const cover = useThumbnail(session?.thumbnailKey);
  const position = usePlaybackPosition(session);
  const ref = useRef<HTMLDivElement>(null);
  const { hover, bind } = useHover();

  if (!session) {
    return (
      <Tile kind="media" label="Nada tocando" className="media-idle" panel={false}>
        <span className="media-cover">
          <Music size={16} />
        </span>
      </Tile>
    );
  }

  const control = (action: "toggle" | "next") => () => ipc.mediaControl(session.id, action);
  const label = `${session.title}${session.artist ? ` — ${session.artist}` : ""} (${mediaSourceName(session.id)})`;
  const playLabel = session.playing ? "Pausar" : "Tocar";
  const PlayIcon = session.playing ? Pause : Play;
  const progress = session.durationMs ? Math.min(100, (position / session.durationMs) * 100) : 0;
  const coverStyle = cover ? { backgroundImage: `url(${cover})` } : undefined;
  const open = () => ref.current && togglePanel("media", ref.current);

  return (
    <div ref={ref} className={`media-tile ${wide ? "wide" : "compact"}`} data-widget {...bind}>
      {hover && <Tooltip label={label} />}
      {wide ? (
        <>
          <button className="media-open" aria-label={`Tocando agora: ${label}`} onClick={open}>
            <span className="media-cover" style={coverStyle}>
              {!cover && <Music size={16} />}
            </span>
            <span className="media-text">
              <span className="media-title">{session.title}</span>
              <span className="media-artist">{session.artist || mediaSourceName(session.id)}</span>
              {session.durationMs > 0 && (
                <span className="media-progress">
                  <span style={{ width: `${progress}%` }} />
                </span>
              )}
            </span>
          </button>
          <button className="media-control" aria-label={playLabel} onClick={control("toggle")}>
            <PlayIcon size={16} fill="currentColor" />
          </button>
          {session.canNext && (
            <button className="media-control" aria-label="Próxima faixa" onClick={control("next")}>
              <SkipForward size={16} />
            </button>
          )}
        </>
      ) : (
        <>
          <button className="media-open" aria-label={`Tocando agora: ${label}`} onClick={open}>
            <span className="media-cover" style={coverStyle}>
              {!cover && <Music size={16} />}
            </span>
          </button>
          <button className="media-overlay" aria-label={playLabel} onClick={control("toggle")}>
            <PlayIcon size={14} fill="currentColor" />
          </button>
        </>
      )}
    </div>
  );
}
