//! Apps no Linux: arquivos `.desktop`, abertos com `gio launch` (que cuida de `%U`, D-Bus
//! activation, Flatpak e notificação de inicialização).

use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use super::app_id;
use crate::config::AppEntry;
use crate::platform::linux::desktop_entry::{self, DesktopEntry};
use crate::util::spawn_detached;

fn entry_to_app(entry: &DesktopEntry) -> AppEntry {
    AppEntry {
        id: app_id(&entry.id),
        name: entry.name.clone(),
        target: entry.path.to_string_lossy().into_owned(),
        exe: entry.executable(),
        aumid: Some(entry.id.clone()),
    }
}

pub fn installed_apps() -> Result<Vec<AppEntry>, String> {
    let mut seen = HashSet::new();
    let mut apps: Vec<AppEntry> = desktop_entry::all()
        .iter()
        .filter(|e| !e.hidden && seen.insert(e.name.to_lowercase()))
        .map(entry_to_app)
        .collect();
    apps.sort_by_key(|a| a.name.to_lowercase());
    Ok(apps)
}

fn is_executable(path: &Path) -> bool {
    path.metadata().map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false)
}

/// Transforma um arquivo arrastado para a dock (.desktop, executável, pasta…) num app fixável.
pub fn resolve_path(path: &str) -> AppEntry {
    let p = Path::new(path);
    if path.ends_with(".desktop") {
        if let Some(entry) = desktop_entry::read_file(p) {
            // O mesmo app já instalado (ex.: arrastado de /usr/share/applications) mantém o id oficial.
            return entry_to_app(&desktop_entry::by_id(&entry.id).unwrap_or(entry));
        }
    }
    if is_executable(p) {
        if let Some(entry) = desktop_entry::all().iter().find(|e| e.executable().as_deref() == Some(path)) {
            return entry_to_app(entry);
        }
    }
    let name = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string());
    AppEntry {
        id: app_id(path),
        name,
        target: path.to_string(),
        exe: is_executable(p).then(|| path.to_string()),
        aumid: None,
    }
}

pub fn launch(target: &str) -> Result<(), String> {
    let path = Path::new(target);
    if target.ends_with(".desktop") {
        // Um .desktop fixado que mudou de lugar (atualização, outra distro) ainda abre pelo id.
        let file = if path.exists() {
            target.to_string()
        } else {
            let id = path.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
            let entry = desktop_entry::by_id(&id).ok_or_else(|| format!("app não encontrado: {id}"))?;
            entry.path.to_string_lossy().into_owned()
        };
        return spawn_detached("gio", &["launch", &file]);
    }
    if is_executable(path) {
        return spawn_detached(path, &[]);
    }
    spawn_detached("xdg-open", &[target])
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "smoke test: depende dos apps instalados"]
    fn lists_installed_apps_and_icons() {
        let apps = super::installed_apps().unwrap();
        println!("{} apps", apps.len());
        for a in apps.iter().take(15) {
            println!("{} | {} | exe={:?} | {:?}", a.name, a.target, a.exe, a.aumid);
        }
        assert!(!apps.is_empty());
        let first = apps.iter().find(|a| a.aumid.is_some()).unwrap();
        let icon = crate::icons::icon_data_url(first.aumid.as_deref().unwrap()).unwrap();
        assert!(icon.starts_with("data:image/"));
    }
}
