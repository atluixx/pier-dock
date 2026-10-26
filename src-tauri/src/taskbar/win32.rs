//! Taskbar do Windows.
//!
//! A taskbar é colocada em "ocultar automaticamente" (para liberar a área de trabalho que ela
//! reserva) e suas janelas são escondidas. O estado original fica salvo em disco, para que um
//! crash ou `pier.exe --restore-taskbar` consigam devolvê-la exatamente como estava.

use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, BOOL, COLORREF, HWND, LPARAM};
use windows::Win32::System::Console::SetConsoleCtrlHandler;
use windows::Win32::System::Threading::{
    OpenProcess, WaitForSingleObject, CREATE_BREAKAWAY_FROM_JOB, CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS, INFINITE,
    PROCESS_SYNCHRONIZE,
};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABM_GETSTATE, ABM_SETSTATE, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, GetLayeredWindowAttributes, GetWindowLongPtrW, IsWindowVisible, SetForegroundWindow,
    SetLayeredWindowAttributes, SetWindowLongPtrW, ShowWindow, GWL_EXSTYLE, LAYERED_WINDOW_ATTRIBUTES_FLAGS, LWA_ALPHA, SW_HIDE,
    SW_SHOW, SW_SHOWNA, WS_EX_LAYERED, WS_EX_TRANSPARENT,
};

use crate::util::data_dir;

static HIDDEN: AtomicBool = AtomicBool::new(false);
static SHOWN_FOR_TRAY: AtomicBool = AtomicBool::new(false);
static PRIMARY_TRAY: AtomicIsize = AtomicIsize::new(0);
/// Se fomos nós que pusemos `WS_EX_LAYERED` na taskbar (e então devemos tirá-lo).
static ADDED_LAYERED: AtomicBool = AtomicBool::new(false);
static GUARDIAN_SPAWNED: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Deserialize)]
struct SavedState {
    original_state: u32,
    /// Pid do Pier que escondeu a taskbar; o guardião só restaura se ainda for o dono.
    #[serde(default)]
    owner_pid: Option<u32>,
}

fn state_path() -> std::path::PathBuf {
    data_dir().join("taskbar-state.json")
}

fn read_saved() -> Option<SavedState> {
    serde_json::from_str(&std::fs::read_to_string(state_path()).ok()?).ok()
}

fn taskbar_windows() -> Vec<HWND> {
    let mut found = Vec::new();
    unsafe {
        if let Ok(h) = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) {
            if !h.is_invalid() {
                found.push(h);
            }
        }
        let mut prev = HWND::default();
        while let Ok(h) = FindWindowExW(HWND::default(), prev, w!("Shell_SecondaryTrayWnd"), PCWSTR::null()) {
            if h.is_invalid() {
                break;
            }
            found.push(h);
            prev = h;
        }
    }
    found
}

fn appbar_data() -> APPBARDATA {
    APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, ..Default::default() }
}

fn get_state() -> u32 {
    let mut abd = appbar_data();
    unsafe { SHAppBarMessage(ABM_GETSTATE, &mut abd) as u32 }
}

fn set_state(state: u32) {
    let mut abd = appbar_data();
    abd.lParam = LPARAM(state as isize);
    unsafe {
        SHAppBarMessage(ABM_SETSTATE, &mut abd);
    }
}

/// Deixa a taskbar invisível e sem receber cliques sem escondê-la de fato: com `SW_HIDE` ela não
/// expõe a seta da bandeja à UI Automation.
fn make_transparent(h: HWND) {
    unsafe {
        let style = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
        if style & WS_EX_LAYERED.0 == 0 {
            ADDED_LAYERED.store(true, Ordering::SeqCst);
        }
        SetWindowLongPtrW(h, GWL_EXSTYLE, (style | WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0) as isize);
        let _ = SetLayeredWindowAttributes(h, COLORREF(0), 0, LWA_ALPHA);
    }
}

/// Desfaz `make_transparent`. Alfa 0 só pode ter vindo do Pier, o que permite reconhecer a
/// transparência mesmo em outro processo (`--restore-taskbar` depois de um crash).
fn make_opaque(h: HWND, added_layered: bool) {
    unsafe {
        let (mut alpha, mut flags) = (0u8, LAYERED_WINDOW_ATTRIBUTES_FLAGS(0));
        let ours = GetLayeredWindowAttributes(h, None, Some(&mut alpha as *mut _), Some(&mut flags as *mut _)).is_ok() && flags.contains(LWA_ALPHA) && alpha == 0;
        if !ours {
            return;
        }
        let _ = SetLayeredWindowAttributes(h, COLORREF(0), 255, LWA_ALPHA);
        let mut style = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32 & !WS_EX_TRANSPARENT.0;
        if added_layered {
            style &= !WS_EX_LAYERED.0;
        }
        SetWindowLongPtrW(h, GWL_EXSTYLE, style as isize);
    }
}

fn make_all_opaque() {
    let added_layered = ADDED_LAYERED.swap(false, Ordering::SeqCst);
    for h in taskbar_windows() {
        make_opaque(h, added_layered);
    }
}

fn set_visible(visible: bool) {
    for h in taskbar_windows() {
        unsafe {
            let _ = ShowWindow(h, if visible { SW_SHOW } else { SW_HIDE });
        }
    }
}

pub fn hide() {
    // Se o arquivo já existe, uma execução anterior não restaurou (crash): o estado atual é o
    // nosso "autohide", então mantemos o original salvo.
    let original_state = read_saved().map_or_else(get_state, |saved| saved.original_state);
    let saved = SavedState { original_state, owner_pid: Some(std::process::id()) };
    let _ = crate::util::write_atomic(&state_path(), serde_json::to_string(&saved).unwrap_or_default());
    set_state(ABS_AUTOHIDE);
    set_visible(false);
    if let Some(&tray) = taskbar_windows().first() {
        PRIMARY_TRAY.store(tray.0 as isize, Ordering::SeqCst);
    }
    HIDDEN.store(true, Ordering::SeqCst);
    spawn_guardian();
}

pub fn restore() {
    HIDDEN.store(false, Ordering::SeqCst);
    crate::dock_window::remove_appbar();
    if let Some(saved) = read_saved() {
        set_state(saved.original_state);
        let _ = std::fs::remove_file(state_path());
    }
    make_all_opaque();
    set_visible(true);
}

/// Encerrar o Pier pelo Gerenciador de Tarefas não executa código nenhum, então a taskbar só
/// volta se outro processo cuidar disso: este fica esperando o Pier morrer.
fn spawn_guardian() {
    if GUARDIAN_SPAWNED.swap(true, Ordering::SeqCst) {
        return;
    }
    let Ok(exe) = std::env::current_exe() else {
        GUARDIAN_SPAWNED.store(false, Ordering::SeqCst);
        return;
    };
    let detached = DETACHED_PROCESS.0 | CREATE_NEW_PROCESS_GROUP.0;
    // Dentro de um job que não permite breakaway (alguns launchers), pedir CREATE_BREAKAWAY_FROM_JOB
    // falha com acesso negado; sem ele o guardião nasce no mesmo job, mas ainda sobrevive ao Pier.
    let spawned = [detached | CREATE_BREAKAWAY_FROM_JOB.0, detached].into_iter().any(|flags| {
        Command::new(&exe)
            .arg("--guard-taskbar")
            .arg(std::process::id().to_string())
            .creation_flags(flags)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .is_ok()
    });
    if !spawned {
        log::warn!("não foi possível iniciar o guardião da taskbar");
        GUARDIAN_SPAWNED.store(false, Ordering::SeqCst);
    }
}

fn owns_taskbar(saved: Option<&SavedState>, pid: u32) -> bool {
    saved.is_some_and(|s| s.owner_pid == Some(pid))
}

/// Corpo de `pier.exe --guard-taskbar <pid>`: espera o processo `pid` terminar e, se ele ainda era
/// quem mantinha a taskbar escondida, a devolve. Numa saída normal o estado já foi apagado, e num
/// reinício do updater o novo Pier regravou o dono, então nos dois casos não há nada a fazer.
pub fn run_guardian(pid: u32) {
    unsafe {
        // Se o pid já não existe, `OpenProcess` falha e não há o que esperar.
        if let Ok(process) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            WaitForSingleObject(process, INFINITE);
            let _ = CloseHandle(process);
        }
    }
    if owns_taskbar(read_saved().as_ref(), pid) {
        restore();
    }
}

fn is_hidden() -> bool {
    HIDDEN.load(Ordering::SeqCst)
}

/// Escondida (`SW_HIDE`) ou recolhida, a taskbar não expõe a seta da bandeja à UI Automation. Aqui
/// ela sobe, transparente, só enquanto a seta é acionada: com a gaveta aberta o Windows revela a
/// taskbar inteira, então ela é escondida de novo assim que a gaveta aparece.
pub fn show_for_tray(shown: bool) {
    if !is_hidden() {
        return;
    }
    SHOWN_FOR_TRAY.store(shown, Ordering::SeqCst);
    if shown {
        let windows = taskbar_windows();
        for &h in &windows {
            make_transparent(h);
            unsafe {
                let _ = ShowWindow(h, SW_SHOWNA);
            }
        }
        // Recolhida (ocultar automaticamente), a taskbar não monta os botões da bandeja; ativá-la
        // faz ela subir, como o mouse no fim da tela.
        if let Some(&primary) = windows.first() {
            unsafe {
                let _ = SetForegroundWindow(primary);
            }
        }
    } else {
        set_visible(false);
        make_all_opaque();
    }
}

/// Reaplica o ocultamento se a taskbar reaparecer (o Win11 às vezes a reexibe) e avisa quando o
/// explorer.exe reinicia, já que um explorer novo perde o registro da nossa AppBar.
pub fn start_watchdog(on_explorer_restart: impl Fn() + Send + 'static) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(1500));
        if !is_hidden() || SHOWN_FOR_TRAY.load(Ordering::SeqCst) {
            continue;
        }
        let windows = taskbar_windows();
        let Some(&tray) = windows.first() else { continue };
        if PRIMARY_TRAY.swap(tray.0 as isize, Ordering::SeqCst) != tray.0 as isize {
            set_state(ABS_AUTOHIDE);
            on_explorer_restart();
        }
        for h in windows {
            unsafe {
                if IsWindowVisible(h).as_bool() {
                    let _ = ShowWindow(h, SW_HIDE);
                }
            }
        }
    });
}

unsafe extern "system" fn console_handler(_ctrl: u32) -> BOOL {
    restore();
    BOOL(0)
}

/// Ctrl+C / fechamento do console (`tauri dev`).
pub fn install_signal_guard() {
    unsafe {
        let _ = SetConsoleCtrlHandler(Some(console_handler), true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guardian_only_restores_for_the_pid_that_hid_the_taskbar() {
        let saved = SavedState { original_state: 0, owner_pid: Some(10) };
        assert!(owns_taskbar(Some(&saved), 10));
        assert!(!owns_taskbar(Some(&saved), 11));
        assert!(!owns_taskbar(None, 10));
    }

    #[test]
    fn state_file_from_before_the_guardian_still_loads() {
        let saved: SavedState = serde_json::from_str(r#"{"original_state":2}"#).unwrap();
        assert_eq!(saved.original_state, 2);
        assert!(!owns_taskbar(Some(&saved), 10));
    }
}
