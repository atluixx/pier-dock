//! User-selected OS power profiles. Never invent unavailable hardware modes.
use serde::Serialize;
use crate::util::ErrStr;

const MODES: [&str; 3] = ["power-saver", "balanced", "performance"];

#[derive(Default, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PowerProfiles {
    profiles: Vec<String>,
    active: Option<String>,
    can_set: bool,
}

fn normalize(profiles: impl IntoIterator<Item = String>, active: Option<String>) -> PowerProfiles {
    let found: Vec<_> = profiles.into_iter().collect();
    let profiles: Vec<_> = MODES.iter().filter(|mode| found.iter().any(|p| p == **mode)).map(|s| s.to_string()).collect();
    PowerProfiles { can_set: !profiles.is_empty(), profiles, active }
}

#[cfg(target_os = "linux")]
fn linux_proxy() -> Option<zbus::blocking::Proxy<'static>> {
    use crate::platform::linux::dbus;
    let conn = dbus::system()?;
    for (name, path) in [
        ("org.freedesktop.UPower.PowerProfiles", "/org/freedesktop/UPower/PowerProfiles"),
        ("net.hadess.PowerProfiles", "/net/hadess/PowerProfiles"),
    ] {
        if let Some(proxy) = dbus::proxy(conn, name, path, name) {
            if proxy.get_property::<String>("ActiveProfile").is_ok() { return Some(proxy); }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn read_profiles() -> PowerProfiles {
    use std::collections::HashMap;
    use zbus::zvariant::OwnedValue;
    let Some(proxy) = linux_proxy() else { return PowerProfiles::default() };
    let profiles: Vec<HashMap<String, OwnedValue>> = proxy.get_property("Profiles").unwrap_or_default();
    let names = profiles.iter().filter_map(|p| String::try_from(p.get("Profile")?.try_clone().ok()?).ok());
    normalize(names, proxy.get_property("ActiveProfile").ok())
}

#[cfg(any(windows, test))]
const WINDOWS_PLANS: [(&str, &str); 3] = [
    ("power-saver", "a1841308-3541-4fab-bc81-f71556f20b4a"),
    ("balanced", "381b4222-f694-41f0-9685-ff5bb260df2e"),
    ("performance", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"),
];
#[cfg(any(windows, test))]
fn windows_profiles(list: &str, active: &str) -> PowerProfiles {
    let list = list.to_ascii_lowercase();
    let active = active.to_ascii_lowercase();
    normalize(WINDOWS_PLANS.iter().filter(|(_, id)| list.contains(id)).map(|(mode, _)| mode.to_string()),
        WINDOWS_PLANS.iter().find(|(_, id)| active.contains(id)).map(|(mode, _)| mode.to_string()))
}
#[cfg(windows)]
fn powercfg(args: &[&str]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    let output = std::process::Command::new(format!(r"{}\System32\powercfg.exe", crate::util::windows_dir()))
        .args(args).creation_flags(0x08000000).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Err("Power settings could not be changed".into()); }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
#[cfg(windows)]
fn read_profiles() -> PowerProfiles {
    match (powercfg(&["/list"]), powercfg(&["/getactivescheme"])) {
        (Ok(list), Ok(active)) => windows_profiles(&list, &active),
        _ => PowerProfiles::default(),
    }
}
#[cfg(target_os = "macos")]
fn read_profiles() -> PowerProfiles { PowerProfiles::default() }

#[tauri::command]
pub async fn power_profiles() -> Result<PowerProfiles, String> {
    tauri::async_runtime::spawn_blocking(read_profiles).await.err_str()
}

fn set_profile(profile: &str) -> Result<(), String> {
    if !MODES.contains(&profile) || !read_profiles().profiles.iter().any(|p| p == profile) {
        return Err("This power profile is not available".into());
    }
    #[cfg(target_os = "linux")]
    return linux_proxy().ok_or("Power profiles service unavailable")?.set_property("ActiveProfile", profile).map_err(|e| e.to_string());
    #[cfg(windows)]
    return powercfg(&["/setactive", WINDOWS_PLANS.iter().find(|(mode, _)| *mode == profile).unwrap().1]).map(drop);
    #[cfg(target_os = "macos")]
    Err("Power mode switching is not supported on this system".into())
}

#[tauri::command]
pub async fn set_power_profile(profile: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_profile(&profile)).await.err_str()?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retains_only_advertised_known_modes_in_display_order() {
        let state = normalize(["performance", "unknown", "balanced", "balanced"].map(String::from), Some("balanced".into()));
        assert_eq!(state.profiles, ["balanced", "performance"]);
        assert!(state.can_set);
        assert!(!normalize([], None).can_set);
    }
    #[test]
    fn windows_plan_detection_is_independent_of_localized_plan_names() {
        let state = windows_profiles("PLAN 381B4222-F694-41F0-9685-FF5BB260DF2E (Equilibrado)", "381b4222-f694-41f0-9685-ff5bb260df2e");
        assert_eq!(state.profiles, ["balanced"]);
        assert_eq!(state.active.as_deref(), Some("balanced"));
    }
    #[test]
    fn rejects_unknown_mode_before_contacting_the_system() { assert!(set_profile("not-a-profile").is_err()); }
}
