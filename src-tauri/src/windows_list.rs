//! Janelas abertas (o que a taskbar mostraria), eventos ao vivo e ações de focar/minimizar.

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, TRUE, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, DispatchMessageW, EnumWindows, GetAncestor, GetForegroundWindow, GetMessageW, GetWindow,
    GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    PostMessageW, SetForegroundWindow, ShowWindow, TranslateMessage, CHILDID_SELF, EVENT_OBJECT_CLOAKED,
    EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE, EVENT_OBJECT_NAMECHANGE, EVENT_OBJECT_UNCLOAKED,
    EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZESTART, GA_ROOTOWNER, GWL_EXSTYLE,
    GW_OWNER, MSG, OBJID_WINDOW, SW_MINIMIZE, SW_RESTORE, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WM_CLOSE,
    WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

use crate::util::{com_init, wide_to_string};

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub exe: String,
    pub aumid: Option<String>,
    pub minimized: bool,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WindowsSnapshot {
    /// Em ordem Z: a primeira janela de cada app é a usada mais recentemente.
    pub windows: Vec<WindowInfo>,
    pub foreground: isize,
}

static DIRTY: AtomicBool = AtomicBool::new(true);
/// Última janela de outro processo que esteve em primeiro plano. Clicar na dock pode mover o foco
/// para o WebView, então "qual app está ativo" é lembrado aqui.
static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

fn hwnd(value: isize) -> HWND {
    HWND(value as *mut _)
}

/// Mesmas regras de "aparece na taskbar" que o explorer usa, mais o filtro de janelas cloaked
/// (outras áreas de trabalho virtuais, apps UWP suspensos).
fn is_app_window(h: HWND) -> bool {
    unsafe {
        if !IsWindowVisible(h).as_bool() {
            return false;
        }
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
        let app_window = ex & WS_EX_APPWINDOW.0 != 0;
        if !app_window {
            if ex & (WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) != 0 {
                return false;
            }
            if GetWindow(h, GW_OWNER).map(|o| !o.is_invalid()).unwrap_or(false) {
                return false;
            }
        }
        let mut cloaked = 0u32;
        let _ = DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
        if cloaked != 0 {
            return false;
        }
        GetWindowTextLengthW(h) > 0
    }
}

fn window_pid(h: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(h, Some(&mut pid));
    }
    pid
}

pub fn process_path(pid: u32) -> String {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        if ok.is_ok() {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

fn window_aumid(h: HWND) -> Option<String> {
    unsafe {
        let store: IPropertyStore = SHGetPropertyStoreForWindow(h).ok()?;
        let value = store.GetValue(&PKEY_AppUserModel_ID).ok()?;
        let pwstr = PropVariantToStringAlloc(&value).ok()?;
        let s = pwstr.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(pwstr.0 as *const _));
        s.filter(|s| !s.is_empty())
    }
}

fn window_title(h: HWND) -> String {
    let mut buf = [0u16; 512];
    let len = unsafe { GetWindowTextW(h, &mut buf) } as usize;
    wide_to_string(&buf[..len])
}

unsafe extern "system" fn collect(h: HWND, lparam: LPARAM) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<HWND>);
    list.push(h);
    TRUE
}

pub fn snapshot() -> WindowsSnapshot {
    let mut handles: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut handles as *mut _ as isize));
    }
    let own_pid = std::process::id();
    let windows = handles
        .into_iter()
        .filter(|&h| is_app_window(h))
        .filter_map(|h| {
            let pid = window_pid(h);
            if pid == own_pid {
                return None;
            }
            Some(WindowInfo {
                hwnd: h.0 as isize,
                title: window_title(h),
                exe: process_path(pid),
                aumid: window_aumid(h),
                minimized: unsafe { IsIconic(h).as_bool() },
            })
        })
        .collect();
    WindowsSnapshot { windows, foreground: LAST_FOREGROUND.load(Ordering::SeqCst) }
}

unsafe extern "system" fn on_win_event(
    _hook: HWINEVENTHOOK,
    event: u32,
    h: HWND,
    id_object: i32,
    id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if id_object != OBJID_WINDOW.0 || id_child != CHILDID_SELF as i32 {
        return;
    }
    if event == EVENT_SYSTEM_FOREGROUND && !h.is_invalid() && window_pid(h) != std::process::id() {
        let root = GetAncestor(h, GA_ROOTOWNER);
        let root = if root.is_invalid() { h } else { root };
        LAST_FOREGROUND.store(root.0 as isize, Ordering::SeqCst);
    }
    DIRTY.store(true, Ordering::SeqCst);
}

/// Hooks de eventos do sistema (thread com message loop) + uma thread que, quando algo mudou,
/// tira um snapshot e emite `windows-changed` só se ele for diferente do anterior.
pub fn start(app: AppHandle) {
    unsafe {
        let fg = GetForegroundWindow();
        if !fg.is_invalid() && window_pid(fg) != std::process::id() {
            LAST_FOREGROUND.store(fg.0 as isize, Ordering::SeqCst);
        }
    }

    std::thread::spawn(|| unsafe {
        let flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
        let ranges = [
            (EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND),
            (EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND),
            (EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE),
            (EVENT_OBJECT_NAMECHANGE, EVENT_OBJECT_NAMECHANGE),
            (EVENT_OBJECT_CLOAKED, EVENT_OBJECT_UNCLOAKED),
        ];
        for (min, max) in ranges {
            SetWinEventHook(min, max, None, Some(on_win_event), 0, 0, flags);
        }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });

    std::thread::spawn(move || {
        com_init();
        let mut last: Option<WindowsSnapshot> = None;
        loop {
            std::thread::sleep(Duration::from_millis(120));
            if !DIRTY.swap(false, Ordering::SeqCst) {
                continue;
            }
            let snap = snapshot();
            if last.as_ref() != Some(&snap) {
                let _ = app.emit("windows-changed", &snap);
                last = Some(snap);
            }
        }
    });
}

fn activate(h: HWND) {
    unsafe {
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        // Anexar a fila de input à da janela em foco libera o SetForegroundWindow.
        let fg = GetForegroundWindow();
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let own_thread = GetCurrentThreadId();
        let attached = fg_thread != own_thread && AttachThreadInput(own_thread, fg_thread, true).as_bool();
        let _ = SetForegroundWindow(h);
        let _ = BringWindowToTop(h);
        if attached {
            let _ = AttachThreadInput(own_thread, fg_thread, false);
        }
    }
    LAST_FOREGROUND.store(h.0 as isize, Ordering::SeqCst);
    DIRTY.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn get_windows() -> WindowsSnapshot {
    com_init();
    snapshot()
}

/// Clique num app aberto: foca a janela mais recente; se o app já está ativo, minimiza (uma
/// janela) ou alterna para a próxima (várias janelas).
#[tauri::command]
pub fn toggle_app_windows(hwnds: Vec<isize>) {
    let Some(&first) = hwnds.first() else { return };
    let fg = LAST_FOREGROUND.load(Ordering::SeqCst);
    let active = hwnds.contains(&fg) && unsafe { !IsIconic(hwnd(fg)).as_bool() };
    if !active {
        activate(hwnd(first));
    } else if hwnds.len() == 1 {
        unsafe {
            let _ = ShowWindow(hwnd(fg), SW_MINIMIZE);
        }
        DIRTY.store(true, Ordering::SeqCst);
    } else {
        // A lista vem em ordem Z, então a última é a usada há mais tempo: isso faz o ciclo
        // passar por todas as janelas em vez de pular entre as duas mais recentes.
        activate(hwnd(*hwnds.last().unwrap()));
    }
}

#[tauri::command]
pub fn activate_window(hwnd_value: isize) {
    activate(hwnd(hwnd_value));
}

#[tauri::command]
pub fn close_windows(hwnds: Vec<isize>) {
    for h in hwnds {
        unsafe {
            let _ = PostMessageW(hwnd(h), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "smoke test: depende das janelas abertas na máquina"]
    fn lists_open_windows() {
        crate::util::com_init();
        let snap = super::snapshot();
        for w in &snap.windows {
            println!("{:?} | {} | {:?} | {}", w.hwnd, w.exe, w.aumid, w.title);
        }
        assert!(snap.windows.iter().all(|w| !w.title.is_empty()));
    }
}
