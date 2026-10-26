//! Layouts de teclado do Windows. O layout é por thread: o ativo é o da janela que estava em
//! primeiro plano antes de a dock receber o clique, e a troca é pedida a essa mesma janela.

use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Globalization::{GetLocaleInfoW, LOCALE_SISO639LANGNAME2, LOCALE_SLOCALIZEDDISPLAYNAME};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayout, GetKeyboardLayoutList, HKL};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, PostMessageW, WM_INPUTLANGCHANGEREQUEST};

use super::{KeyboardLayout, KeyboardLayouts};

fn target_window() -> Option<HWND> {
    crate::windows_list::last_foreground().or_else(|| {
        let h = unsafe { GetForegroundWindow() };
        (!h.is_invalid()).then_some(h)
    })
}

fn hkl_id(hkl: HKL) -> String {
    format!("{:08x}", hkl.0 as isize as u32)
}

fn locale_info(lang_id: u16, kind: u32) -> Option<String> {
    let mut buf = [0u16; 128];
    let len = unsafe { GetLocaleInfoW(lang_id as u32, kind, Some(&mut buf)) };
    (len > 1).then(|| String::from_utf16_lossy(&buf[..len as usize - 1]))
}

fn describe(hkl: HKL) -> KeyboardLayout {
    let id = hkl_id(hkl);
    let lang_id = (hkl.0 as isize as u32 & 0xFFFF) as u16;
    let code = locale_info(lang_id, LOCALE_SISO639LANGNAME2).map_or_else(|| format!("{lang_id:04X}"), |c| c.to_uppercase());
    let name = locale_info(lang_id, LOCALE_SLOCALIZEDDISPLAYNAME).unwrap_or_else(|| code.clone());
    KeyboardLayout { id, code, name }
}

fn installed() -> Vec<HKL> {
    unsafe {
        let count = GetKeyboardLayoutList(None);
        let mut list = vec![HKL(std::ptr::null_mut()); count.max(0) as usize];
        let filled = GetKeyboardLayoutList(Some(&mut list));
        list.truncate(filled.max(0) as usize);
        list
    }
}

pub fn layouts() -> KeyboardLayouts {
    let active = target_window().map(|h| unsafe {
        let thread = GetWindowThreadProcessId(h, None);
        hkl_id(GetKeyboardLayout(thread))
    });
    KeyboardLayouts { layouts: installed().into_iter().map(describe).collect(), active }
}

pub fn set_layout(id: &str) -> Result<(), String> {
    let hkl = installed()
        .into_iter()
        .find(|&hkl| hkl_id(hkl) == id)
        .ok_or_else(|| crate::i18n::tr("layout de teclado não encontrado", "keyboard layout not found"))?;
    let window = target_window().ok_or_else(|| crate::i18n::tr("nenhuma janela em primeiro plano", "no foreground window"))?;
    // `ActivateKeyboardLayout` só vale para a thread que o chama; o pedido tem de ir à janela.
    unsafe { PostMessageW(window, WM_INPUTLANGCHANGEREQUEST, WPARAM(0), LPARAM(hkl.0 as isize)) }.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hkl_id_keeps_only_the_low_32_bits() {
        assert_eq!(hkl_id(HKL(0x0416_0416isize as *mut _)), "04160416");
        // Em 64 bits o HKL de um layout com dispositivo vem estendido com sinal.
        assert_eq!(hkl_id(HKL(-0x0FFE_FBF7isize as *mut _)), "f0010409");
    }
}
