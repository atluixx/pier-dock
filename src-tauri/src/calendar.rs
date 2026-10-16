//! Widget de agenda: lê um calendário pelo endereço iCal (.ics) que o Google, o Outlook e o iCloud
//! publicam. O endereço dá acesso de leitura à agenda inteira, então fica no cofre de senhas do
//! sistema e nunca chega ao WebView, como o token do GitHub.

use std::str::FromStr;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeZone, Utc};
use rrule::{RRule, RRuleSet, Tz, Unvalidated};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::util::ErrStr;

const KEYRING_SERVICE: &str = "pier";
const KEYRING_USER: &str = "calendar";
const MAX_ICS_BYTES: usize = 20 * 1024 * 1024;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub all_day: bool,
    pub location: String,
    pub meeting_url: Option<String>,
    pub attendees: u32,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CalendarData {
    pub configured: bool,
    /// Eventos de hoje e de amanhã, em ordem de início.
    pub events: Vec<CalendarEvent>,
    pub fetched_at: f64,
    pub error: Option<String>,
}

static CACHE: Mutex<Option<CalendarData>> = Mutex::new(None);

struct Property {
    name: String,
    params: Vec<(String, String)>,
    value: String,
}

impl Property {
    fn param(&self, name: &str) -> Option<&str> {
        self.params.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
}

/// Linhas que começam com espaço ou tab continuam a anterior (RFC 5545, 3.1).
fn unfold(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in text.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        match (line.strip_prefix(' ').or_else(|| line.strip_prefix('\t')), lines.last_mut()) {
            (Some(rest), Some(last)) => last.push_str(rest),
            _ if !line.is_empty() => lines.push(line.to_string()),
            _ => {}
        }
    }
    lines
}

fn parse_property(line: &str) -> Option<Property> {
    let mut quoted = false;
    let colon = line.char_indices().find(|&(_, c)| {
        if c == '"' {
            quoted = !quoted;
        }
        c == ':' && !quoted
    })?;
    let (head, value) = (&line[..colon.0], &line[colon.0 + 1..]);
    let mut parts = head.split(';');
    let name = parts.next()?.to_ascii_uppercase();
    let params = parts
        .filter_map(|p| p.split_once('='))
        .map(|(k, v)| (k.to_ascii_uppercase(), v.trim_matches('"').to_string()))
        .collect();
    Some(Property { name, params, value: value.to_string() })
}

fn unescape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n' | 'N') => out.push('\n'),
            Some(other) => out.push(other),
            None => {}
        }
    }
    out
}

/// O TZID costuma ser um nome IANA (`America/Sao_Paulo`). O Outlook usa nomes do Windows
/// (`E. South America Standard Time`), que o chrono-tz não conhece: nesse caso o horário é lido
/// como local, o que acerta sempre que a agenda está no fuso do computador.
fn timezone(tzid: Option<&str>) -> Tz {
    tzid.and_then(|id| chrono_tz::Tz::from_str(id.trim_start_matches('/')).ok())
        .map(Tz::from)
        .unwrap_or(Tz::LOCAL)
}

/// `20261016T160000Z`, `20261016T160000` (com TZID ou flutuante) ou `20261016` (dia inteiro).
fn parse_datetime(prop: &Property) -> Option<(DateTime<Tz>, bool)> {
    let value = prop.value.trim();
    if value.len() == 8 || prop.param("VALUE") == Some("DATE") {
        let date = NaiveDate::parse_from_str(&value[..8.min(value.len())], "%Y%m%d").ok()?;
        let midnight = date.and_hms_opt(0, 0, 0)?;
        return Some((Tz::LOCAL.from_local_datetime(&midnight).earliest()?, true));
    }
    if let Some(utc) = value.strip_suffix('Z') {
        let naive = NaiveDateTime::parse_from_str(utc, "%Y%m%dT%H%M%S").ok()?;
        return Some((Utc.from_utc_datetime(&naive).with_timezone(&Tz::UTC), false));
    }
    let naive = NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S").ok()?;
    Some((timezone(prop.param("TZID")).from_local_datetime(&naive).earliest()?, false))
}

/// `PT1H30M`, `P1D`, `P1W`… (só o que eventos usam na prática).
fn parse_duration(value: &str) -> Option<chrono::Duration> {
    let (negative, rest) = match value.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, value.strip_prefix('+').unwrap_or(value)),
    };
    let rest = rest.strip_prefix('P')?;
    let mut seconds = 0i64;
    let mut number = String::new();
    for c in rest.chars() {
        match c {
            'T' => {}
            '0'..='9' => number.push(c),
            unit => {
                let n: i64 = number.parse().ok()?;
                number.clear();
                seconds += n * match unit {
                    'W' => 7 * 86_400,
                    'D' => 86_400,
                    'H' => 3_600,
                    'M' => 60,
                    'S' => 1,
                    _ => return None,
                };
            }
        }
    }
    Some(chrono::Duration::seconds(if negative { -seconds } else { seconds }))
}

const MEETING_HOSTS: [&str; 6] = ["meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "webex.com", "whereby.com"];

/// Primeiro link de videochamada no texto.
fn meeting_link(text: &str) -> Option<String> {
    text.split(|c: char| c.is_whitespace() || matches!(c, '"' | '<' | '>' | '(' | ')' | '[' | ']'))
        .filter(|token| token.starts_with("https://"))
        .map(|token| token.trim_end_matches(['.', ',', ';']))
        .find(|url| {
            let host = url["https://".len()..].split(['/', '?', '#']).next().unwrap_or_default();
            MEETING_HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")))
        })
        .map(String::from)
}

struct RawEvent {
    props: Vec<Property>,
}

impl RawEvent {
    fn get(&self, name: &str) -> Option<&Property> {
        self.props.iter().find(|p| p.name == name)
    }

    fn all<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Property> {
        self.props.iter().filter(move |p| p.name == name)
    }

    fn text(&self, name: &str) -> String {
        self.get(name).map(|p| unescape(&p.value)).unwrap_or_default()
    }
}

fn raw_events(text: &str) -> Vec<RawEvent> {
    let mut events = Vec::new();
    let mut current: Option<RawEvent> = None;
    // Componentes dentro do VEVENT (VALARM) têm propriedades próprias que não são do evento.
    let mut nested = 0u32;
    for line in unfold(text) {
        let Some(prop) = parse_property(&line) else { continue };
        match (prop.name.as_str(), prop.value.to_ascii_uppercase().as_str()) {
            ("BEGIN", "VEVENT") => current = Some(RawEvent { props: Vec::new() }),
            ("END", "VEVENT") => events.extend(current.take()),
            ("BEGIN", _) if current.is_some() => nested += 1,
            ("END", _) if current.is_some() => nested = nested.saturating_sub(1),
            _ if nested == 0 => {
                if let Some(event) = current.as_mut() {
                    event.props.push(prop);
                }
            }
            _ => {}
        }
    }
    events
}

/// Momentos de início do evento dentro da janela, expandindo a recorrência.
fn occurrences(event: &RawEvent, start: DateTime<Tz>, length: chrono::Duration, from: DateTime<Tz>, to: DateTime<Tz>) -> Vec<DateTime<Tz>> {
    let rules: Vec<_> = event.all("RRULE").collect();
    if rules.is_empty() {
        return vec![start];
    }
    let dates = |name: &str| -> Vec<DateTime<Tz>> {
        event
            .all(name)
            .flat_map(|p| {
                p.value.split(',').filter_map(|v| parse_datetime(&Property { value: v.to_string(), name: p.name.clone(), params: p.params.clone() }))
            })
            .map(|(dt, _)| dt)
            .collect()
    };
    let mut set = RRuleSet::new(start);
    for rule in rules {
        let Ok(rule) = RRule::<Unvalidated>::from_str(&rule.value) else { return vec![start] };
        match rule.validate(start) {
            Ok(rule) => set = set.rrule(rule),
            Err(_) => return vec![start],
        }
    }
    set = dates("RDATE").into_iter().fold(set, RRuleSet::rdate);
    set = dates("EXDATE").into_iter().fold(set, RRuleSet::exdate);
    set.after(from - length - chrono::Duration::seconds(1)).before(to).all(500).dates
}

/// Eventos que acontecem (mesmo em parte) entre `from` e `to`.
pub fn events_between(ics: &str, from: DateTime<Tz>, to: DateTime<Tz>) -> Vec<CalendarEvent> {
    let raw = raw_events(ics);
    // Instâncias alteradas de uma série (RECURRENCE-ID) substituem a ocorrência original.
    let overridden: Vec<(String, i64)> = raw
        .iter()
        .filter_map(|e| Some((e.text("UID"), parse_datetime(e.get("RECURRENCE-ID")?)?.0.timestamp_millis())))
        .collect();

    let mut out = Vec::new();
    for event in &raw {
        if event.text("STATUS").eq_ignore_ascii_case("CANCELLED") {
            continue;
        }
        let Some((start, all_day)) = event.get("DTSTART").and_then(parse_datetime) else { continue };
        let length = match (event.get("DTEND").and_then(parse_datetime), event.get("DURATION")) {
            (Some((end, _)), _) => end - start,
            (None, Some(d)) => parse_duration(&d.value).unwrap_or_default(),
            (None, None) if all_day => chrono::Duration::days(1),
            _ => chrono::Duration::zero(),
        };
        let uid = event.text("UID");
        let is_override = event.get("RECURRENCE-ID").is_some();
        let location = event.text("LOCATION");
        let meeting_url = ["X-GOOGLE-CONFERENCE", "URL", "LOCATION", "DESCRIPTION"]
            .iter()
            .find_map(|name| meeting_link(&event.text(name)));
        let attendees = event.all("ATTENDEE").count() as u32;

        for occurrence in occurrences(event, start, length, from, to) {
            let start_ms = occurrence.timestamp_millis();
            let end_ms = (occurrence + length).timestamp_millis();
            if end_ms <= from.timestamp_millis() || start_ms >= to.timestamp_millis() {
                continue;
            }
            if !is_override && overridden.iter().any(|(u, at)| *u == uid && *at == start_ms) {
                continue;
            }
            out.push(CalendarEvent {
                id: format!("{uid}@{start_ms}"),
                title: event.text("SUMMARY"),
                start_ms,
                end_ms,
                all_day,
                location: location.clone(),
                meeting_url: meeting_url.clone(),
                attendees,
            });
        }
    }
    out.sort_by_key(|e| (e.start_ms, e.end_ms));
    out
}

fn stored_url() -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?.get_password().ok().filter(|u| !u.is_empty())
}

/// `webcal://` é o mesmo endereço por HTTPS; outros esquemas são recusados.
fn normalize_url(url: &str) -> Result<String, String> {
    let url = url.trim();
    let url = match url.strip_prefix("webcal://") {
        Some(rest) => format!("https://{rest}"),
        None => url.to_string(),
    };
    if !url.starts_with("https://") || url.len() <= "https://".len() {
        return Err("o endereço do calendário precisa começar com https:// ou webcal://".into());
    }
    Ok(url)
}

async fn download(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder().user_agent("pier").timeout(Duration::from_secs(20)).build().err_str()?;
    let bytes = client.get(url).send().await.err_str()?.error_for_status().err_str()?.bytes().await.err_str()?;
    if bytes.len() > MAX_ICS_BYTES {
        return Err("o calendário é grande demais".into());
    }
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if !text.contains("BEGIN:VCALENDAR") {
        return Err("o endereço não devolveu um calendário iCal".into());
    }
    Ok(text)
}

/// Do início de hoje ao fim de amanhã, no fuso do computador.
fn window() -> (DateTime<Tz>, DateTime<Tz>) {
    let today = chrono::Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap_or_default();
    let from = Tz::LOCAL.from_local_datetime(&today).earliest().unwrap_or_else(|| Utc::now().with_timezone(&Tz::LOCAL));
    (from, from + chrono::Duration::days(2))
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

#[tauri::command]
pub async fn calendar_fetch(app: AppHandle) -> Result<CalendarData, String> {
    let url = tauri::async_runtime::spawn_blocking(stored_url).await.err_str()?;
    let mut data = match url {
        None => CalendarData::default(),
        Some(url) => match download(&url).await {
            Ok(ics) => {
                let (from, to) = window();
                let events = tauri::async_runtime::spawn_blocking(move || events_between(&ics, from, to)).await.err_str()?;
                CalendarData { configured: true, events, ..Default::default() }
            }
            // Mantém os últimos eventos na tela e só anexa o erro.
            Err(e) => CalendarData {
                configured: true,
                error: Some(e),
                events: CACHE.lock().unwrap().as_ref().map(|d| d.events.clone()).unwrap_or_default(),
                ..Default::default()
            },
        },
    };
    data.fetched_at = now_ms();
    *CACHE.lock().unwrap() = Some(data.clone());
    let _ = app.emit("calendar-updated", &data);
    Ok(data)
}

#[tauri::command]
pub fn calendar_cached() -> Option<CalendarData> {
    CACHE.lock().unwrap().clone()
}

/// Salva o endereço iCal no cofre de senhas; `None` ou vazio apaga.
#[tauri::command]
pub fn calendar_set_url(url: Option<String>) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).err_str()?;
    match url.filter(|u| !u.trim().is_empty()) {
        Some(url) => entry.set_password(&normalize_url(&url)?).err_str(),
        None => {
            *CACHE.lock().unwrap() = None;
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(e.to_string()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(s: &str) -> DateTime<Tz> {
        Utc.from_utc_datetime(&NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()).with_timezone(&Tz::UTC)
    }

    const GOOGLE: &str = "BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
DTSTART;TZID=America/Sao_Paulo:20260901T160000\r
DTEND;TZID=America/Sao_Paulo:20260901T163000\r
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r
EXDATE;TZID=America/Sao_Paulo:20261015T160000\r
UID:daily@google.com\r
SUMMARY:Daily do time\r
ATTENDEE;CN=ana:mailto:ana@x.com\r
ATTENDEE;CN=bruno:mailto:bruno@x.com\r
X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij\r
DESCRIPTION:Entre pelo link\\, por favor:\\nhttps://meet.google.com/abc-defg-hij\r
BEGIN:VALARM\r
ACTION:DISPLAY\r
SUMMARY:Lembrete\r
END:VALARM\r
END:VEVENT\r
BEGIN:VEVENT\r
DTSTART;TZID=America/Sao_Paulo:20261016T173000\r
DTEND;TZID=America/Sao_Paulo:20261016T183000\r
RECURRENCE-ID;TZID=America/Sao_Paulo:20261016T160000\r
UID:daily@google.com\r
SUMMARY:Daily do time (remarcada)\r
END:VEVENT\r
BEGIN:VEVENT\r
DTSTART;VALUE=DATE:20261016\r
DTEND;VALUE=DATE:20261017\r
UID:feriado@google.com\r
SUMMARY:Dia inteiro\r
END:VEVENT\r
BEGIN:VEVENT\r
DTSTART:20261016T200000Z\r
DURATION:PT45M\r
UID:cancelado@google.com\r
STATUS:CANCELLED\r
SUMMARY:Cancelado\r
END:VEVENT\r
END:VCALENDAR\r
";

    #[test]
    fn expands_weekly_recurrence_with_exdate_and_override() {
        // 14 a 17 de outubro de 2026 (qua a sáb), em UTC; 16h em São Paulo = 19h UTC.
        let events = events_between(GOOGLE, utc("2026-10-14 00:00"), utc("2026-10-18 00:00"));
        let daily: Vec<_> = events.iter().filter(|e| e.id.starts_with("daily@")).collect();
        let starts: Vec<_> = daily.iter().map(|e| (e.title.as_str(), e.start_ms)).collect();
        assert_eq!(
            starts,
            vec![
                ("Daily do time", utc("2026-10-14 19:00").timestamp_millis()),
                ("Daily do time (remarcada)", utc("2026-10-16 20:30").timestamp_millis()),
            ]
        );
        assert_eq!(daily[0].end_ms - daily[0].start_ms, 30 * 60_000);
        assert_eq!(daily[0].meeting_url.as_deref(), Some("https://meet.google.com/abc-defg-hij"));
        assert_eq!(daily[0].attendees, 2);
        assert!(events.iter().any(|e| e.all_day && e.title == "Dia inteiro"));
        assert!(!events.iter().any(|e| e.title == "Cancelado"));
    }

    #[test]
    fn reads_outlook_style_events() {
        let ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:040000008200E00074C5B7101A82E008\nSUMMARY;LANGUAGE=pt-BR:Revisão de design\nDTSTART;TZID=E. South America Standard Time:20261016T173000\nDTEND;TZID=E. South America Standard Time:20261016T183000\nLOCATION:Sala 2\nDESCRIPTION:Reunião do Microsoft Teams\\n<https://teams.microsoft.com/l/meetup-join/19%3ameeting>\nEND:VEVENT\nEND:VCALENDAR\n";
        let events = events_between(ics, utc("2026-10-15 00:00"), utc("2026-10-18 00:00"));
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Revisão de design");
        assert_eq!(events[0].location, "Sala 2");
        assert_eq!(events[0].meeting_url.as_deref(), Some("https://teams.microsoft.com/l/meetup-join/19%3ameeting"));
        assert_eq!(events[0].end_ms - events[0].start_ms, 60 * 60_000);
    }

    #[test]
    fn unfolds_long_lines() {
        let lines = unfold("SUMMARY:Planejamento\r\n  da sprint\r\nUID:1\r\n");
        assert_eq!(lines, vec!["SUMMARY:Planejamento da sprint", "UID:1"]);
    }

    #[test]
    fn parses_durations() {
        assert_eq!(parse_duration("PT1H30M"), Some(chrono::Duration::minutes(90)));
        assert_eq!(parse_duration("P1D"), Some(chrono::Duration::days(1)));
        assert_eq!(parse_duration("-PT15M"), Some(chrono::Duration::minutes(-15)));
        assert_eq!(parse_duration("1H"), None);
    }

    #[test]
    fn only_https_calendar_urls() {
        assert_eq!(normalize_url("webcal://p01.icloud.com/x.ics").unwrap(), "https://p01.icloud.com/x.ics");
        assert!(normalize_url("http://example.com/a.ics").is_err());
        assert!(normalize_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn finds_meeting_links_only() {
        assert_eq!(meeting_link("Sala 2"), None);
        assert_eq!(meeting_link("https://example.com/x"), None);
        assert_eq!(meeting_link("Zoom: https://us02web.zoom.us/j/123?pwd=a."), Some("https://us02web.zoom.us/j/123?pwd=a".into()));
    }
}
