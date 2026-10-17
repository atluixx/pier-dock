//! Timer do Pomodoro. Fica no processo nativo porque a dock e o painel são WebViews separadas e
//! o tempo precisa continuar correndo com o painel fechado. Cada mudança emite `pomodoro-changed`.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::config::ConfigState;
use crate::util::data_dir;

/// Sessões de foco por ciclo; depois da última vem a pausa longa.
const SESSIONS: u32 = 4;
const LONG_BREAK_FACTOR: f64 = 3.0;

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Focus,
    ShortBreak,
    LongBreak,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroState {
    pub phase: Phase,
    pub running: bool,
    /// `false` enquanto a etapa ainda não foi iniciada.
    pub started: bool,
    /// Com o timer rodando, o frontend conta a partir daqui.
    pub ends_at_ms: Option<f64>,
    pub remaining_ms: f64,
    pub total_ms: f64,
    pub session: u32,
    pub sessions: u32,
    pub focus_today_ms: f64,
}

/// Duração do foco e da pausa curta, em ms.
type Durations = (f64, f64);

#[derive(Debug, PartialEq)]
enum Finished {
    Focus { long_break: bool },
    Break,
}

#[derive(Debug, Clone)]
struct Timer {
    phase: Phase,
    session: u32,
    running: bool,
    started: bool,
    remaining_ms: f64,
    ends_at_ms: f64,
    total_ms: f64,
    /// Desde quando o foco em andamento ainda não foi somado a `focus_today_ms`.
    counted_until_ms: f64,
    focus_today_ms: f64,
    today: String,
}

impl Timer {
    fn new(d: Durations, today: String, focus_today_ms: f64) -> Self {
        Timer {
            phase: Phase::Focus,
            session: 1,
            running: false,
            started: false,
            remaining_ms: d.0,
            ends_at_ms: 0.0,
            total_ms: d.0,
            counted_until_ms: 0.0,
            focus_today_ms,
            today,
        }
    }

    fn phase_total(phase: Phase, d: Durations) -> f64 {
        match phase {
            Phase::Focus => d.0,
            Phase::ShortBreak => d.1,
            Phase::LongBreak => d.1 * LONG_BREAK_FACTOR,
        }
    }

    fn roll_day(&mut self, today: &str) {
        if self.today != today {
            self.today = today.to_string();
            self.focus_today_ms = 0.0;
        }
    }

    /// Soma ao total do dia o foco corrido desde a última conta.
    fn count_focus(&mut self, until_ms: f64, today: &str) {
        self.roll_day(today);
        if self.running && self.phase == Phase::Focus {
            self.focus_today_ms += (until_ms - self.counted_until_ms).max(0.0);
            self.counted_until_ms = until_ms;
        }
    }

    fn enter(&mut self, phase: Phase, d: Durations, now: f64, running: bool) {
        self.phase = phase;
        self.total_ms = Self::phase_total(phase, d);
        self.remaining_ms = self.total_ms;
        self.running = running;
        self.started = running;
        self.ends_at_ms = now + self.total_ms;
        self.counted_until_ms = now;
    }

    fn next_phase(&self) -> Phase {
        match self.phase {
            Phase::Focus if self.session >= SESSIONS => Phase::LongBreak,
            Phase::Focus => Phase::ShortBreak,
            _ => Phase::Focus,
        }
    }

    fn advance(&mut self, d: Durations, now: f64, running: bool) {
        let next = self.next_phase();
        match self.phase {
            Phase::LongBreak => self.session = 1,
            Phase::ShortBreak => self.session = (self.session + 1).min(SESSIONS),
            Phase::Focus => {}
        }
        self.enter(next, d, now, running);
    }

    fn toggle(&mut self, now: f64, today: &str) {
        if self.running {
            self.count_focus(now, today);
            self.remaining_ms = (self.ends_at_ms - now).max(0.0);
            self.running = false;
        } else {
            self.ends_at_ms = now + self.remaining_ms;
            self.counted_until_ms = now;
            self.running = true;
            self.started = true;
        }
    }

    fn skip(&mut self, d: Durations, now: f64, today: &str) {
        self.count_focus(now, today);
        let running = self.running;
        self.advance(d, now, running);
    }

    fn reset(&mut self, d: Durations, now: f64, today: &str) {
        self.count_focus(now, today);
        let phase = self.phase;
        self.enter(phase, d, now, false);
    }

    /// Fim do foco: a pausa começa sozinha. Fim da pausa: o próximo foco espera o usuário.
    fn tick(&mut self, d: Durations, now: f64, today: &str) -> Option<Finished> {
        if !self.running || now < self.ends_at_ms {
            return None;
        }
        let ended_at = self.ends_at_ms;
        self.count_focus(ended_at, today);
        let finished = match self.phase {
            Phase::Focus => Finished::Focus { long_break: self.next_phase() == Phase::LongBreak },
            _ => Finished::Break,
        };
        let auto_start = self.phase == Phase::Focus;
        self.advance(d, now, auto_start);
        Some(finished)
    }

    /// O ciclo mudou nas configurações: só a etapa que ainda não começou acompanha.
    fn set_durations(&mut self, d: Durations) {
        if !self.started {
            self.total_ms = Self::phase_total(self.phase, d);
            self.remaining_ms = self.total_ms;
        }
    }

    fn snapshot(&self, now: f64) -> PomodoroState {
        let mut focus_today_ms = self.focus_today_ms;
        if self.running && self.phase == Phase::Focus {
            focus_today_ms += (now - self.counted_until_ms).max(0.0);
        }
        PomodoroState {
            phase: self.phase,
            running: self.running,
            started: self.started,
            ends_at_ms: self.running.then_some(self.ends_at_ms),
            remaining_ms: if self.running { (self.ends_at_ms - now).max(0.0) } else { self.remaining_ms },
            total_ms: self.total_ms,
            session: self.session,
            sessions: SESSIONS,
            focus_today_ms,
        }
    }
}

static TIMER: Mutex<Option<Timer>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Stats {
    date: String,
    focus_today_ms: f64,
}

fn stats_path() -> std::path::PathBuf {
    data_dir().join("pomodoro.json")
}

fn save_stats(timer: &Timer) {
    let stats = Stats { date: timer.today.clone(), focus_today_ms: timer.focus_today_ms };
    if let Ok(json) = serde_json::to_string(&stats) {
        let _ = std::fs::write(stats_path(), json);
    }
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn durations(app: &AppHandle) -> Durations {
    let (focus, rest) = app.state::<ConfigState>().0.lock().unwrap().pomodoro.durations();
    (focus as f64 * 60_000.0, rest as f64 * 60_000.0)
}

/// Roda `f` no timer (criando-o na primeira vez) e devolve o estado atual.
fn with_timer<R>(app: &AppHandle, f: impl FnOnce(&mut Timer, Durations) -> R) -> (R, PomodoroState) {
    let d = durations(app);
    let mut guard = TIMER.lock().unwrap();
    let timer = guard.get_or_insert_with(|| {
        let today = today();
        let stats: Stats = std::fs::read_to_string(stats_path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        let focus_today = if stats.date == today { stats.focus_today_ms } else { 0.0 };
        Timer::new(d, today, focus_today)
    });
    let result = f(timer, d);
    (result, timer.snapshot(now_ms()))
}

fn notify(app: &AppHandle, finished: &Finished) {
    let lang = crate::i18n::current(app);
    let (title, body) = match finished {
        Finished::Focus { long_break: true } => (
            lang.t("Hora da pausa longa", "Time for a long break"),
            lang.t("Ciclo concluído. Descanse um pouco.", "Cycle complete. Get some rest."),
        ),
        Finished::Focus { long_break: false } => {
            (lang.t("Hora da pausa", "Time for a break"), lang.t("Sessão de foco concluída.", "Focus session complete."))
        }
        Finished::Break => {
            (lang.t("Pausa terminou", "Break is over"), lang.t("Comece o próximo foco quando quiser.", "Start the next focus whenever you're ready."))
        }
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let (finished, state) = with_timer(&app, |timer, d| {
            let finished = timer.tick(d, now_ms(), &today());
            if finished.is_some() {
                save_stats(timer);
            }
            finished
        });
        if let Some(finished) = finished {
            let _ = app.emit("pomodoro-changed", &state);
            notify(&app, &finished);
        }
    });
}

/// Chamado quando a config é salva.
pub fn config_changed(app: &AppHandle) {
    let (_, state) = with_timer(app, |timer, d| timer.set_durations(d));
    let _ = app.emit("pomodoro-changed", &state);
}

#[tauri::command]
pub fn pomodoro_state(app: AppHandle) -> PomodoroState {
    with_timer(&app, |_, _| ()).1
}

/// `toggle` inicia, pausa ou retoma; `skip` vai para a próxima etapa; `reset` reinicia a atual.
#[tauri::command]
pub fn pomodoro_control(app: AppHandle, action: String) -> Result<PomodoroState, String> {
    let (_, state) = with_timer(&app, |timer, d| {
        let (now, today) = (now_ms(), today());
        match action.as_str() {
            "toggle" => timer.toggle(now, &today),
            "skip" => timer.skip(d, now, &today),
            "reset" => timer.reset(d, now, &today),
            _ => return,
        }
        save_stats(timer);
    });
    let _ = app.emit("pomodoro-changed", &state);
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: f64 = 60_000.0;
    const D: Durations = (25.0 * MIN, 5.0 * MIN);

    fn timer() -> Timer {
        Timer::new(D, "2026-10-16".into(), 0.0)
    }

    #[test]
    fn focus_ends_into_a_running_break() {
        let mut t = timer();
        t.toggle(0.0, "2026-10-16");
        assert_eq!(t.tick(D, 24.0 * MIN, "2026-10-16"), None);
        assert_eq!(t.tick(D, 25.0 * MIN + 300.0, "2026-10-16"), Some(Finished::Focus { long_break: false }));
        assert_eq!(t.phase, Phase::ShortBreak);
        assert!(t.running);
        assert_eq!(t.focus_today_ms, 25.0 * MIN);
    }

    #[test]
    fn break_ends_into_a_waiting_focus() {
        let mut t = timer();
        t.toggle(0.0, "2026-10-16");
        t.tick(D, 25.0 * MIN, "2026-10-16");
        assert_eq!(t.tick(D, 30.0 * MIN, "2026-10-16"), Some(Finished::Break));
        assert_eq!((t.phase, t.session, t.running, t.started), (Phase::Focus, 2, false, false));
        assert_eq!(t.remaining_ms, 25.0 * MIN);
    }

    #[test]
    fn fourth_session_gets_a_long_break_and_restarts_the_cycle() {
        let mut t = timer();
        t.session = SESSIONS;
        t.toggle(0.0, "2026-10-16");
        assert_eq!(t.tick(D, 25.0 * MIN, "2026-10-16"), Some(Finished::Focus { long_break: true }));
        assert_eq!(t.phase, Phase::LongBreak);
        assert_eq!(t.total_ms, 15.0 * MIN);
        t.skip(D, 26.0 * MIN, "2026-10-16");
        assert_eq!((t.phase, t.session), (Phase::Focus, 1));
    }

    #[test]
    fn pause_keeps_the_remaining_time_and_counts_focus() {
        let mut t = timer();
        t.toggle(0.0, "2026-10-16");
        t.toggle(10.0 * MIN, "2026-10-16");
        assert!(!t.running);
        assert_eq!(t.remaining_ms, 15.0 * MIN);
        assert_eq!(t.focus_today_ms, 10.0 * MIN);
        t.toggle(20.0 * MIN, "2026-10-16");
        assert_eq!(t.snapshot(25.0 * MIN).remaining_ms, 10.0 * MIN);
        assert_eq!(t.snapshot(25.0 * MIN).focus_today_ms, 15.0 * MIN);
    }

    #[test]
    fn focus_total_resets_on_a_new_day() {
        let mut t = Timer::new(D, "2026-10-15".into(), 50.0 * MIN);
        t.toggle(0.0, "2026-10-16");
        t.toggle(MIN, "2026-10-16");
        assert_eq!(t.focus_today_ms, MIN);
        assert_eq!(t.today, "2026-10-16");
    }

    #[test]
    fn only_an_unstarted_phase_follows_new_durations() {
        let mut t = timer();
        t.set_durations((50.0 * MIN, 10.0 * MIN));
        assert_eq!(t.remaining_ms, 50.0 * MIN);
        t.toggle(0.0, "2026-10-16");
        t.set_durations(D);
        assert_eq!(t.total_ms, 50.0 * MIN);
        t.reset(D, MIN, "2026-10-16");
        assert_eq!((t.total_ms, t.running), (25.0 * MIN, false));
    }
}
