import { CalendarDays, Video } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, type CalendarEvent } from "../lib/ipc";
import { canJoin, clock, countdown, dotColor, duration, isOngoing, remainingToday, tomorrow } from "../lib/calendar";
import { shortDate, timeAgo } from "../lib/format";
import { keys } from "../lib/platform";
import { useCalendar } from "../hooks/useCalendar";
import { useNow } from "../hooks/useSystem";
import { ActionFooter } from "../ui/ActionFooter";

function subtitle(e: CalendarEvent): string {
  if (e.meetingUrl) return e.attendees > 1 ? `Videochamada · ${e.attendees} participantes` : "Videochamada";
  return e.location || duration(e);
}

export function Calendar() {
  const data = useCalendar();
  const now = useNow(15_000).getTime();

  if (!data?.configured) {
    return (
      <div className="popover-empty">
        <span className="empty-icon">
          <CalendarDays size={22} strokeWidth={1.8} />
        </span>
        <span className="empty-title">Nenhum calendário conectado</span>
        <span className="empty-sub">Cole o endereço iCal da sua agenda nas configurações.</span>
        <button className="action primary" onClick={() => ipc.openSettings()}>
          Abrir configurações
        </button>
      </div>
    );
  }

  const today = remainingToday(data.events, now);
  const [next, ...rest] = today;
  const first = tomorrow(data.events, now)[0];
  const join = next?.meetingUrl && canJoin(next, now) ? next.meetingUrl : null;
  const openCalendar = () => ipc.openShell("calendar");

  return (
    <>
      <div className="cal-header">
        <span className="cal-heading">Hoje · {shortDate(new Date(now))}</span>
        <span className="popover-meta">
          {today.length ? `${today.length} ${today.length === 1 ? "evento restante" : "eventos restantes"}` : "Sem mais eventos"}
        </span>
      </div>
      {data.error && <div className="error-box">{data.error}</div>}
      {next ? (
        <div className="cal-next">
          <div className="cal-next-head">
            <span className="cal-next-when">{isOngoing(next, now) ? "Agora" : countdown(next, now).split(" · ")[0]}</span>
            <span className="popover-meta">
              {clock(next.startMs)} – {clock(next.endMs)}
            </span>
          </div>
          <span className="cal-next-title">{next.title}</span>
          <span className="popover-meta">{subtitle(next)}</span>
          {next.meetingUrl && (
            <div className="cal-next-actions">
              <button className="cal-primary" onClick={() => openUrl(next.meetingUrl!)}>
                <Video size={14} strokeWidth={2.2} aria-hidden />
                Entrar na chamada
              </button>
              <button className="cal-secondary" onClick={() => navigator.clipboard.writeText(next.meetingUrl!)}>
                Copiar link
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="cal-free">
          <span className="cal-dot free" />
          Dia livre: sem mais eventos hoje.
        </div>
      )}
      <ul className="cal-list">
        {rest.map((e) => (
          <li key={e.id} className="cal-row">
            <span className="cal-time">{clock(e.startMs)}</span>
            <span className={`cal-dot ${dotColor(e.title)}`} />
            <span className="cal-row-text">
              <span>{e.title}</span>
              <span className="popover-meta">
                {duration(e)}
                {e.location ? ` · ${e.location}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {first && (
        <div className="cal-tomorrow">
          <span className="cal-time">Amanhã</span>
          <span>
            {clock(first.startMs)} · {first.title}
          </span>
        </div>
      )}
      <ActionFooter
        context={`Atualizado ${timeAgo(data.fetchedAt)}`}
        actions={[
          ...(join ? [{ label: "Entrar", keys: "↵", onClick: () => openUrl(join) }] : []),
          { label: "Abrir calendário", keys: `${keys.command} O`, onClick: openCalendar },
        ]}
      />
    </>
  );
}
