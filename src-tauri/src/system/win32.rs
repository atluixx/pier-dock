//! Bandeja no Windows: bateria, rede (WinRT), volume (Core Audio) e flyouts nativos via teclado.

use windows::Networking::Connectivity::{NetworkConnectivityLevel, NetworkInformation};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_A, VK_LWIN, VK_N,
};

use super::{Battery, Network, Volume};
use crate::util::{com_init, windows_dir, ErrStr};

pub fn battery() -> Battery {
    let mut status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
        return Battery::absent();
    }
    // BatteryFlag: 128 = sem bateria, 255 = desconhecido.
    let present = status.BatteryFlag & 128 == 0 && status.BatteryFlag != 255;
    Battery { present, percent: status.BatteryLifePercent.min(100), charging: status.ACLineStatus == 1 }
}

pub fn network() -> Network {
    let Ok(profile) = NetworkInformation::GetInternetConnectionProfile() else { return Network::disconnected() };
    let level = profile.GetNetworkConnectivityLevel().unwrap_or(NetworkConnectivityLevel::None);
    Network {
        connected: level != NetworkConnectivityLevel::None,
        internet: level == NetworkConnectivityLevel::InternetAccess,
        wifi: profile.IsWlanConnectionProfile().unwrap_or(false),
        signal_bars: profile.GetSignalBars().ok().and_then(|r| r.Value().ok()),
        name: profile.ProfileName().map(|s| s.to_string()).unwrap_or_default(),
    }
}

fn endpoint_volume() -> windows::core::Result<IAudioEndpointVolume> {
    com_init();
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        device.Activate(CLSCTX_ALL, None)
    }
}

fn key_input(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() }, ..Default::default() },
        },
    }
}

fn press(keys: &[VIRTUAL_KEY]) {
    let mut inputs: Vec<INPUT> = keys.iter().map(|&k| key_input(k, false)).collect();
    inputs.extend(keys.iter().rev().map(|&k| key_input(k, true)));
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

pub fn volume() -> Result<Volume, String> {
    (|| -> windows::core::Result<Volume> {
        let vol = endpoint_volume()?;
        unsafe { Ok(Volume { level: vol.GetMasterVolumeLevelScalar()?, muted: vol.GetMute()?.as_bool() }) }
    })()
    .err_str()
}

pub fn set_volume(level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    (|| -> windows::core::Result<()> {
        let vol = endpoint_volume()?;
        unsafe {
            if let Some(level) = level {
                vol.SetMasterVolumeLevelScalar(level, std::ptr::null())?;
            }
            if let Some(muted) = muted {
                vol.SetMute(muted, std::ptr::null())?;
            }
        }
        Ok(())
    })()
    .err_str()
}

fn shell_open(target: &str) {
    com_init();
    unsafe {
        ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(target), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
}

/// Abre os flyouts nativos (Menu Iniciar, Configurações Rápidas e Central de Notificações), o
/// Gerenciador de Tarefas e o Calendário do Outlook.
pub fn open_shell(kind: &str) {
    match kind {
        "start" => press(&[VK_LWIN]),
        "quick-settings" => press(&[VK_LWIN, VK_A]),
        "notifications" => press(&[VK_LWIN, VK_N]),
        "system-monitor" => shell_open(&format!(r"{}\System32\Taskmgr.exe", windows_dir())),
        "calendar" => shell_open("outlookcal:"),
        _ => {}
    }
}
