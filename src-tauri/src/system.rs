//! Itens de "bandeja": bateria, rede, volume e atalhos para os flyouts nativos do Windows.

use serde::Serialize;
use windows::Networking::Connectivity::{NetworkConnectivityLevel, NetworkInformation};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_A, VK_LWIN, VK_N,
};

use crate::util::{com_init, ErrStr};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub present: bool,
    pub percent: u8,
    pub charging: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub connected: bool,
    pub internet: bool,
    pub wifi: bool,
    pub signal_bars: Option<u8>,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub battery: Battery,
    pub network: Network,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub level: f32,
    pub muted: bool,
}

fn battery() -> Battery {
    let mut status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
        return Battery { present: false, percent: 0, charging: false };
    }
    // BatteryFlag: 128 = sem bateria, 255 = desconhecido.
    let present = status.BatteryFlag & 128 == 0 && status.BatteryFlag != 255;
    Battery { present, percent: status.BatteryLifePercent.min(100), charging: status.ACLineStatus == 1 }
}

fn network() -> Network {
    let disconnected = Network { connected: false, internet: false, wifi: false, signal_bars: None, name: String::new() };
    let Ok(profile) = NetworkInformation::GetInternetConnectionProfile() else { return disconnected };
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

#[tauri::command]
pub async fn system_status() -> Result<SystemStatus, String> {
    tauri::async_runtime::spawn_blocking(|| SystemStatus { battery: battery(), network: network() })
        .await
        .err_str()
}

#[tauri::command]
pub async fn get_volume() -> Result<Volume, String> {
    tauri::async_runtime::spawn_blocking(|| -> windows::core::Result<Volume> {
        let vol = endpoint_volume()?;
        unsafe { Ok(Volume { level: vol.GetMasterVolumeLevelScalar()?, muted: vol.GetMute()?.as_bool() }) }
    })
    .await
    .err_str()?
    .err_str()
}

#[tauri::command]
pub async fn set_volume(level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> windows::core::Result<()> {
        let vol = endpoint_volume()?;
        unsafe {
            if let Some(level) = level {
                vol.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())?;
            }
            if let Some(muted) = muted {
                vol.SetMute(muted, std::ptr::null())?;
            }
        }
        Ok(())
    })
    .await
    .err_str()?
    .err_str()
}

/// Abre os flyouts nativos: Menu Iniciar, Configurações Rápidas e Central de Notificações.
#[tauri::command]
pub fn open_shell(kind: String) {
    match kind.as_str() {
        "start" => press(&[VK_LWIN]),
        "quick-settings" => press(&[VK_LWIN, VK_A]),
        "notifications" => press(&[VK_LWIN, VK_N]),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "smoke test: lê o estado real do sistema"]
    fn reads_system_status() {
        println!("{:?}", super::battery());
        println!("{:?}", super::network());
        let vol = super::endpoint_volume().unwrap();
        unsafe {
            println!("volume {} muted {:?}", vol.GetMasterVolumeLevelScalar().unwrap(), vol.GetMute().unwrap());
        }
    }
}
