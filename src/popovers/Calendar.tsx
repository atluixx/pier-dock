import { CalendarDays, Video } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, type CalendarEvent } from "../lib/ipc";
import { canJoin, clock, countdown, dotColor, duration, isOngoing, remainingToday, tomorrow } from "../lib/calendar";
import { shortDate, timeAgo } from "../lib/format";
import { keys } from "../lib/platform";
import { useCalendar } from "../hooks/useCalendar";
import { useNow } from "../hooks/useSystem";
import { ActionFooter } from "../ui/ActionFooter";
import { dict, useT } from "../i18n";

function subtitle(e: CalendarEvent): string {
  const t = dict().calendar;
  if (e.meetingUrl) return e.attendees > 1 ? t.videoCallWith(e.attendees) : t.videoCall;
  return e.location || duration(e);
}

export function Calendar() {
  const data = useCalendar();
  const now = useNow(15_000).getTime();
  const { calendar: t, common } = useT();

  if (!data?.configured) {
    return (
      <div className="popover-empty">
        <span className="empty-icon">
          <CalendarDays size={22} strokeWidth={1.8} />
        </span>
        <span className="empty-title">{t.noneConnected}</span>
        <span className="empty-sub">{t.pasteInSettings}</span>
        <button className="action primary" onClick={() => ipc.openSettings()}>
          {common.openSettings}
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
        <span className="cal-heading">{t.todayHeading(shortDate(new Date(now)))}</span>
        <span className="popover-meta">
          {today.length ? t.remaining(today.length) : t.noMoreEvents}
        </span>
      </div>
      {data.error && <div className="error-box">{data.error}</div>}
      {next ? (
        <div className="cal-next">
          <div className="cal-next-head">
            <span className="cal-next-when">{isOngoing(next, now) ? common.now : countdown(next, now).split(" · ")[0]}</span>
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
                {t.joinCall}
              </button>
              <button className="cal-secondary" onClick={() => navigator.clipboard.writeText(next.meetingUrl!)}>
                {t.copyLink}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="cal-free">
          <span className="cal-dot free" />
          {t.freeDay}
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
          <span className="cal-time">{t.tomorrow}</span>
          <span>
            {clock(first.startMs)} · {first.title}
          </span>
        </div>
      )}
      <ActionFooter
        context={common.updatedAgo(timeAgo(data.fetchedAt))}
        actions={[
          ...(join ? [{ label: common.join, keys: "↵", onClick: () => openUrl(join) }] : []),
          { label: t.openCalendar, keys: `${keys.command} O`, onClick: openCalendar },
        ]}
      />
    </>
  );
}
