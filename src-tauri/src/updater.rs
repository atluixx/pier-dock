//! Atualização pelo GitHub Releases (o `latest.json` que o workflow de release publica). Com
//! `auto_update` ligado, a versão nova só é anunciada (bandeja, dock e aba Geral): a dock substitui
//! a barra do sistema, então reiniciar sem o usuário pedir levaria qualquer regressão a todos de uma vez.

use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{IsMenuItem, Menu, MenuItem};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::util::ErrStr;

#[cfg(target_os = "linux")]
mod relaunch;

pub const MENU_ID: &str = "update";
#[cfg(not(debug_assertions))]
const CHECK_INTERVAL: Duration = Duration::from_secs(12 * 60 * 60);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

#[derive(Default)]
pub struct UpdateState {
    #[cfg(target_os = "linux")]
    relaunch: Mutex<Option<relaunch::Relaunch>>,
    pending: Mutex<Option<Update>>,
    tray_item: Mutex<Option<MenuItem<Wry>>>,
}

/// O menu da bandeja, guardado para inserir o item de atualização quando houver uma.
pub struct TrayMenu(pub Menu<Wry>);

async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = app.updater().err_str()?.check().await.err_str()?;
    let info = update.as_ref().map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() });
    *app.state::<UpdateState>().pending.lock().unwrap() = update;
    if let Some(info) = &info {
        log::info!("update {} available", info.version);
        announce(app, info);
    }
    Ok(info)
}

fn announce(app: &AppHandle, info: &UpdateInfo) {
    let label = update_label(app, &info.version);
    let state = app.state::<UpdateState>();
    let mut tray_item = state.tray_item.lock().unwrap();
    match tray_item.as_ref() {
        Some(item) => {
            let _ = item.set_text(&label);
        }
        None => {
            if let (Some(menu), Ok(item)) = (app.try_state::<TrayMenu>(), MenuItem::with_id(app, MENU_ID, &label, true, None::<&str>)) {
                if menu.0.insert(&item as &dyn IsMenuItem<Wry>, 0).is_ok() {
                    *tray_item = Some(item);
                }
            }
        }
    }
    let _ = app.emit("update-available", info.clone());
}

fn update_label(app: &AppHandle, version: &str) -> String {
    format!("{} {version}", crate::i18n::current(app).t("Atualizar para", "Update to"))
}

/// Traduz o item de atualização da bandeja, se houver um, quando o idioma muda.
pub fn relabel(app: &AppHandle) {
    let state = app.state::<UpdateState>();
    let version = state.pending.lock().unwrap().as_ref().map(|u| u.version.clone());
    let item = state.tray_item.lock().unwrap().clone();
    if let (Some(item), Some(version)) = (item, version) {
        let _ = item.set_text(update_label(app, &version));
    }
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    check(&app).await
}

/// A versão já encontrada, para a dock mostrar o aviso depois de recarregar.
#[tauri::command]
pub fn pending_update(app: AppHandle) -> Option<UpdateInfo> {
    let state = app.state::<UpdateState>();
    let pending = state.pending.lock().unwrap();
    pending.as_ref().map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() })
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let pending = app.state::<UpdateState>().pending.lock().unwrap().take();
    let update = match pending {
        Some(update) => update,
        None => app.updater().err_str()?.check().await.err_str()?.ok_or("Nenhuma atualização disponível")?,
    };
    log::info!("installing update {}", update.version);
    #[cfg(target_os = "linux")]
    let relaunch = relaunch::prepare(&app.env()).err_str()?;
    let bytes = update.download(|_, _| {}, || {}).await.err_str()?;
    // No Windows o instalador encerra o processo sem passar pelo `RunEvent::Exit`: a barra nativa
    // precisa voltar antes.
    crate::taskbar::restore();
    if let Err(e) = update.install(bytes) {
        if app.state::<crate::config::ConfigState>().0.lock().unwrap().hide_taskbar {
            crate::taskbar::hide();
        }
        return Err(e.to_string());
    }
    #[cfg(target_os = "linux")]
    {
        *app.state::<UpdateState>().relaunch.lock().unwrap() = Some(relaunch);
        app.exit(0);
    }
    // Request the normal exit lifecycle without parking an async worker forever.
    // Windows installers normally exit the process themselves and handle their own relaunch.
    #[cfg(not(target_os = "linux"))]
    app.request_restart();
    Ok(())
}

/// Called after native taskbar restoration, at the end of the old instance's exit lifecycle.
pub fn finish_restart(app: &AppHandle) {
    #[cfg(target_os = "linux")]
    if let Some(relaunch) = app.state::<UpdateState>().relaunch.lock().unwrap().take() {
        // An exec does not close the D-Bus connection until it succeeds, so release the name first.
        tauri_plugin_single_instance::destroy(app);
        app.cleanup_before_exit();
        log::info!("restarting the updated Linux application");
        log::error!("could not relaunch the updated Linux application: {}", relaunch.exec());
    }
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}

/// Procura atualização um pouco depois de abrir (para não disputar com a inicialização) e depois
/// a cada 12h, enquanto `auto_update` estiver ligado.
#[cfg(not(debug_assertions))]
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(30));
        loop {
            let enabled = app.state::<crate::config::ConfigState>().0.lock().unwrap().auto_update;
            if enabled {
                if let Err(e) = tauri::async_runtime::block_on(check(&app)) {
                    log::warn!("falha ao procurar atualização: {e}");
                }
            }
            std::thread::sleep(CHECK_INTERVAL);
        }
    });
}
