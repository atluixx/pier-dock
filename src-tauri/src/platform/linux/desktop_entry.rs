//! Arquivos `.desktop` (a lista de apps do sistema), seguindo a especificação do freedesktop:
//! pastas `applications/` de `$XDG_DATA_HOME` e `$XDG_DATA_DIRS`, ids com `/` virando `-`, e o
//! primeiro arquivo com um id vence.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct DesktopEntry {
    /// `org.gnome.Nautilus.desktop`
    pub id: String,
    pub path: PathBuf,
    pub name: String,
    pub exec: Option<String>,
    pub icon: Option<String>,
    pub wm_class: Option<String>,
    /// Apps que não devem aparecer em menus (`NoDisplay`, `Hidden`, `OnlyShowIn`/`NotShowIn`,
    /// tipo diferente de `Application`).
    pub hidden: bool,
}

impl DesktopEntry {
    /// Executável do `Exec=`, com caminho absoluto quando ele está no PATH.
    pub fn executable(&self) -> Option<String> {
        let exec = self.exec.as_deref()?;
        let program = exec_program(exec)?;
        if program.starts_with('/') {
            return Some(program);
        }
        std::env::var_os("PATH")
            .and_then(|paths| std::env::split_paths(&paths).map(|p| p.join(&program)).find(|p| p.is_file()))
            .map(|p| p.to_string_lossy().into_owned())
            .or(Some(program))
    }
}

/// Primeira palavra do `Exec=`, pulando `env VAR=valor` e respeitando aspas.
fn exec_program(exec: &str) -> Option<String> {
    let mut words = Vec::new();
    let mut rest = exec.trim();
    while !rest.is_empty() && words.len() < 16 {
        let (word, tail) = match rest.strip_prefix('"') {
            Some(quoted) => quoted.split_once('"').unwrap_or((quoted, "")),
            None => rest.split_once(char::is_whitespace).unwrap_or((rest, "")),
        };
        words.push(word);
        rest = tail.trim_start();
    }
    let mut words = words.into_iter();
    let mut word = words.next()?;
    if word == "env" || word.ends_with("/env") {
        word = words.find(|w| !w.contains('=') && !w.starts_with('-'))?;
    }
    Some(word.to_string())
}

pub fn data_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::data_dir() {
        dirs.push(home);
    }
    let system = std::env::var("XDG_DATA_DIRS").unwrap_or_default();
    let system = if system.is_empty() { "/usr/local/share:/usr/share".to_string() } else { system };
    dirs.extend(system.split(':').filter(|s| !s.is_empty()).map(PathBuf::from));
    // Apps Flatpak, caso a sessão não tenha posto as pastas de export no XDG_DATA_DIRS.
    if let Some(home) = dirs::data_dir() {
        dirs.push(home.join("flatpak/exports/share"));
    }
    dirs.push("/var/lib/flatpak/exports/share".into());
    let mut seen = HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    dirs
}

fn current_desktops() -> Vec<String> {
    std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().split(':').map(|s| s.to_lowercase()).collect()
}

fn locales() -> Vec<String> {
    let raw = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
        .unwrap_or_default();
    let base = raw.split(['.', '@']).next().unwrap_or("").to_string();
    let mut list = Vec::new();
    if !base.is_empty() && base != "C" && base != "POSIX" {
        list.push(base.clone());
        if let Some((lang, _)) = base.split_once('_') {
            list.push(lang.to_string());
        }
    }
    list
}

/// Lê o grupo `[Desktop Entry]`. `id` é o desktop id que o arquivo terá.
pub fn parse(id: &str, path: &Path, text: &str, locales: &[String], desktops: &[String]) -> Option<DesktopEntry> {
    let mut in_group = false;
    let mut entry = DesktopEntry { id: id.to_string(), path: path.to_path_buf(), ..Default::default() };
    // (prioridade, nome): 0 = nome localizado mais específico.
    let mut name: Option<(usize, String)> = None;
    let mut kind = None;
    let mut only_show_in: Option<Vec<String>> = None;
    let mut not_show_in: Vec<String> = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            if in_group {
                break;
            }
            in_group = line == "[Desktop Entry]";
            continue;
        }
        if !in_group || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else { continue };
        let (key, value) = (key.trim(), value.trim().to_string());
        let list = |v: &str| v.split(';').filter(|s| !s.is_empty()).map(|s| s.to_lowercase()).collect::<Vec<_>>();
        match key {
            "Type" => kind = Some(value),
            "Name" => {
                if name.is_none() {
                    name = Some((locales.len(), value));
                }
            }
            "Exec" => entry.exec = Some(value),
            "Icon" => entry.icon = Some(value),
            "StartupWMClass" => entry.wm_class = Some(value),
            "NoDisplay" | "Hidden" if value == "true" => entry.hidden = true,
            "OnlyShowIn" => only_show_in = Some(list(&value)),
            "NotShowIn" => not_show_in = list(&value),
            _ => {
                if let Some(locale) = key.strip_prefix("Name[").and_then(|k| k.strip_suffix(']')) {
                    if let Some(rank) = locales.iter().position(|l| l == locale) {
                        if name.as_ref().map(|(r, _)| rank < *r).unwrap_or(true) {
                            name = Some((rank, value));
                        }
                    }
                }
            }
        }
    }
    if !in_group && kind.is_none() {
        return None;
    }
    entry.name = name.map(|(_, n)| n).filter(|n| !n.is_empty())?;
    let shown_here = only_show_in.map(|only| only.iter().any(|d| desktops.contains(d))).unwrap_or(true)
        && !not_show_in.iter().any(|d| desktops.contains(d));
    entry.hidden |= kind.as_deref() != Some("Application") || !shown_here;
    Some(entry)
}

fn collect(dir: &Path, prefix: &str, out: &mut Vec<(String, PathBuf)>) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    for item in read.flatten() {
        let path = item.path();
        let file_name = item.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            collect(&path, &format!("{prefix}{file_name}-"), out);
        } else if file_name.ends_with(".desktop") {
            out.push((format!("{prefix}{file_name}"), path));
        }
    }
}

fn scan() -> Vec<DesktopEntry> {
    let (locales, desktops) = (locales(), current_desktops());
    let mut seen = HashSet::new();
    let mut entries = Vec::new();
    for dir in data_dirs() {
        let mut files = Vec::new();
        collect(&dir.join("applications"), "", &mut files);
        for (id, path) in files {
            if !seen.insert(id.clone()) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            if let Some(entry) = parse(&id, &path, &text, &locales, &desktops) {
                entries.push(entry);
            }
        }
    }
    entries
}

/// Todas as entradas (inclusive as escondidas), com cache curto: janelas e ícones consultam isto
/// o tempo todo, e apps instalados aparecem em até 30s.
pub fn all() -> Arc<Vec<DesktopEntry>> {
    static CACHE: Mutex<Option<(Instant, Arc<Vec<DesktopEntry>>)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, entries)) = cache.as_ref() {
        if at.elapsed() < Duration::from_secs(30) {
            return entries.clone();
        }
    }
    let entries = Arc::new(scan());
    *cache = Some((Instant::now(), entries.clone()));
    entries
}

pub fn by_id(id: &str) -> Option<DesktopEntry> {
    all().iter().find(|e| e.id == id).cloned()
}

pub fn read_file(path: &Path) -> Option<DesktopEntry> {
    let text = std::fs::read_to_string(path).ok()?;
    let id = path.file_name()?.to_string_lossy().into_owned();
    parse(&id, path, &text, &locales(), &current_desktops())
}

/// App de uma janela X11 pelo `WM_CLASS`: `StartupWMClass`, depois o nome do arquivo
/// (`firefox` → `firefox.desktop`, `org.gnome.Nautilus`), depois o executável.
pub fn by_wm_class(class: &str) -> Option<DesktopEntry> {
    let lower = class.to_lowercase();
    let entries = all();
    entries
        .iter()
        .find(|e| e.wm_class.as_deref().is_some_and(|c| c.eq_ignore_ascii_case(class)))
        .or_else(|| entries.iter().find(|e| e.id.trim_end_matches(".desktop").to_lowercase() == lower))
        .or_else(|| {
            entries.iter().find(|e| {
                e.id.trim_end_matches(".desktop").rsplit('.').next().is_some_and(|last| last.to_lowercase() == lower)
            })
        })
        .or_else(|| {
            entries.iter().find(|e| {
                e.exec.as_deref().and_then(exec_program).is_some_and(|p| p.rsplit('/').next().unwrap_or("").to_lowercase() == lower)
            })
        })
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FILE: &str = "[Desktop Entry]\nType=Application\nName=Files\nName[pt]=Arquivos (pt)\nName[pt_BR]=Arquivos\n\
        Exec=env GDK_BACKEND=x11 nautilus --new-window %U\nIcon=org.gnome.Nautilus\nStartupWMClass=org.gnome.Nautilus\n\
        OnlyShowIn=GNOME;Unity;\n\n[Desktop Action new-window]\nName=New Window\nExec=nautilus --new-window\n";

    fn locales() -> Vec<String> {
        vec!["pt_BR".into(), "pt".into()]
    }

    #[test]
    fn parses_localized_entry() {
        let e = parse("org.gnome.Nautilus.desktop", Path::new("/x"), FILE, &locales(), &["gnome".into()]).unwrap();
        assert_eq!(e.name, "Arquivos");
        assert_eq!(e.icon.as_deref(), Some("org.gnome.Nautilus"));
        assert_eq!(e.exec.as_deref().and_then(exec_program).as_deref(), Some("nautilus"));
        assert!(!e.hidden);
        // As ações não sobrescrevem o grupo principal.
        assert!(e.exec.unwrap().starts_with("env"));
    }

    #[test]
    fn respects_show_in_and_no_display() {
        let kde = parse("a.desktop", Path::new("/x"), FILE, &[], &["kde".into()]).unwrap();
        assert!(kde.hidden);
        assert_eq!(kde.name, "Files");
        let hidden = parse("b.desktop", Path::new("/x"), "[Desktop Entry]\nType=Application\nName=B\nNoDisplay=true\n", &[], &[]).unwrap();
        assert!(hidden.hidden);
        let link = parse("c.desktop", Path::new("/x"), "[Desktop Entry]\nType=Link\nName=C\n", &[], &[]).unwrap();
        assert!(link.hidden);
    }

    #[test]
    fn exec_program_handles_quotes() {
        assert_eq!(exec_program("\"/opt/My App/app\" %F").as_deref(), Some("/opt/My App/app"));
        assert_eq!(exec_program("/usr/bin/code --unity-launch %F").as_deref(), Some("/usr/bin/code"));
    }
}
