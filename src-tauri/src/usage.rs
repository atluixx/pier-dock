//! Widget de uso do sistema: CPU, memória, disco e rede, com o histórico do último minuto, e os
//! apps que mais usam CPU. Uma thread amostra a cada segundo, mas só enquanto alguém lê: com o
//! widget desligado ela fica parada.

use std::collections::VecDeque;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{Disks, Networks, ProcessesToUpdate, Signal, System};

const HISTORY: usize = 60;
const IDLE_AFTER: Duration = Duration::from_secs(15);
const TOP: usize = 4;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemUsage {
    /// Porcentagens de 0 a 100.
    pub cpu: f32,
    pub mem: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    /// Bytes por segundo.
    pub net_rx: u64,
    pub net_tx: u64,
    pub cpu_history: Vec<f32>,
    pub mem_history: Vec<f32>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppUsage {
    pub name: String,
    /// Porcentagem da CPU inteira (todos os núcleos), como o total do widget.
    pub cpu: f32,
}

struct Shared {
    usage: SystemUsage,
    cpu: VecDeque<f32>,
    mem: VecDeque<f32>,
    top: Vec<AppUsage>,
    last_read: Option<Instant>,
    last_top_read: Option<Instant>,
}

static SHARED: Mutex<Shared> = Mutex::new(Shared {
    usage: SystemUsage {
        cpu: 0.0,
        mem: 0.0,
        mem_used: 0,
        mem_total: 0,
        disk_used: 0,
        disk_total: 0,
        net_rx: 0,
        net_tx: 0,
        cpu_history: Vec::new(),
        mem_history: Vec::new(),
    },
    cpu: VecDeque::new(),
    mem: VecDeque::new(),
    top: Vec::new(),
    last_read: None,
    last_top_read: None,
});

fn recent(at: Option<Instant>) -> bool {
    at.is_some_and(|t| t.elapsed() < IDLE_AFTER)
}

/// Agrupa os processos por app: os helpers do Chrome/Electron e os processos dentro de um .app
/// contam como o app.
pub fn app_name(process_name: &str, exe: Option<&Path>) -> String {
    if let Some(bundle) = exe.and_then(|p| p.components().find_map(|c| c.as_os_str().to_str().and_then(|s| s.strip_suffix(".app")))) {
        return bundle.to_string();
    }
    let name = process_name.trim();
    if name.len() > 4 && name[name.len() - 4..].eq_ignore_ascii_case(".exe") {
        return name[..name.len() - 4].to_string();
    }
    name.to_string()
}

fn top_apps(sys: &System) -> Vec<AppUsage> {
    let cores = sys.cpus().len().max(1) as f32;
    let mut groups: Vec<AppUsage> = Vec::new();
    for process in sys.processes().values() {
        let name = app_name(&process.name().to_string_lossy(), process.exe());
        if name.is_empty() {
            continue;
        }
        let cpu = process.cpu_usage() / cores;
        match groups.iter_mut().find(|g| g.name == name) {
            Some(group) => group.cpu += cpu,
            None => groups.push(AppUsage { name, cpu }),
        }
    }
    groups.sort_by(|a, b| b.cpu.total_cmp(&a.cpu));
    groups.truncate(TOP);
    groups
}

/// O volume em que o sistema está: `C:\` no Windows, o volume de dados no macOS (o `/` é o
/// volume de sistema, só leitura) e a raiz no Linux.
fn system_disk(disks: &Disks) -> Option<(u64, u64)> {
    let target = if cfg!(windows) {
        format!("{}\\", std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()))
    } else if cfg!(target_os = "macos") && Path::new("/System/Volumes/Data").exists() {
        "/System/Volumes/Data".into()
    } else {
        "/".into()
    };
    let disk = disks.list().iter().find(|d| d.mount_point() == Path::new(&target)).or_else(|| disks.list().first())?;
    Some((disk.total_space() - disk.available_space(), disk.total_space()))
}

fn push(history: &mut VecDeque<f32>, value: f32) {
    if history.len() == HISTORY {
        history.pop_front();
    }
    history.push_back(value);
}

pub fn start() {
    std::thread::spawn(|| {
        let mut sys = System::new();
        let mut networks = Networks::new_with_refreshed_list();
        let mut disks = Disks::new_with_refreshed_list();
        let mut last_sample = Instant::now();
        let mut tick = 0u32;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let (active, wants_top) = {
                let shared = SHARED.lock().unwrap();
                (recent(shared.last_read), recent(shared.last_top_read))
            };
            if !active {
                let mut shared = SHARED.lock().unwrap();
                shared.cpu.clear();
                shared.mem.clear();
                continue;
            }

            sys.refresh_cpu_usage();
            sys.refresh_memory();
            networks.refresh(true);
            if tick.is_multiple_of(30) {
                disks.refresh(true);
            }
            tick = tick.wrapping_add(1);
            if wants_top {
                sys.refresh_processes(ProcessesToUpdate::All, true);
            }
            let elapsed = last_sample.elapsed().as_secs_f64().max(0.5);
            last_sample = Instant::now();

            let loopback = |name: &str| name == "lo" || name.starts_with("lo0") || name.contains("Loopback");
            let (rx, tx) = networks
                .iter()
                .filter(|(name, _)| !loopback(name))
                .fold((0u64, 0u64), |(rx, tx), (_, n)| (rx + n.received(), tx + n.transmitted()));
            let (disk_used, disk_total) = system_disk(&disks).unwrap_or_default();
            let mem_total = sys.total_memory();
            let mem_used = sys.used_memory();
            let cpu = sys.global_cpu_usage().clamp(0.0, 100.0);
            let mem = if mem_total > 0 { mem_used as f32 / mem_total as f32 * 100.0 } else { 0.0 };
            let top = if wants_top { top_apps(&sys) } else { Vec::new() };

            let mut shared = SHARED.lock().unwrap();
            push(&mut shared.cpu, cpu);
            push(&mut shared.mem, mem);
            let cpu_history = shared.cpu.iter().copied().collect();
            let mem_history = shared.mem.iter().copied().collect();
            shared.usage = SystemUsage {
                cpu,
                mem,
                mem_used,
                mem_total,
                disk_used,
                disk_total,
                net_rx: (rx as f64 / elapsed) as u64,
                net_tx: (tx as f64 / elapsed) as u64,
                cpu_history,
                mem_history,
            };
            shared.top = top;
        }
    });
}

#[tauri::command]
pub fn system_usage() -> SystemUsage {
    let mut shared = SHARED.lock().unwrap();
    shared.last_read = Some(Instant::now());
    shared.usage.clone()
}

#[tauri::command]
pub fn top_apps_usage() -> Vec<AppUsage> {
    let mut shared = SHARED.lock().unwrap();
    shared.last_read = Some(Instant::now());
    shared.last_top_read = Some(Instant::now());
    shared.top.clone()
}

/// Pede para todos os processos do app terminarem (SIGTERM; no Windows, onde não há sinal,
/// encerra). Nunca encerra o próprio Pier.
#[tauri::command]
pub async fn quit_app_processes(name: String) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let own = sysinfo::get_current_pid().ok();
        let own_name = own.and_then(|pid| sys.process(pid)).map(|p| app_name(&p.name().to_string_lossy(), p.exe()));
        if own_name.as_deref() == Some(name.as_str()) {
            return Err(crate::i18n::tr("o Pier não pode encerrar a si mesmo", "Pier can't quit itself").to_string());
        }
        let mut count = 0;
        for process in sys.processes().values() {
            if Some(process.pid()) == own || app_name(&process.name().to_string_lossy(), process.exe()) != name {
                continue;
            }
            if process.kill_with(Signal::Term).unwrap_or_else(|| process.kill()) {
                count += 1;
            }
        }
        if count == 0 {
            return Err(format!("nenhum processo de {name} foi encerrado"));
        }
        Ok(count)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_processes_by_app() {
        let helper = Path::new("/Applications/Brave Browser.app/Contents/Frameworks/Brave Browser Framework.framework/Helpers/Brave Browser Helper (Renderer).app/Contents/MacOS/Brave Browser Helper (Renderer)");
        assert_eq!(app_name("Brave Browser Helper (Renderer)", Some(helper)), "Brave Browser");
        assert_eq!(app_name("Spotify.exe", Some(Path::new(r"C:\Users\a\AppData\Roaming\Spotify\Spotify.exe"))), "Spotify");
        assert_eq!(app_name("firefox", Some(Path::new("/usr/lib/firefox/firefox"))), "firefox");
        assert_eq!(app_name("kernel_task", None), "kernel_task");
    }
}
