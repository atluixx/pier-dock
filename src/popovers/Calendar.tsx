import type { CSSProperties } from "react";
import { CalendarDays, Copy, Video } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, type CalendarEvent } from "../lib/ipc";
import { canJoin, clock, countdown, dotColor, duration, isOngoing, remainingToday, tomorrow } from "../lib/calendar";
import { timeAgo } from "../lib/format";
import { keys } from "../lib/platform";
import { useCalendar } from "../hooks/useCalendar";
import { useNow } from "../hooks/useSystem";
import { ActionFooter } from "../ui/ActionFooter";
import { dict, locale, useT } from "../i18n";

function subtitle(e: CalendarEvent): string {
  const t = dict().calendar;
  if (e.meetingUrl) return e.attendees > 1 ? t.videoCallWith(e.attendees) : t.videoCall;
  return e.location || duration(e);
}

function row(e: CalendarEvent) {
  return (
    <li key={e.id} className="cal-row" style={{ "--ev": `var(--${dotColor(e.title)})` } as CSSProperties}>
      <span className="cal-time">{clock(e.startMs)}</span>
      <span className="cal-rail" />
      <span className="cal-row-text">
        <span>{e.title}</span>
        <span className="popover-meta">
          {duration(e)}
          {e.location ? ` · ${e.location}` : ""}
        </span>
      </span>
    </li>
  );
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

  const day = new Date(now);
  const progress = next && isOngoing(next, now) ? (now - next.startMs) / (next.endMs - next.startMs) : null;

  return (
    <>
      <div className="cal-header">
        <div className="cal-title">
          <span className="cal-heading">{day.toLocaleDateString(locale(), { weekday: "long" })}</span>
          <span className="popover-meta">{day.toLocaleDateString(locale(), { day: "numeric", month: "long" })}</span>
        </div>
        {today.length > 0 && (
          <span className="cal-count" title={t.remaining(today.length)}>
            {today.length}
          </span>
        )}
      </div>
      {data.error && <div className="error-box">{data.error}</div>}
      {next ? (
        <div className="cal-next" style={{ "--ev": `var(--${dotColor(next.title)})` } as CSSProperties}>
          <span className="cal-next-when">{progress != null ? common.now : countdown(next, now).split(" · ")[0]}</span>
          <span className="cal-next-title">{next.title}</span>
          <span className="popover-meta">
            {clock(next.startMs)} – {clock(next.endMs)} · {subtitle(next)}
          </span>
          {progress != null && (
            <span className="cal-progress" aria-hidden>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          )}
          {next.meetingUrl && (
            <div className="cal-next-actions">
              <button className="cal-primary" onClick={() => openUrl(next.meetingUrl!)}>
                <Video size={14} strokeWidth={2.2} aria-hidden />
                {t.joinCall}
              </button>
              <button
                className="cal-secondary"
                title={t.copyLink}
                aria-label={t.copyLink}
                onClick={() => navigator.clipboard.writeText(next.meetingUrl!)}
              >
                <Copy size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="cal-free">
          <span className="empty-icon">
            <CalendarDays size={20} strokeWidth={1.8} />
          </span>
          {t.freeDay}
        </div>
      )}
      <div className="cal-scroll">
        {rest.length > 0 && (
          <>
            <span className="cal-section">{t.laterToday}</span>
            <ul className="cal-list">{rest.map((e) => row(e))}</ul>
          </>
        )}
        {first && (
          <>
            <span className="cal-section">{t.tomorrow}</span>
            <ul className="cal-list dim">{row(first)}</ul>
          </>
        )}
      </div>
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
