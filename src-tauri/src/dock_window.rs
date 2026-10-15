//! Janela da dock: estilos Win32, registro como AppBar, posicionamento no monitor primário,
//! click-through fora da barra, ocultação automática quando um app está em foco e ocultação
//! quando um app está em tela cheia.

use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsZoomed,
    SetWindowLongPtrW, GWL_EXSTYLE, WM_USER, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
};

use crate::util::wide_to_string;

pub const DOCK_LABEL: &str = "dock";

static DOCK_HWND: AtomicIsize = AtomicIsize::new(0);
static APPBAR_REGISTERED: AtomicBool = AtomicBool::new(false);
static HIDDEN_FOR_FULLSCREEN: AtomicBool = AtomicBool::new(false);
/// A dock está à mostra (ou escondida pelo "ocultar automaticamente").
static VISIBLE: AtomicBool = AtomicBool::new(true);

const AUTO_HIDE_NEVER: u8 = 0;
const AUTO_HIDE_SMART: u8 = 1;
const AUTO_HIDE_ALWAYS: u8 = 2;
static AUTO_HIDE: AtomicU8 = AtomicU8::new(AUTO_HIDE_SMART);

/// Medidas em pixels lógicos (CSS), informadas pelo frontend.
#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    /// Altura reservada na base da tela (a área que janelas maximizadas não ocupam).
    pub reserved_height: f64,
    /// Altura total da janela, incluindo a folga para a magnificação e tooltips.
    pub window_height: f64,
    /// Quanto a área clicável cresce para cima enquanto o mouse está na dock.
    pub hover_headroom: f64,
}

#[derive(Clone, Copy, Default, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    /// Não usado hoje: a área clicável vai do topo da barra até a base da tela.
    #[allow(dead_code)]
    pub height: f64,
}

static LAYOUT: Mutex<Layout> = Mutex::new(Layout { reserved_height: 72.0, window_height: 170.0, hover_headroom: 80.0 });
static HIT: Mutex<HitRect> = Mutex::new(HitRect { x: 0.0, y: 0.0, width: 0.0, height: 0.0 });

fn dock_hwnd() -> HWND {
    HWND(DOCK_HWND.load(Ordering::SeqCst) as *mut _)
}

/// Estilos estendidos que a dock precisa. O tao recalcula os estilos da janela a partir das flags
/// dele em várias operações (show, resize…) e põe `WS_EX_APPWINDOW`, então a thread de ponteiro
/// reaplica isto continuamente; ela também é dona do bit de click-through (`WS_EX_TRANSPARENT`).
fn ensure_ex_style(hwnd: HWND, click_through: bool) {
    unsafe {
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let mut desired = (current & !(WS_EX_APPWINDOW.0 | WS_EX_TRANSPARENT.0))
            | WS_EX_TOOLWINDOW.0
            | WS_EX_NOACTIVATE.0
            | WS_EX_LAYERED.0;
        if click_through {
            desired |= WS_EX_TRANSPARENT.0;
        }
        if desired != current {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, desired as isize);
        }
    }
}

pub fn init(window: &WebviewWindow) {
    if let Ok(h) = window.hwnd() {
        DOCK_HWND.store(h.0 as isize, Ordering::SeqCst);
    }
    apply_layout(window);
    // Faz o tao criar a janela já como LAYERED; daqui em diante o bit é gerenciado por nós.
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.show();
    ensure_ex_style(dock_hwnd(), true);
    start_pointer_thread(window.clone());
    start_fullscreen_thread(window.app_handle().clone());
}

/// Posiciona a janela na base do monitor primário e reserva a área de trabalho via AppBar.
pub fn apply_layout(window: &WebviewWindow) {
    let layout = *LAYOUT.lock().unwrap();
    let Ok(Some(monitor)) = window.primary_monitor() else { return };
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let size = monitor.size();
    let win_h = (layout.window_height * scale).round() as i32;
    let reserved = (layout.reserved_height * scale).round() as i32;
    let bottom = pos.y + size.height as i32;

    let _ = window.set_size(PhysicalSize::new(size.width, win_h as u32));
    let _ = window.set_position(PhysicalPosition::new(pos.x, bottom - win_h));

    if AUTO_HIDE.load(Ordering::SeqCst) == AUTO_HIDE_NEVER {
        let rect = RECT { left: pos.x, top: bottom - reserved, right: pos.x + size.width as i32, bottom };
        register_appbar(rect, reserved);
    } else {
        remove_appbar();
    }
}

fn appbar_data(rect: RECT) -> APPBARDATA {
    APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: dock_hwnd(),
        uCallbackMessage: WM_USER + 0x4D,
        uEdge: ABE_BOTTOM,
        rc: rect,
        lParam: LPARAM(0),
    }
}

fn register_appbar(rect: RECT, height: i32) {
    if dock_hwnd().is_invalid() {
        return;
    }
    let mut abd = appbar_data(rect);
    unsafe {
        if !APPBAR_REGISTERED.swap(true, Ordering::SeqCst) {
            SHAppBarMessage(ABM_NEW, &mut abd);
        }
        SHAppBarMessage(ABM_QUERYPOS, &mut abd);
        abd.rc.top = abd.rc.bottom - height;
        SHAppBarMessage(ABM_SETPOS, &mut abd);
    }
}

pub fn remove_appbar() {
    if APPBAR_REGISTERED.swap(false, Ordering::SeqCst) {
        let mut abd = appbar_data(RECT::default());
        unsafe {
            SHAppBarMessage(ABM_REMOVE, &mut abd);
        }
    }
}

/// Chamado quando o explorer.exe reinicia: o registro da AppBar se perdeu com o explorer antigo.
pub fn reregister(app: &AppHandle) {
    APPBAR_REGISTERED.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window(DOCK_LABEL) {
        apply_layout(&window);
    }
}

/// Algum app (Chrome, VS Code…) está em primeiro plano? Desktop, shell, Menu Iniciar e as
/// janelas da própria dock (painéis, configurações) não contam.
fn app_has_focus(own_pid: u32) -> bool {
    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_invalid() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        pid != own_pid && !is_shell_window(fg)
    }
}

/// A janela é mais alta que a barra (folga para a magnificação), mas a área transparente não pode
/// bloquear cliques nas janelas de baixo. Esta thread liga o click-through sempre que o cursor
/// sai da barra e decide quando a dock aparece ou some (ocultar automaticamente).
fn start_pointer_thread(window: WebviewWindow) {
    std::thread::spawn(move || {
        let own_pid = std::process::id();
        let mut ignoring = true;
        let mut visible = true;
        let mut hover_until = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(if ignoring { 30 } else { 16 }));
            let hwnd = dock_hwnd();
            ensure_ex_style(hwnd, ignoring);
            let mut cursor = POINT::default();
            let mut win = RECT::default();
            unsafe {
                if GetCursorPos(&mut cursor).is_err() || GetWindowRect(hwnd, &mut win).is_err() {
                    continue;
                }
            }
            let scale = unsafe { GetDpiForWindow(hwnd) } as f64 / 96.0;
            let hit = *HIT.lock().unwrap();
            if hit.width <= 0.0 {
                continue;
            }
            let headroom = if ignoring { 0.0 } else { LAYOUT.lock().unwrap().hover_headroom };
            let left = win.left as f64 + hit.x * scale;
            let right = left + hit.width * scale;
            // Até a base da tela: a margem abaixo da barra também conta como "na dock".
            let bottom = win.bottom as f64;
            let top = win.top as f64 + (hit.y - headroom).max(0.0) * scale;
            let (cx, cy) = (cursor.x as f64, cursor.y as f64);
            let over_dock = visible && cx >= left && cx <= right && cy >= top && cy <= bottom;
            // Encostar o mouse na borda de baixo revela a dock escondida.
            let at_edge = cy >= win.bottom as f64 - 2.0 && cx >= win.left as f64 && cx < win.right as f64;

            let now = Instant::now();
            if over_dock || at_edge {
                hover_until = now + Duration::from_millis(700);
            }
            let hovering = now < hover_until;
            let want_visible = match AUTO_HIDE.load(Ordering::SeqCst) {
                AUTO_HIDE_NEVER => true,
                AUTO_HIDE_SMART => hovering || !app_has_focus(own_pid),
                _ => hovering,
            };
            if want_visible != visible {
                visible = want_visible;
                VISIBLE.store(visible, Ordering::SeqCst);
                let _ = window.emit("dock-visibility", visible);
            }

            let interactive = over_dock;
            if interactive == ignoring {
                ignoring = !interactive;
                ensure_ex_style(hwnd, ignoring);
                if ignoring {
                    let _ = window.emit("dock-pointer-left", ());
                }
            }
        }
    });
}

fn parse_auto_hide(mode: &str) -> u8 {
    match mode {
        "never" => AUTO_HIDE_NEVER,
        "always" => AUTO_HIDE_ALWAYS,
        _ => AUTO_HIDE_SMART,
    }
}

/// Troca o modo de ocultar. Com ocultação ligada a dock não reserva área de trabalho, então
/// janelas maximizadas usam a tela inteira (como a taskbar em "ocultar automaticamente").
pub fn set_auto_hide(app: &AppHandle, mode: &str) {
    let mode = parse_auto_hide(mode);
    if AUTO_HIDE.swap(mode, Ordering::SeqCst) != mode {
        if let Some(window) = app.get_webview_window(DOCK_LABEL) {
            apply_layout(&window);
        }
    }
}

pub fn init_auto_hide(mode: &str) {
    AUTO_HIDE.store(parse_auto_hide(mode), Ordering::SeqCst);
}

#[tauri::command]
pub fn dock_visible() -> bool {
    VISIBLE.load(Ordering::SeqCst)
}

fn is_shell_window(hwnd: HWND) -> bool {
    let mut buf = [0u16; 64];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
    let class = wide_to_string(&buf[..len]);
    matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd")
}

/// Esconde a dock enquanto um app ocupa a tela inteira do monitor primário (vídeos, jogos).
fn start_fullscreen_thread(app: AppHandle) {
    std::thread::spawn(move || {
        let own_pid = std::process::id();
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let Some(window) = app.get_webview_window(DOCK_LABEL) else { continue };
            let fullscreen = unsafe {
                let fg = GetForegroundWindow();
                let mut pid = 0u32;
                GetWindowThreadProcessId(fg, Some(&mut pid));
                if fg.is_invalid() || pid == own_pid || is_shell_window(fg) {
                    None
                } else {
                    let mut rect = RECT::default();
                    let monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
                    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
                    let ok = GetWindowRect(fg, &mut rect).is_ok() && GetMonitorInfoW(monitor, &mut info).as_bool();
                    // Sem área reservada (ocultar automaticamente), uma janela maximizada também cobre
                    // o monitor inteiro, mas não é tela cheia: a dock tem que poder aparecer por cima.
                    let maximized = IsZoomed(fg).as_bool();
                    // dwFlags & 1 = MONITORINFOF_PRIMARY: a dock só vive no monitor primário.
                    Some(
                        ok && !maximized
                            && info.dwFlags & 1 != 0
                            && rect.left <= info.rcMonitor.left
                            && rect.top <= info.rcMonitor.top
                            && rect.right >= info.rcMonitor.right
                            && rect.bottom >= info.rcMonitor.bottom,
                    )
                }
            };
            // `None`: a própria dock ou o desktop estão em foco; mantém o estado atual.
            let Some(fullscreen) = fullscreen else { continue };
            if fullscreen != HIDDEN_FOR_FULLSCREEN.load(Ordering::SeqCst) {
                HIDDEN_FOR_FULLSCREEN.store(fullscreen, Ordering::SeqCst);
                let _ = if fullscreen { window.hide() } else { window.show() };
            }
        }
    });
}

#[tauri::command]
pub fn set_dock_layout(window: WebviewWindow, layout: Layout) {
    *LAYOUT.lock().unwrap() = layout;
    if let Some(dock) = window.app_handle().get_webview_window(DOCK_LABEL) {
        apply_layout(&dock);
    }
}

#[tauri::command]
pub fn set_hit_rect(rect: HitRect) {
    *HIT.lock().unwrap() = rect;
}

/// Retângulo da área reservada, em pixels físicos de tela — usado para ancorar painéis.
pub fn reserved_top_and_scale(window: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let monitor = window.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let reserved = LAYOUT.lock().unwrap().reserved_height * scale;
    let bottom = monitor.position().y as f64 + monitor.size().height as f64;
    Some((bottom - reserved, scale, monitor.position().x as f64, monitor.size().width as f64))
}
