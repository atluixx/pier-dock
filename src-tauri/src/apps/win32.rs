//! Apps no Windows: shell:AppsFolder (a lista do Menu Iniciar), atalhos .lnk e ShellExecute.

use std::collections::HashSet;
use std::path::Path;

use windows::core::{Interface, GUID, HSTRING, PCWSTR};
use windows::Win32::Storage::EnhancedStorage::{PKEY_AppUserModel_ID, PKEY_Link_TargetParsingPath};
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ};
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, IShellItem2, IShellLinkW, SHGetKnownFolderItem,
    SHGetKnownFolderPath, ShellExecuteW, ShellLink, KF_FLAG_DEFAULT, SIGDN_NORMALDISPLAY, SIGDN_PARENTRELATIVEPARSING,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use super::app_id;
use crate::config::AppEntry;
use crate::util::{com_init, wide_to_string, windows_dir, ErrStr};

/// `{GUID}\resto\do\caminho` (formato usado pelo AppsFolder) → caminho real.
fn resolve_known_folder(parsing: &str) -> Option<String> {
    let rest = parsing.strip_prefix('{')?;
    let (guid, tail) = rest.split_once('}')?;
    let guid = GUID::try_from(guid).ok()?;
    unsafe {
        let base = SHGetKnownFolderPath(&guid, KF_FLAG_DEFAULT, None).ok()?;
        let path = base.to_string().ok();
        CoTaskMemFree(Some(base.0 as *const _));
        Some(format!("{}{}", path?, tail))
    }
}

fn exe_from_parsing(parsing: &str) -> Option<String> {
    let path = if parsing.starts_with('{') { resolve_known_folder(parsing)? } else { parsing.to_string() };
    path.to_lowercase().ends_with(".exe").then_some(path)
}

/// Apps do sistema cujo item no AppsFolder não aponta para um exe, mas cujas janelas também não
/// publicam AUMID — sem isto, fixar o Explorador pela lista nunca casaria com as janelas dele.
fn known_exe(aumid: &str) -> Option<String> {
    match aumid {
        "Microsoft.Windows.Explorer" => Some(format!(r"{}\explorer.exe", windows_dir())),
        _ => None,
    }
}

unsafe fn display_name(item: &IShellItem, kind: windows::Win32::UI::Shell::SIGDN) -> Option<String> {
    let name = item.GetDisplayName(kind).ok()?;
    let s = name.to_string().ok();
    CoTaskMemFree(Some(name.0 as *const _));
    s
}

/// Lista o shell:AppsFolder — inclui apps Win32 (via atalhos do Menu Iniciar), apps da Store e PWAs.
pub fn installed_apps() -> windows::core::Result<Vec<AppEntry>> {
    com_init();
    let mut apps = Vec::new();
    let mut seen = HashSet::new();
    unsafe {
        let folder: IShellItem = SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)?;
        let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems)?;
        loop {
            let mut batch = [None];
            let mut fetched = 0u32;
            if items.Next(&mut batch, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            let Some(item) = batch[0].take() else { break };
            let (Some(name), Some(parsing)) = (display_name(&item, SIGDN_NORMALDISPLAY), display_name(&item, SIGDN_PARENTRELATIVEPARSING))
            else {
                continue;
            };
            let lower = name.to_lowercase();
            // Atalhos para documentos (ajuda .chm, leia-me, sites) não são apps.
            let parsing_lower = parsing.to_lowercase();
            let is_document = [".chm", ".txt", ".html", ".htm", ".pdf", ".url", ".rtf", ".md"]
                .iter()
                .any(|ext| parsing_lower.ends_with(ext));
            if is_document || lower.contains("uninstall") || lower.contains("desinstalar") || !seen.insert(lower) {
                continue;
            }
            let link_target = item
                .cast::<IShellItem2>()
                .ok()
                .and_then(|i2| i2.GetString(&PKEY_Link_TargetParsingPath).ok())
                .and_then(|p| {
                    let s = p.to_string().ok();
                    CoTaskMemFree(Some(p.0 as *const _));
                    s
                });
            let exe = link_target
                .as_deref()
                .and_then(exe_from_parsing)
                .or_else(|| exe_from_parsing(&parsing))
                .or_else(|| known_exe(&parsing));
            apps.push(AppEntry {
                id: app_id(&parsing),
                name,
                target: format!("shell:AppsFolder\\{parsing}"),
                exe,
                aumid: Some(parsing),
            });
        }
    }
    apps.sort_by_key(|a| a.name.to_lowercase());
    Ok(apps)
}

/// Lê o destino e o AUMID de um atalho .lnk.
fn resolve_lnk(path: &str) -> (Option<String>, Option<String>) {
    unsafe {
        let Ok(link) = CoCreateInstance::<_, IShellLinkW>(&ShellLink, None, CLSCTX_INPROC_SERVER) else { return (None, None) };
        let Ok(file) = link.cast::<IPersistFile>() else { return (None, None) };
        if file.Load(&HSTRING::from(path), STGM_READ).is_err() {
            return (None, None);
        }
        let mut buf = [0u16; 1024];
        let target = link
            .GetPath(&mut buf, std::ptr::null_mut(), 0)
            .ok()
            .map(|_| wide_to_string(&buf))
            .filter(|s| !s.is_empty());
        let aumid = link.cast::<IPropertyStore>().ok().and_then(|store| {
            let value = store.GetValue(&PKEY_AppUserModel_ID).ok()?;
            let pwstr = PropVariantToStringAlloc(&value).ok()?;
            let s = pwstr.to_string().ok();
            CoTaskMemFree(Some(pwstr.0 as *const _));
            s.filter(|s| !s.is_empty())
        });
        (target, aumid)
    }
}

/// Transforma um arquivo arrastado para a dock (.exe, .lnk, pasta…) num app fixável.
pub fn resolve_path(path: &str) -> AppEntry {
    com_init();
    let p = Path::new(path);
    let name = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| path.to_string());
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let (exe, aumid) = match ext.as_str() {
        "lnk" => resolve_lnk(path),
        "exe" => (Some(path.to_string()), None),
        _ => (None, None),
    };
    AppEntry { id: app_id(path), name, target: path.to_string(), exe, aumid }
}

pub fn launch(target: &str) -> Result<(), String> {
    com_init();
    if target.starts_with("shell:") {
        // Caminho absoluto: um `explorer.exe` na pasta do app não pode ser executado no lugar.
        return std::process::Command::new(format!(r"{}\explorer.exe", windows_dir()))
            .arg(target)
            .spawn()
            .map(|_| ())
            .err_str();
    }
    let result = unsafe {
        ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(target), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL)
    };
    // ShellExecute devolve um "HINSTANCE" > 32 em caso de sucesso.
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err(format!("não foi possível abrir {target}"))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "smoke test: depende dos apps instalados"]
    fn lists_installed_apps_and_icons() {
        let apps = super::installed_apps().unwrap();
        println!("{} apps", apps.len());
        for a in apps.iter().filter(|a| a.name.contains("YouTube") || a.name.contains("Chrome") || a.name.contains("Explorador")) {
            println!("{} | {} | exe={:?}", a.name, a.target, a.exe);
        }
        assert!(!apps.is_empty());
        let calc = apps.iter().find(|a| a.target.contains("Calculator")).expect("Calculadora");
        let icon = crate::icons::icon_data_url(&calc.target).unwrap();
        assert!(icon.starts_with("data:image/png;base64,"));
        let exe_icon = crate::icons::icon_data_url(r"C:\Windows\explorer.exe").unwrap();
        println!("ícones ok: {} / {} bytes", icon.len(), exe_icon.len());
        let lnk = super::resolve_path(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Google Chrome.lnk");
        println!("lnk: {:?}", lnk);
        assert!(lnk.exe.unwrap().to_lowercase().ends_with("chrome.exe"));
    }
}
