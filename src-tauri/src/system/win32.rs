//! Bandeja no Windows: bateria, rede (WinRT), volume (Core Audio), Bluetooth (WinRT) e flyouts
//! nativos via teclado.

use windows::Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice as BtDevice, BluetoothLEDevice};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Devices::Radios::{Radio, RadioKind, RadioState};
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

use super::{kind_from_class, Battery, Bluetooth, BluetoothDevice, Network, Volume};
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

fn bluetooth_radio() -> Option<Radio> {
    let radios = Radio::GetRadiosAsync().ok()?.get().ok()?;
    radios.into_iter().find(|r| r.Kind().is_ok_and(|k| k == RadioKind::Bluetooth))
}

/// Tipo pelo Appearance do Bluetooth LE: categoria nos 10 bits altos, subcategoria nos 6 baixos.
fn kind_from_appearance(raw: u16) -> &'static str {
    const CATEGORY_HID: u16 = 0x0F;
    match (raw >> 6, raw & 0x3F) {
        (CATEGORY_HID, 1) => "keyboard",
        (CATEGORY_HID, 2) => "mouse",
        (CATEGORY_HID, 3 | 4) => "gamepad",
        _ => "other",
    }
}

fn connected_devices() -> windows::core::Result<Vec<BluetoothDevice>> {
    let mut devices: Vec<BluetoothDevice> = Vec::new();
    let classic = DeviceInformation::FindAllAsyncAqsFilter(&BtDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)?)?.get()?;
    for info in classic {
        let device = BtDevice::FromIdAsync(&info.Id()?)?.get()?;
        let kind = kind_from_class(device.ClassOfDevice()?.RawValue()?);
        devices.push(BluetoothDevice { name: device.Name()?.to_string(), kind, battery: None });
    }
    let le = DeviceInformation::FindAllAsyncAqsFilter(&BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)?)?.get()?;
    for info in le {
        let device = BluetoothLEDevice::FromIdAsync(&info.Id()?)?.get()?;
        let name = device.Name()?.to_string();
        // Dispositivos dual-mode (fones, por exemplo) aparecem nas duas listas.
        if devices.iter().any(|d| d.name == name) {
            continue;
        }
        let kind = kind_from_appearance(device.Appearance()?.RawValue()?);
        devices.push(BluetoothDevice { name, kind, battery: None });
    }
    Ok(devices)
}

pub fn bluetooth() -> Bluetooth {
    let Some(radio) = bluetooth_radio() else { return Bluetooth::absent() };
    let powered = radio.State().is_ok_and(|s| s == RadioState::On);
    let devices = if powered { connected_devices().unwrap_or_default() } else { Vec::new() };
    Bluetooth { available: true, powered, can_toggle: true, devices }
}

pub fn set_bluetooth(powered: bool) -> Result<(), String> {
    let radio = bluetooth_radio().ok_or("sem adaptador Bluetooth")?;
    radio.SetStateAsync(if powered { RadioState::On } else { RadioState::Off }).err_str()?.get().err_str()?;
    Ok(())
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
        "bluetooth" => shell_open("ms-settings:bluetooth"),
        _ => {}
    }
}
