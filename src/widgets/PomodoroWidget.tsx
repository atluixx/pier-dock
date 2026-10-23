import { useRef } from "react";
import { Pause, Play, SkipForward } from "../ui/DockIcons";
import { pomodoro, usePomodoro } from "../hooks/usePomodoro";
import { formatTimer } from "../lib/format";
import { caption, toggleLabel, tone } from "../lib/pomodoro";
import { Ring } from "../ui/Ring";
import { Tooltip } from "../ui/Tooltip";
import { Tile, togglePanel, useHover } from "./Tile";
import { useT } from "../i18n";

export function PomodoroWidget({ wide }: { wide: boolean }) {
  const { state, remainingMs } = usePomodoro();
  const ref = useRef<HTMLDivElement>(null);
  const { hover, bind } = useHover();
  const t = useT().pomodoro;
  const progress = state?.totalMs ? remainingMs / state.totalMs : 1;
  const text = state ? caption(state) : "Pomodoro";
  const label = t.tile(text, formatTimer(remainingMs));
  const ToggleIcon = state?.running ? Pause : Play;

  if (!wide) {
    return (
      <Tile kind="pomodoro" label={label} className={`pomo-tile small pomo-${tone(state)}`}>
        <Ring size={40} radius={18.5} stroke={3} progress={progress} />
        <span className="pomo-minutes">
          {Math.max(1, Math.floor(remainingMs / 60_000))}
          <small>m</small>
        </span>
      </Tile>
    );
  }

  return (
    <div ref={ref} className={`pomo-tile wide pomo-${tone(state)}`} data-widget {...bind}>
      {hover && <Tooltip label={label} />}
      <button className="pomo-ring" aria-label={toggleLabel(state)} onClick={pomodoro("toggle")}>
        <Ring size={34} radius={15.75} stroke={2.5} progress={progress} />
        <ToggleIcon size={12} />
      </button>
      <button className="pomo-open" aria-label={label} onClick={() => ref.current && togglePanel("pomodoro", ref.current)}>
        <span className="pomo-time">{formatTimer(remainingMs)}</span>
        <span className="pomo-caption">{text}</span>
      </button>
      <button className="pomo-skip" aria-label={t.skipNext} onClick={pomodoro("skip")}>
        <SkipForward size={14} />
      </button>
    </div>
  );
}
