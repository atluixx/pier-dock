//! Player de mídia via System Media Transport Controls: uma única API cobre o Spotify desktop, o
//! YouTube Music (PWA ou aba do Chrome/Edge) e qualquer outro app que mostre controles de mídia.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use crate::util::ErrStr;

/// Diferença entre a época do FILETIME (1601) e a do Unix, em unidades de 100ns.
const FILETIME_UNIX_OFFSET: i64 = 116_444_736_000_000_000;

#[derive(Serialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaSession {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    pub position_ms: f64,
    pub duration_ms: f64,
    /// Momento (Unix ms) em que `position_ms` foi medida — o frontend interpola a partir daí.
    pub updated_at_ms: f64,
    pub thumbnail_key: Option<String>,
    pub can_next: bool,
    pub can_prev: bool,
    pub can_seek: bool,
}

#[derive(Serialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub sessions: Vec<MediaSession>,
    pub current: Option<String>,
}

static STATE: Mutex<Option<MediaState>> = Mutex::new(None);
static THUMBNAILS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn read_thumbnail(reference: IRandomAccessStreamReference) -> Option<String> {
    let stream = reference.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 {
        return None;
    }
    let content_type = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size).ok()?.get().ok()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf).ok()?;
    Some(format!(
        "data:{};base64,{}",
        safe_image_mime(&content_type),
        base64::engine::general_purpose::STANDARD.encode(buf)
    ))
}

/// O content type vem do app que publica a sessão de mídia e acaba dentro de um `url()` CSS no
/// frontend: só tipos de imagem conhecidos passam.
fn safe_image_mime(content_type: &str) -> &'static str {
    match content_type.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "image/jpeg",
        "image/gif" => "image/gif",
        "image/webp" => "image/webp",
        "image/bmp" => "image/bmp",
        _ => "image/png",
    }
}

fn read_session(session: &Session) -> windows::core::Result<MediaSession> {
    let id = session.SourceAppUserModelId()?.to_string();
    let props = session.TryGetMediaPropertiesAsync()?.get()?;
    let title = props.Title()?.to_string();
    let artist = props.Artist()?.to_string();
    let album = props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default();

    let playback = session.GetPlaybackInfo()?;
    let playing = playback.PlaybackStatus()? == PlaybackStatus::Playing;
    let controls = playback.Controls()?;

    let timeline = session.GetTimelineProperties()?;
    let position_ms = timeline.Position()?.Duration as f64 / 10_000.0;
    let duration_ms = timeline.EndTime()?.Duration as f64 / 10_000.0;
    let updated_at_ms = (timeline.LastUpdatedTime()?.UniversalTime - FILETIME_UNIX_OFFSET) as f64 / 10_000.0;

    let key = format!("{id}|{title}|{artist}");
    let mut cache = THUMBNAILS.lock().unwrap();
    let cache = cache.get_or_insert_with(HashMap::new);
    if !cache.contains_key(&key) {
        // Navegadores às vezes publicam a capa um pouco depois do título: sem capa, tenta de novo
        // no próximo ciclo.
        if let Some(data) = props.Thumbnail().ok().and_then(read_thumbnail) {
            if cache.len() > 50 {
                cache.clear();
            }
            cache.insert(key.clone(), data);
        }
    }
    let thumbnail_key = cache.contains_key(&key).then_some(key);

    Ok(MediaSession {
        id,
        title,
        artist,
        album,
        playing,
        position_ms,
        duration_ms,
        updated_at_ms,
        thumbnail_key,
        can_next: controls.IsNextEnabled()?,
        can_prev: controls.IsPreviousEnabled()?,
        can_seek: controls.IsPlaybackPositionEnabled()?,
    })
}

fn read_state(manager: &SessionManager) -> windows::core::Result<MediaState> {
    let sessions = manager.GetSessions()?;
    let mut list = Vec::new();
    for session in sessions {
        if let Ok(info) = read_session(&session) {
            if !info.title.is_empty() {
                list.push(info);
            }
        }
    }
    let current = manager
        .GetCurrentSession()
        .ok()
        .and_then(|s| s.SourceAppUserModelId().ok())
        .map(|s| s.to_string());
    Ok(MediaState { sessions: list, current })
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let manager = loop {
            match SessionManager::RequestAsync().and_then(|op| op.get()) {
                Ok(m) => break m,
                Err(_) => std::thread::sleep(Duration::from_secs(5)),
            }
        };
        loop {
            if let Ok(state) = read_state(&manager) {
                let mut last = STATE.lock().unwrap();
                if last.as_ref() != Some(&state) {
                    let _ = app.emit("media-changed", &state);
                    *last = Some(state);
                }
            }
            std::thread::sleep(Duration::from_millis(1000));
        }
    });
}

#[tauri::command]
pub fn media_state() -> MediaState {
    STATE.lock().unwrap().clone().unwrap_or_default()
}

#[tauri::command]
pub fn media_thumbnail(key: String) -> Option<String> {
    THUMBNAILS.lock().unwrap().as_ref().and_then(|c| c.get(&key).cloned())
}

#[tauri::command]
pub async fn media_control(id: String, action: String, position_ms: Option<f64>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> windows::core::Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let manager = SessionManager::RequestAsync()?.get()?;
        for session in manager.GetSessions()? {
            if session.SourceAppUserModelId()?.to_string() != id {
                continue;
            }
            match action.as_str() {
                "toggle" => session.TryTogglePlayPauseAsync()?.get()?,
                "next" => session.TrySkipNextAsync()?.get()?,
                "prev" => session.TrySkipPreviousAsync()?.get()?,
                "seek" => {
                    let ticks = (position_ms.unwrap_or(0.0) * 10_000.0) as i64;
                    session.TryChangePlaybackPositionAsync(ticks)?.get()?
                }
                _ => false,
            };
            break;
        }
        Ok(())
    })
    .await
    .err_str()?
    .err_str()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumbnail_mime_is_whitelisted() {
        assert_eq!(safe_image_mime("image/jpeg"), "image/jpeg");
        assert_eq!(safe_image_mime(" IMAGE/WEBP "), "image/webp");
        assert_eq!(safe_image_mime(""), "image/png");
        assert_eq!(safe_image_mime("x),url(https://evil.example/a"), "image/png");
    }

    #[test]
    #[ignore = "smoke test: lê as sessões de mídia reais"]
    fn reads_media_sessions() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let manager = SessionManager::RequestAsync().unwrap().get().unwrap();
        println!("{:#?}", read_state(&manager).unwrap());
    }
}
