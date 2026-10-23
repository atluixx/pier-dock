//! Popover de volume: saídas de áudio (e qual é a padrão) e o volume de cada app. O volume geral
//! continua em `system::get_volume`/`set_volume`. Cada sistema tem um backend com `outputs`,
//! `set_output`, `apps` e `set_app_volume`.

#[cfg_attr(target_os = "windows", path = "win32.rs")]
#[cfg_attr(target_os = "linux", path = "linux.rs")]
#[cfg_attr(target_os = "macos", path = "macos.rs")]
mod backend;

use serde::Serialize;

use crate::util::ErrStr;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    pub id: String,
    pub name: String,
    pub default: bool,
}

/// Um app tocando áudio. Os streams do mesmo app viram uma linha só, e `id` identifica todos eles.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppStream {
    pub id: String,
    pub name: String,
    /// Chave para o `get_icon` (caminho do executável).
    pub icon: Option<String>,
    pub level: f32,
    pub muted: bool,
    /// The sink used by all grouped streams; None when they use different outputs.
    pub output_id: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    pub outputs: Vec<OutputDevice>,
    /// `None` quando o sistema não deixa mexer no volume de cada app (macOS antes do 14.2).
    pub apps: Option<Vec<AppStream>>,
    /// No macOS, o usuário negou a Gravação de Áudio do Sistema e os volumes dos apps não valem.
    pub apps_need_permission: bool,
    pub can_route_apps: bool,
}

/// No macOS o volume de cada app depende de taps que o Pier mantém e reconcilia em segundo plano.
#[cfg(target_os = "macos")]
pub fn start() {
    backend::start();
}

#[tauri::command]
pub async fn audio_status() -> Result<AudioState, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "linux")]
        return backend::state();
        #[cfg(not(target_os = "linux"))]
        {
        #[cfg(target_os = "macos")]
        let apps_need_permission = backend::apps_need_permission();
        #[cfg(not(target_os = "macos"))]
        let apps_need_permission = false;
        AudioState { outputs: backend::outputs().unwrap_or_default(), apps: backend::apps(), apps_need_permission, can_route_apps: false }
        }
    })
    .await
    .err_str()
}

#[tauri::command]
pub async fn set_output_device(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || backend::set_output(&id)).await.err_str()?
}

#[tauri::command]
pub async fn set_app_volume(id: String, level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || backend::set_app_volume(&id, level.map(|l| l.clamp(0.0, 1.0)), muted))
        .await
        .err_str()?
}

#[tauri::command]
pub async fn set_app_output(id: String, output: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "linux")]
        return backend::set_app_output(&id, &output);
        #[cfg(not(target_os = "linux"))]
        { let _ = (id, output); Err("Per-app output routing is not supported on this platform".into()) }
    }).await.err_str()?
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "smoke test: lê as saídas e os apps do sistema"]
    fn reads_audio_state() {
        println!("{:?}", super::backend::outputs());
        println!("{:?}", super::backend::apps());
    }
}
