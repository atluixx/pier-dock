import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { Video } from "../ui/DockIcons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, type CalendarData } from "../lib/ipc";
import { canJoin, clock, countdown, isOngoing, remainingToday } from "../lib/calendar";
import { useNow } from "../hooks/useSystem";
import { Tooltip } from "../ui/Tooltip";
import { Tile, togglePanel, useHover } from "./Tile";
import { locale, useT } from "../i18n";

function shortWeekday(date: Date): string {
  return date.toLocaleDateString(locale(), { weekday: "short" }).replace(".", "").toUpperCase();
}

export function CalendarWidget({ data, wide }: { data: CalendarData | null; wide: boolean }) {
  const now = useNow(15_000).getTime();
  const ref = useRef<HTMLDivElement>(null);
  const { hover, bind } = useHover();
  const { calendar: t, common } = useT();

  if (data && !data.configured) {
    return (
      <Tile kind="calendar" label={t.tileIdle} className="cal-tile idle" panel={false} onClick={() => ipc.openSettings()}>
        <CalendarDays size={wide ? 20 : 18} strokeWidth={1.8} aria-hidden />
      </Tile>
    );
  }

  const next = remainingToday(data?.events ?? [], now)[0];
  const ongoing = next ? isOngoing(next, now) : false;
  const label = next ? `${next.title}, ${countdown(next, now)}` : t.noMoreToday;

  if (!wide) {
    const until = next ? Math.max(1, Math.ceil(((ongoing ? next.endMs : next.startMs) - now) / 60_000)) : 0;
    const today = new Date(now);
    return (
      <Tile kind="calendar" label={t.tile(label)} className="cal-tile small">
        {next && until < 60 ? (
          <>
            <span className="cal-eyebrow">
              <span className="cal-dot next" />
              {ongoing ? t.eyebrowNow : t.eyebrowIn}
            </span>
            <span className="cal-big">{until}</span>
            <span className="cal-unit">min</span>
          </>
        ) : next && ongoing ? (
          <>
            <span className="cal-eyebrow">
              <span className="cal-dot next" />
              {t.eyebrowNow}
            </span>
            <span className="cal-big">{Math.floor(until / 60)}h</span>
            {until % 60 > 0 && <span className="cal-unit">{until % 60} min</span>}
          </>
        ) : next ? (
          <>
            <span className="cal-eyebrow">
              <span className="cal-dot next" />
              {t.eyebrowAt}
            </span>
            <span className="cal-big long">{clock(next.startMs)}</span>
          </>
        ) : (
          <>
            <span className="cal-eyebrow">{shortWeekday(today)}</span>
            <span className="cal-big">{today.getDate()}</span>
          </>
        )}
      </Tile>
    );
  }

  const join = next && canJoin(next, now);
  return (
    <div ref={ref} className="cal-tile wide" data-widget {...bind}>
      {hover && <Tooltip label={label} />}
      <button className="cal-open" aria-label={t.tile(label)} onClick={() => ref.current && togglePanel("calendar", ref.current)}>
        <span className={`cal-dot ${next ? "next" : "free"}`} />
        <span className="cal-text">
          <span className="cal-title">{next ? next.title : t.free}</span>
          <span className={`cal-sub ${ongoing ? "ongoing" : ""}`}>{next ? countdown(next, now) : t.noMoreToday}</span>
        </span>
      </button>
      {join && next.meetingUrl && (
        <button className="cal-join" onClick={() => openUrl(next.meetingUrl!)}>
          <Video size={12} strokeWidth={2.4} aria-hidden />
          {common.join}
        </button>
      )}
    </div>
  );
}
