//! Mídia no Linux via MPRIS: cada player (Spotify, Chrome/Firefox com YouTube Music, Rhythmbox…)
//! publica `org.mpris.MediaPlayer2.<nome>` no session bus. O id da sessão é esse nome.

use std::collections::HashMap;
use std::time::Duration;

use tauri::AppHandle;
use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value};

use super::{fetch_image, image_data_url, now_ms, publish, thumbnail_key, MediaSession, MediaState, MAX_ART_BYTES};
use crate::platform::linux::dbus;

const PREFIX: &str = "org.mpris.MediaPlayer2.";
const PATH: &str = "/org/mpris/MediaPlayer2";
const PLAYER: &str = "org.mpris.MediaPlayer2.Player";

type Metadata = HashMap<String, OwnedValue>;

fn players() -> Vec<String> {
    let Some(conn) = dbus::session() else { return Vec::new() };
    let Ok(bus) = zbus::blocking::fdo::DBusProxy::new(conn) else { return Vec::new() };
    let mut names: Vec<String> = bus
        .list_names()
        .unwrap_or_default()
        .into_iter()
        .map(|n| n.to_string())
        .filter(|n| n.starts_with(PREFIX))
        .collect();
    names.sort();
    names
}

fn player(name: &str) -> Option<zbus::blocking::Proxy<'static>> {
    // Só players MPRIS: o id vem do frontend e não pode apontar para outro serviço.
    if !name.starts_with(PREFIX) {
        return None;
    }
    dbus::proxy(dbus::session()?, name, PATH, PLAYER)
}

fn text(metadata: &Metadata, key: &str) -> String {
    match metadata.get(key).map(|v| &**v) {
        Some(Value::Str(s)) => s.to_string(),
        // `xesam:artist` é uma lista.
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| if let Value::Str(s) = v { Some(s.to_string()) } else { None })
            .collect::<Vec<_>>()
            .join(", "),
        _ => String::new(),
    }
}

fn number(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::I64(n) => Some(*n as f64),
        Value::U64(n) => Some(*n as f64),
        Value::I32(n) => Some(*n as f64),
        Value::U32(n) => Some(*n as f64),
        Value::F64(n) => Some(*n),
        _ => None,
    }
}

fn track_id(metadata: &Metadata) -> Option<OwnedObjectPath> {
    match metadata.get("mpris:trackid").map(|v| &**v) {
        Some(Value::ObjectPath(p)) => Some(p.clone().into()),
        Some(Value::Str(s)) => OwnedObjectPath::try_from(s.to_string()).ok(),
        _ => None,
    }
}

/// Capa a partir do `mpris:artUrl`: arquivo local ou HTTPS (Spotify usa i.scdn.co).
fn read_art(url: &str) -> Option<String> {
    if let Some(path) = url.strip_prefix("file://") {
        let path = percent_decode(path);
        let bytes = std::fs::read(&path).ok().filter(|b| b.len() <= MAX_ART_BYTES)?;
        let ext = path.rsplit('.').next().unwrap_or_default().to_ascii_lowercase();
        return Some(image_data_url(&format!("image/{ext}"), &bytes));
    }
    fetch_image(url)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(b) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn read_player(name: &str) -> Option<MediaSession> {
    let proxy = player(name)?;
    let metadata: Metadata = proxy.get_property("Metadata").ok()?;
    let title = text(&metadata, "xesam:title");
    if title.is_empty() {
        return None;
    }
    let artist = text(&metadata, "xesam:artist");
    let status: String = proxy.get_property("PlaybackStatus").unwrap_or_default();
    let position_us: i64 = proxy.get_property("Position").unwrap_or(0);
    let art = text(&metadata, "mpris:artUrl");
    Some(MediaSession {
        id: name.to_string(),
        album: text(&metadata, "xesam:album"),
        playing: status == "Playing",
        position_ms: position_us as f64 / 1000.0,
        duration_ms: number(metadata.get("mpris:length").map(|v| &**v)).unwrap_or(0.0) / 1000.0,
        updated_at_ms: now_ms(),
        thumbnail_key: thumbnail_key(name, &title, &artist, || read_art(&art)),
        can_next: proxy.get_property("CanGoNext").unwrap_or(false),
        can_prev: proxy.get_property("CanGoPrevious").unwrap_or(false),
        can_seek: proxy.get_property("CanSeek").unwrap_or(false),
        title,
        artist,
    })
}

fn read_state() -> MediaState {
    let sessions: Vec<MediaSession> = players().iter().filter_map(|n| read_player(n)).collect();
    let current = sessions.iter().find(|s| s.playing).or(sessions.first()).map(|s| s.id.clone());
    MediaState { sessions, current }
}

pub fn run(app: &AppHandle) {
    loop {
        publish(app, read_state());
        std::thread::sleep(Duration::from_millis(1000));
    }
}

pub fn control(id: &str, action: &str, position_ms: Option<f64>) -> Result<(), String> {
    let proxy = player(id).ok_or(crate::i18n::tr("player não encontrado", "player not found"))?;
    let call = |method: &str| proxy.call_method(method, &()).map(|_| ()).map_err(|e| e.to_string());
    match action {
        "toggle" => call("PlayPause"),
        "next" => call("Next"),
        "prev" => call("Previous"),
        "seek" => {
            let target_us = (position_ms.unwrap_or(0.0) * 1000.0) as i64;
            let metadata: Metadata = proxy.get_property("Metadata").map_err(|e| e.to_string())?;
            match track_id(&metadata) {
                Some(track) => proxy.call_method("SetPosition", &(track, target_us)).map(|_| ()),
                None => {
                    let current: i64 = proxy.get_property("Position").unwrap_or(0);
                    proxy.call_method("Seek", &(target_us - current)).map(|_| ())
                }
            }
            .map_err(|e| e.to_string())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_file_urls() {
        assert_eq!(percent_decode("/home/a/Capa%20do%20%C3%A1lbum.jpg"), "/home/a/Capa do álbum.jpg");
        assert_eq!(percent_decode("/tmp/100%"), "/tmp/100%");
    }

    #[test]
    #[ignore = "smoke test: lê os players MPRIS reais"]
    fn reads_media_sessions() {
        println!("{:#?}", read_state());
    }
}
