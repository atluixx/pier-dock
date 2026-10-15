use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::util::{data_dir, ErrStr};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    /// O que é aberto ao clicar: caminho de .exe/.lnk/pasta ou `shell:AppsFolder\<AUMID>` no
    /// Windows, arquivo .desktop no Linux, bundle .app no macOS.
    pub target: String,
    /// Executável real, usado para casar o app fixado com janelas abertas.
    pub exe: Option<String>,
    /// Identidade do app, também usada para casar janelas: AppUserModelID (apps da Store, PWAs)
    /// no Windows, desktop id (`firefox.desktop`) no Linux, bundle id no macOS.
    pub aumid: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WidgetConfig {
    pub kind: String,
    pub enabled: bool,
    pub size: String,
}

impl Default for WidgetConfig {
    fn default() -> Self {
        Self { kind: String::new(), enabled: true, size: "small".into() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub pinned_apps: Vec<AppEntry>,
    pub widgets: Vec<WidgetConfig>,
    pub theme: String,
    /// Cor de destaque: "coral", "blue", "green", "amber" ou "lilac".
    pub accent: String,
    pub icon_size: u32,
    pub magnification: f32,
    pub show_running_unpinned: bool,
    pub hide_taskbar: bool,
    /// "never", "smart" (esconde quando um app está em foco) ou "always".
    pub auto_hide: String,
    pub github_poll_minutes: u32,
    /// Ordem dos itens na dock: `start`, `app:<id>`, `widget:<kind>` e `divider:<id>`. Vazia em
    /// configs antigas; o frontend completa e limpa a lista.
    pub dock_order: Vec<String>,
    pub show_start_button: bool,
}

fn widget(kind: &str, size: &str) -> WidgetConfig {
    WidgetConfig { kind: kind.into(), enabled: true, size: size.into() }
}

/// O gerenciador de arquivos do sistema, fixado na primeira execução.
fn file_manager() -> AppEntry {
    #[cfg(windows)]
    return AppEntry {
        id: "explorer".into(),
        name: "Explorador de Arquivos".into(),
        target: r"C:\Windows\explorer.exe".into(),
        exe: Some(r"C:\Windows\explorer.exe".into()),
        aumid: Some("Microsoft.Windows.Explorer".into()),
    };
    #[cfg(target_os = "linux")]
    return AppEntry {
        id: "files".into(),
        name: "Arquivos".into(),
        target: "/usr/share/applications/org.gnome.Nautilus.desktop".into(),
        exe: Some("/usr/bin/nautilus".into()),
        aumid: Some("org.gnome.Nautilus.desktop".into()),
    };
    #[cfg(target_os = "macos")]
    return AppEntry {
        id: "finder".into(),
        name: "Finder".into(),
        target: "/System/Library/CoreServices/Finder.app".into(),
        exe: Some("/System/Library/CoreServices/Finder.app".into()),
        aumid: Some("com.apple.finder".into()),
    };
}

impl Default for Config {
    fn default() -> Self {
        Self {
            pinned_apps: vec![file_manager()],
            widgets: vec![
                widget("media", "wide"),
                widget("github-review", "small"),
                widget("github-mine", "small"),
                widget("github-commits", "small"),
                widget("github-contrib", "small"),
                widget("network", "small"),
                widget("volume", "small"),
                widget("battery", "small"),
                widget("clock", "small"),
            ],
            theme: "glass".into(),
            accent: "coral".into(),
            icon_size: 44,
            magnification: 1.6,
            show_running_unpinned: true,
            hide_taskbar: true,
            auto_hide: "smart".into(),
            github_poll_minutes: 3,
            dock_order: Vec::new(),
            show_start_button: true,
        }
    }
}

pub struct ConfigState(pub Mutex<Config>);

fn config_path() -> std::path::PathBuf {
    data_dir().join("config.json")
}

pub fn load() -> Config {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist(config: &Config) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).err_str()?;
    std::fs::write(config_path(), json).err_str()
}

#[tauri::command]
pub fn get_config(state: State<ConfigState>) -> Config {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_config(app: AppHandle, state: State<ConfigState>, config: Config) -> Result<(), String> {
    persist(&config)?;
    let old_hide = {
        let mut guard = state.0.lock().unwrap();
        let old = guard.hide_taskbar;
        *guard = config.clone();
        old
    };
    crate::dock_window::set_auto_hide(&app, &config.auto_hide);
    if old_hide != config.hide_taskbar {
        if config.hide_taskbar {
            crate::taskbar::hide();
        } else {
            crate::taskbar::restore();
        }
    }
    app.emit("config-changed", &config).err_str()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_roundtrip() {
        let config = Config::default();
        let json = serde_json::to_string(&config).unwrap();
        assert_eq!(serde_json::from_str::<Config>(&json).unwrap(), config);
    }

    #[test]
    fn partial_config_fills_defaults() {
        let config: Config = serde_json::from_str(r#"{"theme":"neon"}"#).unwrap();
        assert_eq!(config.theme, "neon");
        assert_eq!(config.icon_size, 44);
        assert_eq!(config.accent, "coral");
        assert!(!config.widgets.is_empty());
        assert!(config.dock_order.is_empty());
        assert!(config.show_start_button);
    }
}
