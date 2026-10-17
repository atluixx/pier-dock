//! Idioma da interface: português ou inglês. A config guarda "system", "pt" ou "en"; "system" segue
//! o idioma do sistema (português se começar com `pt`, inglês para todo o resto).

use tauri::menu::MenuItem;
use tauri::{AppHandle, Manager, Wry};

use crate::config::ConfigState;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Lang {
    Pt,
    En,
}

impl Lang {
    pub fn t(self, pt: &'static str, en: &'static str) -> &'static str {
        match self {
            Lang::Pt => pt,
            Lang::En => en,
        }
    }

    pub fn code(self) -> &'static str {
        self.t("pt", "en")
    }
}

fn from_locale(locale: &str) -> Lang {
    if locale.to_lowercase().starts_with("pt") {
        Lang::Pt
    } else {
        Lang::En
    }
}

pub fn system() -> Lang {
    sys_locale::get_locale().map(|l| from_locale(&l)).unwrap_or(Lang::En)
}

pub fn resolve(setting: &str) -> Lang {
    match setting {
        "pt" => Lang::Pt,
        "en" => Lang::En,
        _ => system(),
    }
}

pub fn current(app: &AppHandle) -> Lang {
    resolve(&app.state::<ConfigState>().0.lock().unwrap().language)
}

#[tauri::command]
pub fn system_language() -> &'static str {
    system().code()
}

/// Itens fixos do menu da bandeja, guardados para trocar o texto quando o idioma muda.
pub struct TrayItems {
    pub settings: MenuItem<Wry>,
    pub reload: MenuItem<Wry>,
    pub quit: MenuItem<Wry>,
}

pub fn settings_title(lang: Lang) -> &'static str {
    lang.t("Pier — Configurações", "Pier — Settings")
}

pub fn tray_labels(lang: Lang) -> [&'static str; 3] {
    let quit = if cfg!(windows) { lang.t("Restaurar taskbar e sair", "Restore taskbar and quit") } else { lang.t("Sair", "Quit") };
    [lang.t("Configurações", "Settings"), lang.t("Recarregar dock", "Reload dock"), quit]
}

/// Reaplica o idioma no que o Rust desenha: menu da bandeja e título da janela de configurações.
pub fn apply(app: &AppHandle) {
    let lang = current(app);
    if let Some(items) = app.try_state::<TrayItems>() {
        let [settings, reload, quit] = tray_labels(lang);
        let _ = items.settings.set_text(settings);
        let _ = items.reload.set_text(reload);
        let _ = items.quit.set_text(quit);
    }
    crate::updater::relabel(app);
    if let Some(window) = app.get_webview_window(crate::panels::SETTINGS_LABEL) {
        let _ = window.set_title(settings_title(lang));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_mapping() {
        assert_eq!(from_locale("pt-BR"), Lang::Pt);
        assert_eq!(from_locale("pt_PT"), Lang::Pt);
        assert_eq!(from_locale("en-US"), Lang::En);
        assert_eq!(from_locale("es-ES"), Lang::En);
        assert_eq!(resolve("pt"), Lang::Pt);
        assert_eq!(resolve("en"), Lang::En);
    }
}
