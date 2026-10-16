//! Linux: o KWin borra o que está atrás das regiões listadas em `_KDE_NET_WM_BLUR_BEHIND_REGION`
//! de uma janela X11 (inclusive no XWayland). Outros compositores, como o Mutter do GNOME, não
//! oferecem nada parecido a clientes, e lá o material é sempre sólido.
//!
//! A propriedade só aceita retângulos, então os cantos arredondados viram faixas horizontais cada
//! vez mais estreitas.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use gtk::prelude::*;
use tauri::WebviewWindow;

use super::Rect;
use crate::platform::linux::x11;

#[derive(Clone, Copy, Default)]
struct Backdrop {
    rect: Rect,
    radius: f64,
    hidden: bool,
}

static BACKDROPS: Mutex<Option<HashMap<String, Backdrop>>> = Mutex::new(None);

fn with_backdrops<T>(f: impl FnOnce(&mut HashMap<String, Backdrop>) -> T) -> T {
    f(BACKDROPS.lock().unwrap().get_or_insert_with(HashMap::new))
}

pub fn supported() -> bool {
    static SUPPORTED: OnceLock<bool> = OnceLock::new();
    *SUPPORTED.get_or_init(|| x11::get().map(|x| x.blur_supported()).unwrap_or(false))
}

/// Faixas `[x, y, largura, altura]` que cobrem um retângulo de cantos arredondados (pixels).
fn rounded_rect_bands(x: i32, y: i32, width: i32, height: i32, radius: i32) -> Vec<[u32; 4]> {
    let radius = radius.clamp(0, width.min(height) / 2);
    let mut bands: Vec<[u32; 4]> = Vec::new();
    let mut push = |bx: i32, by: i32, bw: i32, bh: i32| {
        if bw > 0 && bh > 0 {
            bands.push([bx.max(0) as u32, by.max(0) as u32, bw as u32, bh as u32]);
        }
    };
    let inset = |row: i32| {
        let dy = radius as f64 - row as f64 - 0.5;
        (radius as f64 - (radius as f64 * radius as f64 - dy * dy).max(0.0).sqrt()).round() as i32
    };
    // Linhas seguidas com o mesmo recuo viram uma faixa só.
    let mut row = 0;
    while row < radius {
        let i = inset(row);
        let mut end = row + 1;
        while end < radius && inset(end) == i {
            end += 1;
        }
        push(x + i, y + row, width - 2 * i, end - row);
        push(x + i, y + height - end, width - 2 * i, end - row);
        row = end;
    }
    push(x, y + radius, width, height - 2 * radius);
    bands
}

fn apply(window: &WebviewWindow, b: Backdrop) {
    let Ok(gtk_window) = window.gtk_window() else { return };
    let Some(xid) = gtk_window.window().and_then(|g| g.downcast::<gdkx11::X11Window>().ok()).map(|x| x.xid() as u32) else {
        return;
    };
    let Some(x11) = x11::get() else { return };
    // Sem regiões o KWin borraria a janela inteira; sem a propriedade, nada.
    if b.hidden || !super::active() || b.rect.width <= 0.0 {
        x11.set_blur_region(xid, &[]);
        return;
    }
    let scale = gtk_window.scale_factor().max(1) as f64;
    let px = |v: f64| (v * scale).round() as i32;
    let bands = rounded_rect_bands(px(b.rect.x), px(b.rect.y), px(b.rect.width), px(b.rect.height), px(b.radius));
    x11.set_blur_region(xid, &bands);
}

fn update(window: &WebviewWindow, create: bool, change: impl FnOnce(&mut Backdrop) + Send + 'static) {
    let label = window.label().to_string();
    let w = window.clone();
    let _ = window.run_on_main_thread(move || {
        let b = with_backdrops(|backdrops| {
            if !create && !backdrops.contains_key(&label) {
                return None;
            }
            let b = backdrops.entry(label).or_default();
            change(b);
            Some(*b)
        });
        if let Some(b) = b {
            apply(&w, b);
        }
    });
}

pub fn set_frame(window: &WebviewWindow, rect: Rect, radius: f64) {
    update(window, true, move |b| {
        b.rect = rect;
        b.radius = radius;
    });
}

pub fn set_hidden(window: &WebviewWindow, hidden: bool) {
    update(window, false, move |b| b.hidden = hidden);
}

pub fn refresh(window: &WebviewWindow) {
    update(window, false, |_| {});
}

pub fn forget(label: &str) {
    with_backdrops(|backdrops| backdrops.remove(label));
}

#[cfg(test)]
mod tests {
    use super::rounded_rect_bands;

    #[test]
    fn bands_cover_the_rect_without_overlap() {
        let bands = rounded_rect_bands(10, 20, 200, 64, 20);
        let rows: u32 = bands.iter().map(|b| b[3]).sum();
        assert_eq!(rows, 64);
        // A faixa do meio tem a largura toda; as das pontas são mais estreitas.
        assert!(bands.iter().any(|b| b[2] == 200 && b[3] == 24));
        assert!(bands.iter().all(|b| b[0] >= 10 && b[0] + b[2] <= 210));
    }

    #[test]
    fn no_radius_is_a_single_band() {
        assert_eq!(rounded_rect_bands(0, 0, 50, 30, 0), vec![[0, 0, 50, 30]]);
    }
}
