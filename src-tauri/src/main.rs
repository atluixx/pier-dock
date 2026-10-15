#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod apps;
mod config;
mod dock_window;
mod github;
mod icons;
mod media;
mod panels;
mod platform;
mod system;
mod taskbar;
mod util;
mod windows_list;

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const APP_DIGITS: [Code; 9] = [
    Code::Digit1,
    Code::Digit2,
    Code::Digit3,
    Code::Digit4,
    Code::Digit5,
    Code::Digit6,
    Code::Digit7,
    Code::Digit8,
    Code::Digit9,
];

fn quit(app: &AppHandle) {
    taskbar::restore();
    app.exit(0);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    quit(&app);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Configurações", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, "reload", "Recarregar dock", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_label = if cfg!(windows) { "Restaurar taskbar e sair" } else { "Sair" };
    let quit_item = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &reload, &separator, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("WinDock")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                let _ = panels::open_settings_window(app);
            }
            "reload" => {
                if let Some(dock) = app.get_webview_window(dock_window::DOCK_LABEL) {
                    let _ = dock.eval("location.reload()");
                }
            }
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = panels::open_settings_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Ctrl+Alt+1..9 abre/foca o app na posição N da dock (a dock decide o que fazer).
fn register_shortcuts(app: &AppHandle) {
    for code in APP_DIGITS {
        let _ = app.global_shortcut().register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code));
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    platform::linux::prepare_env();
    if std::env::args().any(|a| a == "--restore-taskbar") {
        taskbar::restore();
        return;
    }
    taskbar::install_crash_guards();

    let shortcuts = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(index) = APP_DIGITS.iter().position(|c| shortcut.key == *c) {
                    let _ = app.emit_to(dock_window::DOCK_LABEL, "shortcut-app", index);
                }
            }
        })
        .build();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = panels::open_settings_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(shortcuts)
        .manage(config::ConfigState(Mutex::new(config::load())))
        .invoke_handler(tauri::generate_handler![
            quit_app,
            config::get_config,
            config::save_config,
            dock_window::set_dock_layout,
            dock_window::set_hit_rect,
            dock_window::dock_visible,
            dock_window::set_dock_hover,
            windows_list::get_windows,
            windows_list::toggle_app_windows,
            windows_list::activate_window,
            windows_list::close_windows,
            apps::list_installed_apps,
            apps::launch_app,
            apps::resolve_app_path,
            icons::get_icon,
            media::media_state,
            media::media_thumbnail,
            media::media_control,
            system::system_status,
            system::get_volume,
            system::set_volume,
            system::open_shell,
            github::github_fetch,
            github::github_cached,
            github::github_auth_status,
            github::github_set_token,
            panels::open_panel,
            panels::close_panel,
            panels::open_settings,
            platform::platform_info,
            platform::platform_setup,
        ])
        .setup(|app| {
            // Sem ícone no Dock nem barra de menus: a dock é o app.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            let (hide_taskbar, auto_hide) = {
                let config = app.state::<config::ConfigState>();
                let config = config.0.lock().unwrap();
                (config.hide_taskbar, config.auto_hide.clone())
            };
            dock_window::init_auto_hide(&auto_hide);
            if hide_taskbar {
                taskbar::hide();
            }
            #[cfg(windows)]
            {
                let restart_handle = handle.clone();
                taskbar::start_watchdog(move || dock_window::reregister(&restart_handle));
            }

            if let Some(dock) = app.get_webview_window(dock_window::DOCK_LABEL) {
                dock_window::init(&dock);
            }
            windows_list::start(handle.clone());
            media::start(handle.clone());
            register_shortcuts(&handle);
            // No GNOME (inclusive Wayland) quem registra os atalhos é a extensão.
            #[cfg(target_os = "linux")]
            platform::linux::gnome_shell::set_shortcuts_enabled(true);
            if let Err(e) = build_tray(&handle) {
                eprintln!("falha ao criar o ícone da bandeja: {e}");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o WinDock");

    app.run(|app, event| match event {
        // Fechar a janela de configurações ou um painel não deve encerrar a dock.
        RunEvent::ExitRequested { code: None, api, .. } if app.get_webview_window(dock_window::DOCK_LABEL).is_some() => {
            api.prevent_exit();
        }
        RunEvent::Exit => taskbar::restore(),
        _ => {}
    });
}
