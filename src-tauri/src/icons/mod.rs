//! Ícones em alta resolução de apps, arquivos e pastas, devolvidos como data URL e cacheados em
//! disco. Cada sistema tem um backend com `extract(key) -> (bytes, mime)`; a chave é o que o
//! frontend sabe do app (caminho, `shell:AppsFolder\…`, desktop id, bundle .app).

#[cfg_attr(target_os = "windows", path = "win32.rs")]
#[cfg_attr(target_os = "linux", path = "linux.rs")]
#[cfg_attr(target_os = "macos", path = "macos.rs")]
mod backend;

use std::hash::{Hash, Hasher};

use base64::Engine;

use crate::util::{data_dir, reject_network_path, ErrStr};

/// Formatos que o cache guarda, pela extensão do arquivo.
const FORMATS: [(&str, &str); 2] = [("png", "image/png"), ("svg", "image/svg+xml")];

fn cache_path(key: &str, ext: &str) -> std::path::PathBuf {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    key.to_lowercase().hash(&mut hasher);
    let dir = data_dir().join("icons");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(format!("{:016x}.{ext}", hasher.finish()))
}

pub fn icon_data_url(key: &str) -> Result<String, String> {
    reject_network_path(key)?;
    let cached = FORMATS.iter().find_map(|(ext, mime)| std::fs::read(cache_path(key, ext)).ok().map(|b| (b, *mime)));
    let (bytes, mime) = match cached {
        Some(hit) => hit,
        None => {
            let (bytes, mime) = backend::extract(key)?;
            if let Some((ext, _)) = FORMATS.iter().find(|(_, m)| *m == mime) {
                let _ = std::fs::write(cache_path(key, ext), &bytes);
            }
            (bytes, mime)
        }
    };
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub async fn get_icon(key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || icon_data_url(&key)).await.err_str()?
}
