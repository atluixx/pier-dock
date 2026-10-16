//! Linux. No GNOME (Wayland ou X11) a extensão `pier@pier.dev` dá acesso às janelas; nas
//! outras DEs, só sessões X11 funcionam (EWMH). A janela da dock roda sempre via X11/XWayland,
//! porque um cliente Wayland comum não pode se posicionar na tela.

pub mod dbus;
pub mod desktop_entry;
pub mod gnome_shell;
pub mod x11;

use super::PlatformInfo;

fn env_is(name: &str, value: &str) -> bool {
    std::env::var(name).map(|v| v.eq_ignore_ascii_case(value)).unwrap_or(false)
}

pub fn is_wayland() -> bool {
    env_is("XDG_SESSION_TYPE", "wayland")
}

pub fn is_gnome() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP").map(|d| d.split(':').any(|p| p.eq_ignore_ascii_case("gnome"))).unwrap_or(false)
}

/// Sessão X11 de verdade: só nela o EWMH enxerga as janelas de todos os apps.
pub fn is_x11_session() -> bool {
    !is_wayland() && std::env::var_os("DISPLAY").is_some()
}

/// Tem que rodar antes do GTK iniciar: no Wayland a dock e os painéis vão para o XWayland, onde
/// podem escolher a própria posição e ficar acima das outras janelas.
pub fn prepare_env() {
    if is_wayland() && std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

pub fn info() -> PlatformInfo {
    let extension = gnome_shell::available();
    let window_list = if extension || is_x11_session() {
        "ok"
    } else if is_gnome() && gnome_shell::extension_installed() {
        "needs-relogin"
    } else if is_gnome() {
        "needs-extension"
    } else {
        "unsupported"
    };
    PlatformInfo {
        os: "linux",
        window_list,
        hide_native: extension,
        shortcuts: extension || is_x11_session(),
        glass: crate::backdrop::supported(),
    }
}
