//! Widget de clima, pelo Open-Meteo (sem chave de API). A cidade vem das configurações.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::config::{ConfigState, WeatherLocation};
use crate::util::ErrStr;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Current {
    pub temperature: f64,
    pub apparent_temperature: f64,
    pub humidity: f64,
    /// Código WMO da condição.
    pub code: i64,
    pub is_day: bool,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hour {
    /// Hora local da cidade, `2026-10-16T16:00`.
    pub time: String,
    pub temperature: f64,
    pub code: i64,
    pub precipitation_probability: f64,
    pub is_day: bool,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub date: String,
    pub code: i64,
    pub min: f64,
    pub max: f64,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WeatherData {
    pub location: String,
    pub current: Option<Current>,
    /// A hora atual e as 5 seguintes.
    pub hourly: Vec<Hour>,
    pub daily: Vec<Day>,
    pub fetched_at: f64,
    pub error: Option<String>,
}

static CACHE: Mutex<Option<WeatherData>> = Mutex::new(None);

const HOURS: usize = 6;

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().user_agent("pier").timeout(Duration::from_secs(10)).build().err_str()
}

fn f64_at(v: &Value, key: &str, i: usize) -> f64 {
    v.get(key).and_then(|a| a.get(i)).and_then(Value::as_f64).unwrap_or(0.0)
}

fn i64_at(v: &Value, key: &str, i: usize) -> i64 {
    v.get(key).and_then(|a| a.get(i)).and_then(Value::as_i64).unwrap_or(0)
}

fn str_at(v: &Value, key: &str, i: usize) -> String {
    v.get(key).and_then(|a| a.get(i)).and_then(Value::as_str).unwrap_or_default().to_string()
}

pub fn parse_forecast(json: &Value) -> WeatherData {
    let current = json.get("current").map(|c| Current {
        temperature: c.get("temperature_2m").and_then(Value::as_f64).unwrap_or(0.0),
        apparent_temperature: c.get("apparent_temperature").and_then(Value::as_f64).unwrap_or(0.0),
        humidity: c.get("relative_humidity_2m").and_then(Value::as_f64).unwrap_or(0.0),
        code: c.get("weather_code").and_then(Value::as_i64).unwrap_or(0),
        is_day: c.get("is_day").and_then(Value::as_i64).unwrap_or(1) == 1,
    });

    // Os horários vêm no fuso da cidade (`timezone=auto`), como o `current.time`: a hora atual é
    // a que tem o mesmo prefixo `AAAA-MM-DDTHH`.
    let now_hour: String = json.pointer("/current/time").and_then(Value::as_str).unwrap_or_default().chars().take(13).collect();
    let hourly = json.get("hourly").cloned().unwrap_or(Value::Null);
    let times = hourly.get("time").and_then(Value::as_array).map(Vec::len).unwrap_or(0);
    let start = (0..times).find(|&i| str_at(&hourly, "time", i).starts_with(&now_hour)).unwrap_or(0);
    let hourly = (start..times.min(start + HOURS))
        .map(|i| Hour {
            time: str_at(&hourly, "time", i),
            temperature: f64_at(&hourly, "temperature_2m", i),
            code: i64_at(&hourly, "weather_code", i),
            precipitation_probability: f64_at(&hourly, "precipitation_probability", i),
            is_day: i64_at(&hourly, "is_day", i) == 1,
        })
        .collect();

    let daily = json.get("daily").cloned().unwrap_or(Value::Null);
    let days = daily.get("time").and_then(Value::as_array).map(Vec::len).unwrap_or(0);
    let daily = (0..days)
        .map(|i| Day {
            date: str_at(&daily, "time", i),
            code: i64_at(&daily, "weather_code", i),
            min: f64_at(&daily, "temperature_2m_min", i),
            max: f64_at(&daily, "temperature_2m_max", i),
        })
        .collect();

    WeatherData { current, hourly, daily, ..Default::default() }
}

async fn fetch(location: &WeatherLocation) -> Result<WeatherData, String> {
    let json: Value = client()?
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&[
            ("latitude", location.latitude.to_string()),
            ("longitude", location.longitude.to_string()),
            ("current", "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day".into()),
            ("hourly", "temperature_2m,weather_code,precipitation_probability,is_day".into()),
            ("daily", "weather_code,temperature_2m_max,temperature_2m_min".into()),
            ("forecast_days", "5".into()),
            ("timezone", "auto".into()),
        ])
        .send()
        .await
        .err_str()?
        .error_for_status()
        .err_str()?
        .json()
        .await
        .err_str()?;
    Ok(parse_forecast(&json))
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

#[tauri::command]
pub async fn weather_fetch(app: AppHandle, state: State<'_, ConfigState>) -> Result<WeatherData, String> {
    let location = state.0.lock().unwrap().weather_location.clone();
    let mut data = match location {
        None => WeatherData { error: Some("Escolha uma cidade nas configurações.".into()), ..Default::default() },
        Some(location) => match fetch(&location).await {
            Ok(data) => WeatherData { location: location.name, ..data },
            // Mantém a última previsão na tela, se for da mesma cidade, e só anexa o erro.
            Err(e) => {
                let last = CACHE.lock().unwrap().clone().filter(|d| d.location == location.name);
                WeatherData { error: Some(e), location: location.name, ..last.unwrap_or_default() }
            }
        },
    };
    data.fetched_at = now_ms();
    *CACHE.lock().unwrap() = Some(data.clone());
    let _ = app.emit("weather-updated", &data);
    Ok(data)
}

#[tauri::command]
pub fn weather_cached() -> Option<WeatherData> {
    CACHE.lock().unwrap().clone()
}

pub fn parse_geocoding(json: &Value) -> Vec<WeatherLocation> {
    json.get("results")
        .and_then(Value::as_array)
        .map(|results| {
            results
                .iter()
                .filter_map(|r| {
                    let text = |k: &str| r.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
                    let admin = [text("admin1"), text("country")].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>();
                    Some(WeatherLocation {
                        name: text("name"),
                        admin: admin.join(", "),
                        latitude: r.get("latitude")?.as_f64()?,
                        longitude: r.get("longitude")?.as_f64()?,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn weather_search(query: String) -> Result<Vec<WeatherLocation>, String> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Ok(vec![]);
    }
    let json: Value = client()?
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[("name", query), ("count", "6"), ("language", "pt"), ("format", "json")])
        .send()
        .await
        .err_str()?
        .error_for_status()
        .err_str()?
        .json()
        .await
        .err_str()?;
    Ok(parse_geocoding(&json))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_forecast_from_the_current_hour() {
        let json = json!({
            "current": { "time": "2026-10-16T15:45", "temperature_2m": 24.2, "apparent_temperature": 25.1,
                         "relative_humidity_2m": 62, "weather_code": 2, "is_day": 1 },
            "hourly": {
                "time": ["2026-10-16T14:00", "2026-10-16T15:00", "2026-10-16T16:00", "2026-10-16T17:00"],
                "temperature_2m": [25.0, 24.0, 23.0, 22.0],
                "weather_code": [1, 2, 61, 61],
                "precipitation_probability": [0, 10, 70, 80],
                "is_day": [1, 1, 1, 0]
            },
            "daily": { "time": ["2026-10-16"], "weather_code": [61], "temperature_2m_max": [27.4], "temperature_2m_min": [18.1] }
        });
        let data = parse_forecast(&json);
        let current = data.current.unwrap();
        assert_eq!(current.code, 2);
        assert_eq!(current.humidity, 62.0);
        assert_eq!(data.hourly.len(), 3);
        assert_eq!(data.hourly[0].time, "2026-10-16T15:00");
        assert_eq!(data.hourly[1].precipitation_probability, 70.0);
        assert!(!data.hourly[2].is_day);
        assert_eq!(data.daily[0].max, 27.4);
    }

    #[test]
    fn parses_geocoding_results() {
        let json = json!({ "results": [
            { "name": "Campinas", "admin1": "São Paulo", "country": "Brasil", "latitude": -22.9, "longitude": -47.06 },
            { "name": "Sem coordenadas" }
        ]});
        let found = parse_geocoding(&json);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].admin, "São Paulo, Brasil");
        assert!(parse_geocoding(&json!({})).is_empty());
    }
}
