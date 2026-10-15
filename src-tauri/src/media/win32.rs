//! Mídia no Windows via System Media Transport Controls: uma única API cobre o Spotify desktop, o
//! YouTube Music (PWA ou aba do Chrome/Edge) e qualquer outro app que mostre controles de mídia.

use std::time::Duration;

use tauri::AppHandle;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::{image_data_url, publish, thumbnail_key, MediaSession, MediaState};
use crate::util::ErrStr;

/// Diferença entre a época do FILETIME (1601) e a do Unix, em unidades de 100ns.
const FILETIME_UNIX_OFFSET: i64 = 116_444_736_000_000_000;

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
    Some(image_data_url(&content_type, &buf))
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

    let thumbnail_key = thumbnail_key(&id, &title, &artist, || props.Thumbnail().ok().and_then(read_thumbnail));

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

pub fn run(app: &AppHandle) {
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
            publish(app, state);
        }
        std::thread::sleep(Duration::from_millis(1000));
    }
}

pub fn control(id: &str, action: &str, position_ms: Option<f64>) -> Result<(), String> {
    (|| -> windows::core::Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let manager = SessionManager::RequestAsync()?.get()?;
        for session in manager.GetSessions()? {
            if session.SourceAppUserModelId()?.to_string() != id {
                continue;
            }
            match action {
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
    })()
    .err_str()
}

#[cfg(test)]
mod tests {
    use super::*;

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
