//! Janelas auxiliares: painéis dos widgets (ancorados acima da dock) e a janela de configurações.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::dock_window::{reserved_top_and_scale, DOCK_LABEL};
use crate::util::ErrStr;

pub const SETTINGS_LABEL: &str = "settings";

/// Margem transparente da janela em volta do painel e raio dos cantos, iguais a `--panel-inset` e
/// a `--radius-window` no CSS.
const PANEL_INSET: f64 = 12.0;
const PANEL_RADIUS: f64 = 18.0;

/// (label, kind) do painel aberto. Cada painel ganha um label novo porque fechar uma janela é
/// assíncrono e reutilizar o label logo em seguida falharia.
static OPEN_PANEL: Mutex<Option<(String, String)>> = Mutex::new(None);
static PANEL_COUNTER: AtomicU32 = AtomicU32::new(0);

/// O frontend decide o que renderizar por esta variável global, injetada antes da página carregar.
fn view_script(view: &str, kind: &str) -> String {
    format!(
        "window.__WINDOCK_VIEW__ = {};",
        serde_json::json!({ "view": view, "kind": kind })
    )
}

pub fn close_open_panel(app: &AppHandle) -> Option<String> {
    let (label, kind) = OPEN_PANEL.lock().unwrap().take()?;
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.destroy();
    }
    Some(kind)
}

/// Abre o painel de um widget acima dele; clicar de novo no mesmo widget fecha.
#[tauri::command]
pub async fn open_panel(app: AppHandle, kind: String, anchor_x: f64, width: f64, height: f64) -> Result<(), String> {
    if close_open_panel(&app).as_deref() == Some(kind.as_str()) {
        return Ok(());
    }
    let dock = app.get_webview_window(DOCK_LABEL).ok_or("dock não encontrada")?;
    let (reserved_top, scale, mon_x, mon_w) = reserved_top_and_scale(&dock).ok_or("monitor não encontrado")?;
    let dock_x = dock.outer_position().err_str()?.x as f64;

    let margin = 10.0 * scale;
    let (w, h) = (width * scale, height * scale);
    let x = (dock_x + anchor_x * scale - w / 2.0).clamp(mon_x + margin, mon_x + mon_w - w - margin);
    // A janela tem uma margem transparente em volta do painel (sombra), que já serve de espaço
    // entre o painel e a dock.
    let y = reserved_top - h;

    let label = format!("panel-{}", PANEL_COUNTER.fetch_add(1, Ordering::SeqCst));
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .initialization_script(&view_script("panel", &kind))
        .title("WinDock")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(width, height)
        .position(x / scale, y / scale)
        .focused(true);
    // No Linux a janela aparece preta até o WebKitGTK desenhar a primeira vez: só mostra depois
    // que a página carregou.
    #[cfg(target_os = "linux")]
    let builder = builder.visible(false).on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
    #[cfg(target_os = "macos")]
    let builder = builder.accept_first_mouse(true);
    let window = builder.build().err_str()?;
    #[cfg(target_os = "macos")]
    crate::platform::macos::pointer::forward(&window);
    let rect = crate::backdrop::Rect { x: PANEL_INSET, y: PANEL_INSET, width: width - 2.0 * PANEL_INSET, height: height - 2.0 * PANEL_INSET };
    crate::backdrop::set_frame(&window, rect, PANEL_RADIUS);

    // Fecha ao perder o foco, mas só depois de ter tido foco: no X11 a janela recém-criada recebe
    // um "sem foco" antes de ser focada, o que a fechava na hora.
    let handle = window.clone();
    let was_focused = AtomicBool::new(false);
    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            crate::backdrop::forget(handle.label());
        }
        if let WindowEvent::Focused(focused) = event {
            if *focused {
                was_focused.store(true, Ordering::SeqCst);
                return;
            }
            if !was_focused.load(Ordering::SeqCst) {
                return;
            }
            let mut open = OPEN_PANEL.lock().unwrap();
            if open.as_ref().map(|(l, _)| l == handle.label()).unwrap_or(false) {
                *open = None;
            }
            let _ = handle.destroy();
        }
    });
    *OPEN_PANEL.lock().unwrap() = Some((label, kind));
    Ok(())
}

#[tauri::command]
pub fn close_panel(app: AppHandle) {
    close_open_panel(&app);
}

pub fn open_settings_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(window);
    }
    let builder = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
        .initialization_script(&view_script("settings", ""))
        .title("WinDock — Configurações")
        .inner_size(920.0, 660.0)
        .min_inner_size(720.0, 480.0)
        .theme(Some(tauri::Theme::Dark))
        .center()
        .focused(true);
    // O material da janela inteira vem do sistema; no Linux não há, e a página pinta o sólido.
    #[cfg(not(target_os = "linux"))]
    let builder = builder.transparent(true).effects(settings_effects());
    builder.build()
}

/// Vibrancy escura no macOS, Mica no Windows 11; sem efeito com o material sólido.
#[cfg(not(target_os = "linux"))]
fn settings_effects() -> tauri::utils::config::WindowEffectsConfig {
    use tauri::window::{Effect, EffectState, EffectsBuilder};
    if !crate::backdrop::active() {
        return EffectsBuilder::new().build();
    }
    let effect = if cfg!(target_os = "macos") { Effect::HudWindow } else { Effect::MicaDark };
    EffectsBuilder::new().effect(effect).state(EffectState::Active).build()
}

/// Troca o material da janela de configurações aberta (a dock e os painéis são do `backdrop`).
pub fn apply_settings_material(app: &AppHandle) {
    #[cfg(not(target_os = "linux"))]
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.set_effects(settings_effects());
    }
    #[cfg(target_os = "linux")]
    let _ = app;
}

#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_window(&app).map(|_| ()).err_str()
}
