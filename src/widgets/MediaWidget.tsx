import { Music, Pause, Play, SkipForward } from "lucide-react";
import { ipc, type MediaState } from "../lib/ipc";
import { pickSession, useThumbnail } from "../hooks/useMedia";
import { mediaSourceName } from "../lib/format";
import { Tile } from "./Tile";

export function MediaWidget({ media, wide }: { media: MediaState; wide: boolean }) {
  const session = pickSession(media);
  const cover = useThumbnail(session?.thumbnailKey);

  if (!session) {
    return (
      <Tile kind="media" label="Nada tocando" className="media-tile idle" panel={false}>
        <Music size={20} />
      </Tile>
    );
  }

  const control = (action: "toggle" | "next") => (e: React.MouseEvent) => {
    e.stopPropagation();
    ipc.mediaControl(session.id, action);
  };
  const label = `${session.title}${session.artist ? ` — ${session.artist}` : ""} (${mediaSourceName(session.id)})`;

  return (
    <Tile kind="media" wide={wide} label={label} className={`media-tile ${session.playing ? "playing" : ""}`}>
      <div className="media-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        {!cover && <Music size={18} />}
        {!wide && (
          <button className="media-overlay" onClick={control("toggle")}>
            {session.playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
      </div>
      {wide && (
        <>
          <div className="media-text">
            <div className="media-title">{session.title}</div>
            <div className="media-artist">{session.artist || mediaSourceName(session.id)}</div>
          </div>
          <div className="media-buttons">
            <button onClick={control("toggle")}>{session.playing ? <Pause size={16} /> : <Play size={16} />}</button>
            {session.canNext && (
              <button onClick={control("next")}>
                <SkipForward size={16} />
              </button>
            )}
          </div>
        </>
      )}
    </Tile>
  );
}
