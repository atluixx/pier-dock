use std::path::PathBuf;

use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};

/// %APPDATA%\win-dock — config, cache de ícones e estado da taskbar.
pub fn data_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    let dir = PathBuf::from(base).join("win-dock");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Inicializa COM (STA) na thread atual. Chamadas repetidas são inofensivas.
pub fn com_init() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
}

/// Pasta do Windows (`%WINDIR%`), para chamar executáveis do sistema por caminho absoluto em vez
/// de deixar a busca do Windows achar um homônimo na pasta do app.
pub fn windows_dir() -> String {
    std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into())
}

/// Recusa caminhos de rede (`\\servidor\…`, `//servidor/…`, `\\?\UNC\…`). Só de tocar num caminho
/// desses (extrair ícone, resolver atalho) o Windows tenta autenticar no servidor e envia o hash
/// NTLM do usuário.
pub fn reject_network_path(path: &str) -> Result<(), String> {
    let p = path.trim_start();
    let lower = p.to_lowercase();
    if p.starts_with(r"\\") || p.starts_with("//") || lower.starts_with("file:") {
        // Só `\\?\C:\...` (caminho local estendido) passa; `\\?\UNC\`, `\\.\` e o resto podem ir à rede.
        let mut chars = lower.chars().skip(4);
        let local_extended = lower.starts_with(r"\\?\")
            && chars.next().is_some_and(|c| c.is_ascii_alphabetic())
            && chars.next() == Some(':');
        if !local_extended {
            return Err("caminhos de rede não são permitidos".into());
        }
    }
    Ok(())
}

pub fn wide_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

/// Converte erros de qualquer tipo em String, que é o que os comandos Tauri devolvem ao frontend.
pub trait ErrStr<T> {
    fn err_str(self) -> Result<T, String>;
}

impl<T, E: std::fmt::Display> ErrStr<T> for Result<T, E> {
    fn err_str(self) -> Result<T, String> {
        self.map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::reject_network_path;

    #[test]
    fn rejects_network_paths() {
        for path in [r"\\srv\share\app.exe", "//srv/share/x", r"\\?\UNC\srv\x", "file://srv/x", r"  \\srv\x", r"\\.\UNC\srv\x"] {
            assert!(reject_network_path(path).is_err(), "{path}");
        }
        for path in [
            r"C:\Windows\explorer.exe",
            r"\\?\C:\Program Files\x.exe",
            r"shell:AppsFolder\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
            r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Google Chrome.lnk",
        ] {
            assert!(reject_network_path(path).is_ok(), "{path}");
        }
    }
}
