//! Bandeja no Linux: bateria pelo sysfs, rede pelo NetworkManager (D-Bus), volume pelo `pactl`
//! (PulseAudio ou PipeWire) e menus do GNOME pela extensão.

use std::path::Path;

use super::{Battery, Network, Volume};
use crate::platform::linux::{dbus, gnome_shell};
use crate::util::{run, spawn_detached};

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).map(|s| s.trim().to_string()).unwrap_or_default()
}

pub fn battery() -> Battery {
    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else { return Battery::absent() };
    let supplies: Vec<_> = entries.flatten().map(|e| e.path()).collect();
    // `scope=Device` são baterias de mouse/fone, não do computador.
    let Some(battery) = supplies
        .iter()
        .find(|p| read(&p.join("type")) == "Battery" && read(&p.join("scope")) != "Device" && p.join("capacity").exists())
    else {
        return Battery::absent();
    };
    let on_ac = supplies.iter().any(|p| read(&p.join("type")) == "Mains" && read(&p.join("online")) == "1");
    let status = read(&battery.join("status"));
    Battery {
        present: true,
        percent: read(&battery.join("capacity")).parse::<u8>().unwrap_or(0).min(100),
        charging: on_ac || status == "Charging" || status == "Full",
    }
}

const NM: &str = "org.freedesktop.NetworkManager";
/// NM_CONNECTIVITY_FULL; 2 = portal cativo, 3 = rede local sem internet.
const CONNECTIVITY_FULL: u32 = 4;

pub fn network() -> Network {
    network_from_nm().unwrap_or_else(Network::disconnected)
}

fn network_from_nm() -> Option<Network> {
    let conn = dbus::system()?;
    let nm = dbus::proxy(conn, NM, "/org/freedesktop/NetworkManager", NM)?;
    let connectivity: u32 = nm.get_property("Connectivity").ok()?;
    let primary: zbus::zvariant::OwnedObjectPath = nm.get_property("PrimaryConnection").ok()?;
    if primary.as_str() == "/" {
        return Some(Network::disconnected());
    }
    let active = dbus::proxy(conn, NM, primary.as_str(), "org.freedesktop.NetworkManager.Connection.Active")?;
    let kind: String = active.get_property("Type").unwrap_or_default();
    let name: String = active.get_property("Id").unwrap_or_default();
    let wifi = kind == "802-11-wireless";
    let signal_bars = if wifi { wifi_strength(conn, &active).map(signal_bars) } else { None };
    Some(Network { connected: connectivity > 1, internet: connectivity == CONNECTIVITY_FULL, wifi, signal_bars, name })
}

fn wifi_strength(conn: &zbus::blocking::Connection, active: &zbus::blocking::Proxy) -> Option<u8> {
    let devices: Vec<zbus::zvariant::OwnedObjectPath> = active.get_property("Devices").ok()?;
    let device = dbus::proxy(conn, NM, devices.first()?.as_str(), "org.freedesktop.NetworkManager.Device.Wireless")?;
    let ap: zbus::zvariant::OwnedObjectPath = device.get_property("ActiveAccessPoint").ok()?;
    dbus::proxy(conn, NM, ap.as_str(), "org.freedesktop.NetworkManager.AccessPoint")?.get_property("Strength").ok()
}

/// Intensidade 0–100 → 0–5 barras (a mesma escala do Windows).
fn signal_bars(strength: u8) -> u8 {
    strength.min(100).div_ceil(20)
}

/// Primeiro "NN%" da saída do `pactl get-sink-volume`.
fn parse_volume_percent(output: &str) -> Option<f32> {
    output.split('/').map(str::trim).find_map(|part| part.strip_suffix('%')?.trim().parse::<f32>().ok()).map(|p| p / 100.0)
}

pub fn volume() -> Result<Volume, String> {
    let level = run("pactl", &["get-sink-volume", "@DEFAULT_SINK@"])
        .as_deref()
        .and_then(parse_volume_percent)
        .ok_or("não foi possível ler o volume (pactl)")?;
    let muted = run("pactl", &["get-sink-mute", "@DEFAULT_SINK@"]).is_some_and(|out| out.contains("yes"));
    Ok(Volume { level, muted })
}

pub fn set_volume(level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    if let Some(level) = level {
        let percent = format!("{}%", (level * 100.0).round() as u32);
        run("pactl", &["set-sink-volume", "@DEFAULT_SINK@", &percent]).ok_or("falha ao ajustar o volume")?;
    }
    if let Some(muted) = muted {
        run("pactl", &["set-sink-mute", "@DEFAULT_SINK@", if muted { "1" } else { "0" }]).ok_or("falha ao silenciar")?;
    }
    Ok(())
}

/// Grade de apps, menu de configurações rápidas e calendário/notificações do GNOME. Sem a
/// extensão, só as configurações têm equivalente (o app de Configurações).
pub fn open_shell(kind: &str) {
    match (gnome_shell::shell(), kind) {
        (Some(shell), "start") => drop(shell.show_apps()),
        (Some(shell), "quick-settings") => drop(shell.open_quick_settings()),
        (Some(shell), "notifications") => drop(shell.open_calendar()),
        (None, "quick-settings") => drop(spawn_detached("gnome-control-center", &[])),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pactl_volume() {
        let out = "Volume: front-left: 32768 /  50% / -18,06 dB,   front-right: 32768 /  50% / -18,06 dB\n        balance 0,00\n";
        assert_eq!(parse_volume_percent(out), Some(0.5));
        assert_eq!(parse_volume_percent("Volume: mono: 65536 / 100% / 0,00 dB"), Some(1.0));
        assert_eq!(parse_volume_percent("Failed"), None);
    }

    #[test]
    fn maps_signal_strength_to_bars() {
        assert_eq!(signal_bars(0), 0);
        assert_eq!(signal_bars(1), 1);
        assert_eq!(signal_bars(55), 3);
        assert_eq!(signal_bars(100), 5);
    }
}
