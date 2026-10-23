import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNow } from "../hooks/useSystem";
import { dateKey, monthDays, sameDay } from "../lib/monthCalendar";
import { locale, useT } from "../i18n";

/** The clock opens a local month calendar, independently of the configured iCal agenda. */
export function MonthCalendar() {
  const today = useNow(60_000);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const t = useT().dateCalendar;
  const heading = month.toLocaleDateString(locale(), { month: "long", year: "numeric" });
  const days = monthDays(month.getFullYear(), month.getMonth());
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i, 12));
  const move = (offset: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + offset, 1, 12));
  return (
    <>
      <div className="popover-header">
        <h2 className="popover-heading" aria-live="polite">{heading}</h2>
        <div className="month-navigation">
          <button className="icon-button" aria-label={t.previous} onClick={() => move(-1)}><ChevronLeft size={17} /></button>
          <button className="icon-button" aria-label={t.next} onClick={() => move(1)}><ChevronRight size={17} /></button>
        </div>
      </div>
      <table className="month-calendar" aria-label={heading}>
        <thead><tr>{weekdays.map((day) => <th scope="col" key={day.getDay()} abbr={day.toLocaleDateString(locale(), { weekday: "long" })}>{day.toLocaleDateString(locale(), { weekday: "short" })}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, week) => (
          <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((day) => (
            <td key={dateKey(day)} className={day.getMonth() !== month.getMonth() ? "other-month" : ""}>
              <time dateTime={dateKey(day)} aria-current={sameDay(day, today) ? "date" : undefined}>{day.getDate()}</time>
            </td>
          ))}</tr>
        ))}</tbody>
      </table>
      <div className="month-today"><button className="btn" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1, 12))}>{t.today}</button></div>
    </>
  );
}
