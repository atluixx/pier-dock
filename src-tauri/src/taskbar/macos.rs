//! Dock do macOS. Não dá para removê-lo, então ele vai para "ocultar automaticamente" com um
//! atraso enorme para reaparecer (`autohide-delay`), o que na prática o esconde. Os valores
//! originais ficam salvos em disco, para que um crash ou `--restore-taskbar` consigam devolvê-los.

use serde::{Deserialize, Serialize};

use crate::util::{data_dir, run};

const DOMAIN: &str = "com.apple.dock";

/// Valores originais; `None` quando a chave não existia (o padrão do sistema).
#[derive(Serialize, Deserialize)]
struct SavedState {
    autohide: Option<String>,
    autohide_delay: Option<String>,
}

fn state_path() -> std::path::PathBuf {
    data_dir().join("taskbar-state.json")
}

fn read_default(key: &str) -> Option<String> {
    run("/usr/bin/defaults", &["read", DOMAIN, key]).map(|v| v.trim().to_string())
}

fn write_default(key: &str, kind: &str, value: &str) {
    let _ = run("/usr/bin/defaults", &["write", DOMAIN, key, kind, value]);
}

fn restore_default(key: &str, kind: &str, value: Option<&str>) {
    match value {
        Some(value) => write_default(key, kind, value),
        None => drop(run("/usr/bin/defaults", &["delete", DOMAIN, key])),
    }
}

/// O Dock só relê as preferências ao reiniciar.
fn restart_dock() {
    let _ = run("/usr/bin/killall", &["Dock"]);
}

/// Atraso que esconde o Dock na prática; nunca é um valor original do usuário.
const HIDDEN_DELAY: &str = "1000";

pub fn hide() {
    let path = state_path();
    // Se já existe, é de uma execução que não chegou a restaurar: os valores ali são os originais.
    if !path.exists() {
        let delay = read_default("autohide-delay");
        // Com o atraso de esconder, o Dock já está escondido por uma execução que perdeu o próprio
        // estado: os originais são desconhecidos, e restaurar o padrão do sistema é melhor do que
        // deixar o Dock escondido para sempre.
        let saved = if delay.as_deref() == Some(HIDDEN_DELAY) {
            SavedState { autohide: None, autohide_delay: None }
        } else {
            SavedState { autohide: read_default("autohide"), autohide_delay: delay }
        };
        let Ok(json) = serde_json::to_string(&saved) else { return };
        if std::fs::write(&path, json).is_err() {
            return;
        }
    }
    write_default("autohide", "-bool", "true");
    write_default("autohide-delay", "-float", HIDDEN_DELAY);
    restart_dock();
}

pub fn restore() {
    let path = state_path();
    let Some(saved) = std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str::<SavedState>(&s).ok())
    else {
        return;
    };
    // `defaults read` devolve booleanos como 1/0.
    let autohide = saved.autohide.map(|v| if v == "1" { "true".to_string() } else { "false".to_string() });
    restore_default("autohide", "-bool", autohide.as_deref());
    restore_default("autohide-delay", "-float", saved.autohide_delay.as_deref());
    restart_dock();
    let _ = std::fs::remove_file(path);
}

pub fn install_signal_guard() {
    crate::platform::on_terminate(restore);
}
