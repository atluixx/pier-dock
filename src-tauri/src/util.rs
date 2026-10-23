use std::path::PathBuf;
use std::sync::OnceLock;

#[cfg(target_os = "linux")]
mod appimage_env;

/// Nome antigo do app, para migrar o que ele deixou (pasta de dados, token, autostart).
pub const LEGACY_NAME: &str = "win-dock";

/// Config, cache de ícones e estado da taskbar: `%APPDATA%\pier`, `~/.config/pier` ou
/// `~/Library/Application Support/pier`. Na primeira execução como Pier, a pasta do WinDock é
/// renomeada, levando a config e o estado da barra nativa (que o `--restore-taskbar` usa).
pub fn data_dir() -> PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let base = dirs::config_dir().unwrap_or_else(|| ".".into());
        let dir = base.join("pier");
        let legacy = base.join(LEGACY_NAME);
        if !dir.exists() && legacy.is_dir() {
            let _ = std::fs::rename(&legacy, &dir);
        }
        let _ = std::fs::create_dir_all(&dir);
        dir
    })
    .clone()
}

/// Inicializa COM (STA) na thread atual. Chamadas repetidas são inofensivas.
#[cfg(windows)]
pub fn com_init() {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
}

/// Pasta do Windows (`%WINDIR%`), para chamar executáveis do sistema por caminho absoluto em vez
/// de deixar a busca do Windows achar um homônimo na pasta do app.
#[cfg(windows)]
pub fn windows_dir() -> String {
    std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into())
}

/// Remove the current AppImage's loader and toolkit paths from a host/relaunch command.
#[cfg(target_os = "linux")]
pub(crate) fn configure_host_command(command: &mut std::process::Command) {
    appimage_env::configure(command);
}

/// Inicia um programa sem esperar por ele e sem deixá-lo como processo zumbi.
#[cfg(unix)]
pub fn spawn_detached(program: impl AsRef<std::ffi::OsStr>, args: &[&str]) -> Result<(), String> {
    use std::process::{Command, Stdio};
    let mut command = Command::new(program);
    #[cfg(target_os = "linux")]
    configure_host_command(&mut command);
    let mut child = command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    std::thread::spawn(move || child.wait());
    Ok(())
}

/// Roda um programa e devolve o stdout se ele terminar com sucesso. Com `LC_ALL=C`, para que a
/// saída que é interpretada não venha traduzida.
#[cfg(unix)]
pub fn run(program: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new(program)
        .args(args)
        .env("LC_ALL", "C")
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
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

#[cfg(windows)]
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
