//! Itens de "bandeja": bateria, rede, volume e atalhos para os menus nativos do sistema (Menu
//! Iniciar / grade de apps, configurações rápidas, notificações). Cada sistema tem um backend com
//! `battery`, `network`, `volume`, `set_volume` e `open_shell`.

#[cfg_attr(target_os = "windows", path = "win32.rs")]
#[cfg_attr(target_os = "linux", path = "linux.rs")]
#[cfg_attr(target_os = "macos", path = "macos.rs")]
mod backend;

use serde::Serialize;

use crate::util::ErrStr;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub present: bool,
    pub percent: u8,
    pub charging: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub connected: bool,
    pub internet: bool,
    pub wifi: bool,
    pub signal_bars: Option<u8>,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub battery: Battery,
    pub network: Network,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub level: f32,
    pub muted: bool,
}

impl Battery {
    fn absent() -> Self {
        Battery { present: false, percent: 0, charging: false }
    }
}

impl Network {
    fn disconnected() -> Self {
        Network { connected: false, internet: false, wifi: false, signal_bars: None, name: String::new() }
    }
}

#[tauri::command]
pub async fn system_status() -> Result<SystemStatus, String> {
    tauri::async_runtime::spawn_blocking(|| SystemStatus { battery: backend::battery(), network: backend::network() })
        .await
        .err_str()
}

#[tauri::command]
pub async fn get_volume() -> Result<Volume, String> {
    tauri::async_runtime::spawn_blocking(backend::volume).await.err_str()?
}

#[tauri::command]
pub async fn set_volume(level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || backend::set_volume(level.map(|l| l.clamp(0.0, 1.0)), muted))
        .await
        .err_str()?
}

/// Abre os menus e apps nativos: `start`, `quick-settings`, `notifications`, `system-monitor` e
/// `calendar`.
#[tauri::command]
pub fn open_shell(kind: String) {
    backend::open_shell(&kind);
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "smoke test: lê o estado real do sistema"]
    fn reads_system_status() {
        println!("{:?}", super::backend::battery());
        println!("{:?}", super::backend::network());
        println!("{:?}", super::backend::volume());
    }
}
