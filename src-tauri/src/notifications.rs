//! Contagem de notificações por app, lida da Central de Notificações do Windows
//! (`UserNotificationListener`). Os toasts vêm com o AUMID e o nome do app que os enviou; a
//! janela é casada pelo AUMID dela, pelo do processo (apps da Store) ou pelo do atalho do Menu
//! Iniciar do mesmo exe (apps Win32 como Discord e Steam, cujo AUMID não aparece na janela).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
use windows::UI::Notifications::NotificationKinds;

use crate::windows_list::mark_dirty;

/// Contagens por AUMID (minúsculo) e por nome de exibição (`name:` + minúsculo).
static COUNTS: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);
/// Exe (minúsculo) → AUMID e nome do atalho do Menu Iniciar correspondente.
static START_MENU: Mutex<Option<HashMap<String, (String, String)>>> = Mutex::new(None);

fn read_counts() -> windows::core::Result<HashMap<String, u32>> {
    let listener = UserNotificationListener::Current()?;
    let mut status = listener.GetAccessStatus()?;
    if status == UserNotificationListenerAccessStatus::Unspecified {
        status = listener.RequestAccessAsync()?.get()?;
    }
    let mut counts = HashMap::new();
    if status == UserNotificationListenerAccessStatus::Allowed {
        for notification in &listener.GetNotificationsAsync(NotificationKinds::Toast)?.get()? {
            let Ok(info) = notification.AppInfo() else { continue };
            if let Ok(id) = info.AppUserModelId() {
                *counts.entry(id.to_string().to_lowercase()).or_insert(0) += 1;
            }
            if let Ok(name) = info.DisplayInfo().and_then(|d| d.DisplayName()) {
                *counts.entry(format!("name:{}", name.to_string().to_lowercase())).or_insert(0) += 1;
            }
        }
    }
    read_badge_counts(&mut counts);
    Ok(counts)
}

/// Valor numerico de um payload `<badge value="N"/>`.
fn badge_value(payload: &str) -> Option<u32> {
    let start = payload.find("value=\"")? + "value=\"".len();
    let rest = &payload[start..];
    rest[..rest.find('"')?].parse().ok()
}

/// Apps empacotados (WhatsApp) atualizam o badge da barra de tarefas via notificacoes de badge,
/// que nao aparecem no `UserNotificationListener` (so aceita toasts). Le o SQLite da Central em
/// modo somente leitura; qualquer erro (banco bloqueado, esquema diferente) e ignorado.
fn read_badge_counts(counts: &mut HashMap<String, u32>) {
    let Some(local) = std::env::var_os("LOCALAPPDATA") else { return };
    let path = PathBuf::from(local).join("Microsoft/Windows/Notifications/wpndatabase.db");
    if !path.exists() {
        return;
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let Ok(connection) = Connection::open_with_flags(path, flags) else { return };
    let _ = connection.busy_timeout(Duration::from_millis(200));
    let Ok(mut statement) = connection.prepare(
        "select h.PrimaryId, cast(n.Payload as text)
         from Notification n
         join NotificationHandler h on h.RecordId = n.HandlerId
         where n.Type = 'badge' and h.PrimaryId is not null
         order by n.ArrivalTime asc",
    ) else {
        return;
    };
    let Ok(rows) = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) else {
        return;
    };
    let mut badges: HashMap<String, u32> = HashMap::new();
    for (aumid, payload) in rows.flatten() {
        if let Some(value) = badge_value(&payload) {
            // A consulta vem em ordem de chegada: o badge mais recente substitui o anterior.
            badges.insert(aumid.to_lowercase(), value);
        }
    }
    for (aumid, value) in badges {
        let count = counts.entry(aumid).or_insert(0);
        *count = (*count).max(value);
    }
}

pub fn start() {
    std::thread::spawn(|| {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        loop {
            let counts = read_counts().unwrap_or_default();
            let mut current = COUNTS.lock().unwrap();
            if current.as_ref() != Some(&counts) {
                *current = Some(counts);
                drop(current);
                mark_dirty();
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
    std::thread::spawn(|| loop {
        if let Ok(apps) = crate::apps::installed_apps() {
            let mut map = HashMap::new();
            for app in apps {
                let (Some(exe), Some(aumid)) = (app.exe, app.aumid) else { continue };
                let aumid = aumid.to_lowercase();
                // Apps Squirrel (Discord) rodam de `app-<versão>\`, mas o atalho aponta para outro
                // caminho; o nome do exe é o que sobra em comum entre a janela e o atalho.
                if let Some(stem) = std::path::Path::new(&exe).file_stem() {
                    map.entry(stem.to_string_lossy().to_lowercase())
                        .or_insert_with(|| (aumid.clone(), app.name.to_lowercase()));
                }
                map.insert(exe.to_lowercase(), (aumid, app.name.to_lowercase()));
            }
            *START_MENU.lock().unwrap() = Some(map);
        }
        std::thread::sleep(Duration::from_secs(60));
    });
}

/// Notificações pendentes do app dono da janela; 0 quando nenhuma fonte casa.
///
/// Tenta o AUMID da janela, o do processo (apps empacotados) e, por fim, o atalho do Menu Iniciar
/// do mesmo exe (apps Win32 como Discord tiveram o AUMID gravado no atalho). PWAs no navegador não
/// herdam o badge do navegador só por compartilharem o exe.
pub fn badge_for(exe: &str, window_aumid: Option<&str>, process_aumid: Option<&str>) -> u32 {
    let guard = COUNTS.lock().unwrap();
    let Some(counts) = guard.as_ref().filter(|c| !c.is_empty()) else { return 0 };
    if let Some(aumid) = window_aumid {
        if let Some(count) = counts.get(&aumid.to_lowercase()) {
            return *count;
        }
        if aumid.to_lowercase().contains("_crx_") {
            return 0;
        }
    }
    if let Some(count) = process_aumid.and_then(|a| counts.get(&a.to_lowercase())) {
        return *count;
    }
    let start_menu = START_MENU.lock().unwrap();
    let exe = exe.to_lowercase();
    let Some((aumid, name)) = start_menu.as_ref().and_then(|m| {
        m.get(&exe).or_else(|| {
            let stem = std::path::Path::new(&exe).file_stem()?.to_string_lossy().to_lowercase();
            m.get(&stem)
        })
    }) else {
        return 0;
    };
    counts.get(aumid).or_else(|| counts.get(&format!("name:{name}"))).copied().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_value_parse() {
        assert_eq!(badge_value("<badge value=\"1\"/>"), Some(1));
        assert_eq!(badge_value("<badge value=\"42\"/>"), Some(42));
        assert_eq!(badge_value("<badge value=\"0\"/>"), Some(0));
        assert_eq!(badge_value("sem valor"), None);
        assert_eq!(badge_value("value=\"x\""), None);
    }
}

