//! Layouts de teclado instalados e o ativo, para o widget que troca entre eles. Cada sistema tem
//! um backend com `layouts` e `set_layout`; só o Windows implementa de fato.

use serde::Serialize;

use crate::util::ErrStr;

#[cfg_attr(target_os = "windows", path = "win32.rs")]
#[cfg_attr(target_os = "linux", path = "linux.rs")]
#[cfg_attr(target_os = "macos", path = "macos.rs")]
mod backend;

#[derive(Serialize, Clone, Debug)]
#[cfg_attr(not(windows), allow(dead_code))]
#[serde(rename_all = "camelCase")]
pub struct KeyboardLayout {
    /// Identificador opaco do layout (o HKL no Windows).
    pub id: String,
    /// Código curto do idioma, como a taskbar mostra: "ENG", "POR".
    pub code: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardLayouts {
    pub layouts: Vec<KeyboardLayout>,
    pub active: Option<String>,
}

#[tauri::command]
pub async fn keyboard_layouts() -> Result<KeyboardLayouts, String> {
    tauri::async_runtime::spawn_blocking(backend::layouts).await.err_str()
}

#[tauri::command]
pub async fn set_keyboard_layout(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || backend::set_layout(&id)).await.err_str()?
}
