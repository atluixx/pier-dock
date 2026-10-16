//! Dock no macOS: janela flutuante em todos os Spaces, fora do ⌘` e parada no Mission Control,
//! com click-through fora da barra (thread que acompanha o cursor, como no Windows). O macOS não
//! tem API pública para reservar área da tela, então a dock fica por cima das janelas.
//!
//! Sem `FullScreenAuxiliary` a janela não entra nos Spaces de apps em tela cheia: lá a dock some
//! sozinha, como o Windows faz com a thread de tela cheia.

use std::time::{Duration, Instant};

use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use super::{hit_rect, layout, place_window, set_visible, want_visible, HOVER_GRACE_MS};
use crate::platform::macos::pointer;

pub fn init(window: &WebviewWindow) {
    let w = window.clone();
    let _ = window.run_on_main_thread(move || {
        let Ok(ptr) = w.ns_window() else { return };
        let ns_window = unsafe { &*(ptr as *const NSWindow) };
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
    });
    pointer::forward(window);
    apply_layout(window);
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.show();
    start_pointer_thread(window.clone());
}

pub fn apply_layout(window: &WebviewWindow) {
    place_window(window);
}

/// Mesma lógica do `start_pointer_thread` do Windows. Posição e tamanho da janela só mudam com o
/// layout, então são relidos a cada meio segundo em vez de a cada volta (cada leitura é uma ida
/// à thread principal).
fn start_pointer_thread(window: WebviewWindow) {
    std::thread::spawn(move || {
        let app = window.app_handle().clone();
        let mut ignoring = true;
        let mut hover_until = Instant::now();
        let mut frame: Option<(PhysicalPosition<i32>, PhysicalSize<u32>, f64)> = None;
        let mut frame_read = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(if ignoring { 30 } else { 16 }));
            if frame.is_none() || frame_read.elapsed() > Duration::from_millis(500) {
                frame = match (window.outer_position(), window.outer_size(), window.scale_factor()) {
                    (Ok(pos), Ok(size), Ok(scale)) => Some((pos, size, scale)),
                    _ => None,
                };
                frame_read = Instant::now();
            }
            let (Some((pos, size, scale)), Ok(cursor)) = (frame, app.cursor_position()) else { continue };
            let hit = hit_rect();
            if hit.width <= 0.0 {
                continue;
            }
            let (win_left, win_top) = (pos.x as f64, pos.y as f64);
            let (win_right, win_bottom) = (win_left + size.width as f64, win_top + size.height as f64);
            let headroom = if ignoring { 0.0 } else { layout().hover_headroom };
            let left = win_left + hit.x * scale;
            let right = left + hit.width * scale;
            let top = win_top + (hit.y - headroom).max(0.0) * scale;
            let (cx, cy) = (cursor.x, cursor.y);
            let over_dock = super::dock_visible() && cx >= left && cx <= right && cy >= top && cy <= win_bottom;
            // O cursor para na última linha de pontos da tela, um ponto (`scale` pixels) acima da base.
            let at_edge = cy >= win_bottom - 2.0 * scale && cx >= win_left && cx < win_right;

            let now = Instant::now();
            if over_dock || at_edge {
                hover_until = now + Duration::from_millis(HOVER_GRACE_MS);
            }
            set_visible(&window, want_visible(now < hover_until, crate::windows_list::app_has_focus));

            if over_dock == ignoring {
                ignoring = !over_dock;
                let _ = window.set_ignore_cursor_events(ignoring);
                if ignoring {
                    let _ = window.emit("dock-pointer-left", ());
                }
            }
        }
    });
}

pub fn hit_rect_changed(_app: &AppHandle) {}

/// O hover vem da thread que acompanha o cursor.
pub fn set_hover(_hovering: bool) {}
