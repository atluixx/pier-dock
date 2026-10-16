//! GNOME: a extensão esconde o Dash (e o Dash to Dock / Ubuntu Dock). Ela mesma desfaz isso quando
//! o Pier some do session bus, então não há estado em disco nem watchdog.

use crate::platform::linux::gnome_shell;

pub fn hide() {
    gnome_shell::set_hide_native(true);
}

pub fn restore() {
    gnome_shell::set_hide_native(false);
}

pub fn install_signal_guard() {
    crate::platform::on_terminate(restore);
}
