//! Ícones no Linux: o `Icon=` do .desktop procurado no tema de ícones atual (e nos temas que ele
//! herda, até o `hicolor`). SVGs vão como estão; o WebView os desenha em qualquer tamanho.

use std::path::{Path, PathBuf};

use crate::platform::linux::desktop_entry;

const SIZES: [&str; 10] = ["scalable", "512x512", "256x256", "192x192", "128x128", "96x96", "64x64", "48x48", "32x32", "24x24"];
const CONTEXTS: [&str; 5] = ["apps", "places", "mimetypes", "devices", "categories"];

fn current_theme() -> Option<String> {
    let out = crate::util::run("gsettings", &["get", "org.gnome.desktop.interface", "icon-theme"])?;
    Some(out.trim().trim_matches('\'').to_string()).filter(|t| !t.is_empty())
}

fn icon_bases() -> Vec<PathBuf> {
    let mut bases = Vec::new();
    if let Some(home) = dirs::home_dir() {
        bases.push(home.join(".icons"));
    }
    bases.extend(desktop_entry::data_dirs().into_iter().map(|d| d.join("icons")));
    bases
}

/// O tema atual seguido dos que ele herda (`Inherits=` do index.theme) e do `hicolor`.
fn theme_chain(bases: &[PathBuf]) -> Vec<String> {
    let mut chain: Vec<String> = Vec::new();
    let mut queue = vec![current_theme().unwrap_or_else(|| "Adwaita".into())];
    while let Some(theme) = queue.pop() {
        if chain.contains(&theme) || chain.len() > 8 {
            continue;
        }
        let inherits = bases
            .iter()
            .find_map(|b| std::fs::read_to_string(b.join(&theme).join("index.theme")).ok())
            .and_then(|text| text.lines().find_map(|l| l.strip_prefix("Inherits=").map(str::to_string)));
        chain.push(theme);
        if let Some(parents) = inherits {
            queue.extend(parents.split(',').rev().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()));
        }
    }
    if !chain.iter().any(|t| t == "hicolor") {
        chain.push("hicolor".into());
    }
    chain
}

/// Maior versão de um ícone do tema (ou da pasta pixmaps).
fn find_in_theme(name: &str) -> Option<PathBuf> {
    let bases = icon_bases();
    for theme in theme_chain(&bases) {
        for base in &bases {
            let root = base.join(&theme);
            if !root.is_dir() {
                continue;
            }
            for size in SIZES {
                for context in CONTEXTS {
                    // "48x48/apps" (freedesktop) ou "apps/48" (Breeze e derivados).
                    let short = size.split('x').next().unwrap_or(size);
                    for dir in [root.join(size).join(context), root.join(context).join(short)] {
                        for ext in ["svg", "png"] {
                            let candidate = dir.join(format!("{name}.{ext}"));
                            if candidate.is_file() {
                                return Some(candidate);
                            }
                        }
                    }
                }
            }
        }
    }
    ["svg", "png"].iter().map(|ext| PathBuf::from(format!("/usr/share/pixmaps/{name}.{ext}"))).find(|p| p.is_file())
}

fn read_icon(path: &Path) -> Result<(Vec<u8>, &'static str), String> {
    let mime = match path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        _ => return Err(format!("formato de ícone não suportado: {}", path.display())),
    };
    std::fs::read(path).map(|b| (b, mime)).map_err(|e| e.to_string())
}

/// Nome (ou caminho) do ícone para a chave: desktop id, arquivo .desktop, executável ou pasta.
fn icon_name(key: &str) -> Option<String> {
    let path = Path::new(key);
    let entry = if key.ends_with(".desktop") {
        if path.is_absolute() { desktop_entry::read_file(path) } else { desktop_entry::by_id(key) }
    } else if path.is_dir() {
        return Some("folder".into());
    } else if path.is_absolute() {
        let found = desktop_entry::all().iter().find(|e| e.executable().as_deref() == Some(key)).cloned();
        if found.is_none() {
            return Some("application-x-executable".into());
        }
        found
    } else {
        None
    };
    entry.and_then(|e| e.icon)
}

pub fn extract(key: &str) -> Result<(Vec<u8>, &'static str), String> {
    let name = icon_name(key).ok_or_else(|| format!("sem ícone para {key}"))?;
    let path = if name.starts_with('/') {
        PathBuf::from(&name)
    } else {
        find_in_theme(&name)
            .or_else(|| find_in_theme("application-x-executable"))
            .ok_or_else(|| format!("ícone {name} não encontrado no tema"))?
    };
    read_icon(&path)
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "smoke test: depende do tema de ícones instalado"]
    fn finds_theme_icons() {
        for name in ["folder", "org.gnome.Nautilus", "firefox"] {
            println!("{name}: {:?}", super::find_in_theme(name));
        }
        assert!(super::find_in_theme("folder").is_some());
    }
}
