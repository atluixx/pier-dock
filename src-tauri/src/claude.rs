//! Uso do Claude Code: percentuais reais de limite + contagem de tokens.
//!
//! Duas fontes locais, com papéis diferentes:
//!
//! 1. `~/.claude.json`, campo `cachedUsageUtilization` — os percentuais REAIS da sessão de 5h e da
//!    semana. É a mesma fonte do comando `/usage`: o próprio Claude Code busca da API e guarda ali.
//!    Só é renovado enquanto ele está aberto, então a idade do dado importa (ver `STALE_MINUTES`).
//! 2. `~/.claude/projects/**/*.jsonl` — os transcripts, de onde saem as contagens de tokens. Eles
//!    não têm os limites (o `rateLimits` deles vem sempre nulo); tokens e percentual de limite são
//!    coisas separadas e não se convertem uma na outra.
//!
//! Nada sai para a rede. Do transcript são lidos apenas os campos numéricos de `usage`, o nome do
//! modelo e o timestamp — nunca o conteúdo das conversas. Do `.claude.json`, que também guarda
//! e-mail, uuids da conta e os caminhos de todos os projetos, só `cachedUsageUtilization` é tocado.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Local, Timelike, Utc};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::util::ErrStr;

/// Transcript mais velho que isso não influencia nem "hoje" nem o bloco de 5h, então nem é aberto.
/// É o que derruba a varredura de centenas de arquivos para um punhado.
const LOOKBACK_HOURS: i64 = 48;

/// Tamanho da janela de uso que o Claude Code chama de "sessão".
const BLOCK_HOURS: i64 = 5;

/// Acima disso o percentual é considerado velho. O cache só é renovado enquanto o Claude Code roda:
/// com ele fechado o número congela, e mostrar um valor parado como se fosse atual seria pior do
/// que avisar.
const STALE_MINUTES: i64 = 15;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUsage {
    /// Percentuais reais do `/usage`. `None` quer dizer desconhecido — cache ausente ou janela que
    /// já virou —, nunca zero.
    pub session_percent: Option<i64>,
    /// Minutos até o reset da janela de 5h.
    pub session_resets_in: Option<i64>,
    pub weekly_percent: Option<i64>,
    pub weekly_resets_in: Option<i64>,
    /// Idade do cache de limites, em minutos.
    pub age_min: Option<i64>,
    pub stale: bool,
    /// Tokens somados dos transcripts (entrada + saída + escrita e leitura de cache).
    pub today_tokens: i64,
    pub today_messages: i64,
    pub block_tokens: i64,
    pub top_model: Option<String>,
    pub fetched_at: f64,
    pub error: Option<String>,
}

static CACHE: Mutex<Option<ClaudeUsage>> = Mutex::new(None);

// --- caminhos ---------------------------------------------------------------

/// Pasta de dados do Claude Code: `$CLAUDE_CONFIG_DIR` ou `~/.claude`.
fn config_root() -> PathBuf {
    match std::env::var_os("CLAUDE_CONFIG_DIR") {
        Some(dir) if !dir.is_empty() => PathBuf::from(dir),
        _ => dirs::home_dir().unwrap_or_else(|| ".".into()).join(".claude"),
    }
}

/// O `.claude.json` fica ao lado da pasta `.claude`, mas acompanha o `CLAUDE_CONFIG_DIR` quando ele
/// existe. Devolve o primeiro candidato que existir, para não depender de qual deles o CLI criou.
fn claude_json() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| ".".into());
    let candidates = [config_root().join(".claude.json"), home.join(".claude.json")];
    candidates.iter().find(|p| p.is_file()).cloned().unwrap_or_else(|| candidates[1].clone())
}

fn projects_dir() -> PathBuf {
    config_root().join("projects")
}

// --- limites reais (~/.claude.json) -----------------------------------------

#[derive(Debug, Default, PartialEq)]
pub struct Limits {
    pub session_percent: Option<i64>,
    pub session_resets_in: Option<i64>,
    pub weekly_percent: Option<i64>,
    pub weekly_resets_in: Option<i64>,
    pub age_min: Option<i64>,
    pub stale: bool,
}

/// Minutos daqui até um timestamp ISO. Negativo se já passou.
fn minutes_until(iso: Option<&str>, now: DateTime<Utc>) -> Option<i64> {
    let when = DateTime::parse_from_rfc3339(iso?).ok()?;
    Some((when.with_timezone(&Utc) - now).num_minutes())
}

/// Converte o `cachedUsageUtilization` nos percentuais da sessão de 5h e da semana.
///
/// `limits` é a lista que alimenta o `/usage`: o `kind` "session" é a janela de 5h, "weekly_all" é
/// a de 7 dias.
pub fn parse_limits(cache: &Value, now: DateTime<Utc>) -> Limits {
    let mut out = Limits { stale: true, ..Default::default() };

    if let Some(fetched) = cache.get("fetchedAtMs").and_then(Value::as_f64) {
        let age = ((now.timestamp_millis() as f64 - fetched) / 60_000.0) as i64;
        out.age_min = Some(age.max(0));
        out.stale = age > STALE_MINUTES;
    }

    for entry in cache.pointer("/utilization/limits").and_then(Value::as_array).into_iter().flatten() {
        let percent = entry.get("percent").and_then(Value::as_i64);
        let resets_in = minutes_until(entry.get("resets_at").and_then(Value::as_str), now);
        match entry.get("kind").and_then(Value::as_str) {
            Some("session") => (out.session_percent, out.session_resets_in) = (percent, resets_in),
            Some("weekly_all") => (out.weekly_percent, out.weekly_resets_in) = (percent, resets_in),
            _ => continue,
        }
    }

    // Se a janela já virou, o cache descreve um período que acabou. O percentual provavelmente
    // zerou, mas não dá para afirmar sem o Claude Code buscar de novo — então devolve desconhecido
    // em vez de um número errado.
    if out.session_resets_in.is_some_and(|m| m <= 0) {
        out.session_percent = None;
    }
    if out.weekly_resets_in.is_some_and(|m| m <= 0) {
        out.weekly_percent = None;
    }
    out
}

fn read_limits(now: DateTime<Utc>) -> Limits {
    let unknown = || Limits { stale: true, ..Default::default() };
    let Ok(text) = std::fs::read_to_string(claude_json()) else { return unknown() };
    let Ok(json) = serde_json::from_str::<Value>(&text) else { return unknown() };
    json.get("cachedUsageUtilization").map_or_else(unknown, |cache| parse_limits(cache, now))
}

// --- tokens (transcripts) ---------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    pub when: DateTime<Local>,
    pub tokens: i64,
    pub model: Option<String>,
}

/// Transcripts modificados dentro da janela de lookback, em qualquer nível abaixo de `root`.
///
/// A varredura é recursiva porque a sessão principal fica em `projects/<slug>/<sessão>.jsonl` mas
/// os subagentes gravam em `projects/<slug>/<sessão>/subagents/agent-*.jsonl` — e o que eles gastam
/// conta no mesmo limite. Só diretórios de verdade entram na pilha, para um link não virar laço.
fn recent_files_in(root: PathBuf, cutoff: SystemTime) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut pending = vec![root];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                pending.push(entry.path());
            } else if entry.path().extension().is_some_and(|ext| ext == "jsonl")
                && entry.metadata().and_then(|m| m.modified()).is_ok_and(|m| m >= cutoff)
            {
                files.push(entry.path());
            }
        }
    }
    files
}

fn recent_files() -> Vec<PathBuf> {
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs((LOOKBACK_HOURS * 3600) as u64))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    recent_files_in(projects_dir(), cutoff)
}

/// Converte uma linha do transcript num evento, com a chave de deduplicação.
///
/// Os transcripts repetem a mesma mensagem várias vezes, uma por iteração do stream, então sem
/// deduplicar por `(message.id, requestId)` os totais saem inflados em 2-3x.
pub fn parse_event(line: &str) -> Option<((String, String), Event)> {
    let record: Value = serde_json::from_str(line).ok()?;
    if record.get("type").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    let usage = record.pointer("/message/usage")?;
    let timestamp = record.get("timestamp").and_then(Value::as_str)?;
    // Os timestamps vêm em UTC; converte para o fuso local, senão o contador de "hoje" viraria o
    // dia às 21h.
    let when = DateTime::parse_from_rfc3339(timestamp).ok()?.with_timezone(&Local);

    let field = |name| usage.get(name).and_then(Value::as_i64).unwrap_or(0);
    let tokens = field("input_tokens")
        + field("output_tokens")
        + field("cache_creation_input_tokens")
        + field("cache_read_input_tokens");

    let text = |pointer| record.pointer(pointer).and_then(Value::as_str).unwrap_or_default().to_string();
    let key = (text("/message/id"), text("/requestId"));
    let model = record.pointer("/message/model").and_then(Value::as_str).map(String::from);
    Some((key, Event { when, tokens, model }))
}

/// Eventos dos transcripts recentes, deduplicados e ordenados por tempo.
fn collect_events() -> Vec<Event> {
    let mut seen = HashSet::new();
    let mut events = Vec::new();
    for path in recent_files() {
        let Ok(file) = std::fs::File::open(&path) else { continue };
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            // Filtro barato antes de pagar o custo do parse de JSON.
            if !line.contains("\"usage\"") {
                continue;
            }
            if let Some((key, event)) = parse_event(&line) {
                if seen.insert(key) {
                    events.push(event);
                }
            }
        }
    }
    events.sort_by_key(|e| e.when);
    events
}

/// Tokens do bloco de 5h em andamento.
///
/// Um bloco novo começa quando passam 5h do início do bloco atual ou quando há um intervalo de mais
/// de 5h sem atividade. O início é arredondado para baixo na hora cheia. Mesma regra do ccusage.
pub fn active_block(events: &[Event], now: DateTime<Local>) -> i64 {
    let window = chrono::Duration::hours(BLOCK_HOURS);
    let mut start: Option<DateTime<Local>> = None;
    let mut last: Option<DateTime<Local>> = None;
    let mut total = 0;

    for event in events {
        let gap = last.map_or(0, |l| (event.when - l).num_seconds());
        let elapsed = start.map_or(0, |s| (event.when - s).num_seconds());
        if start.is_none() || elapsed > window.num_seconds() || gap > window.num_seconds() {
            let hour = event.when.with_minute(0).and_then(|d| d.with_second(0)).and_then(|d| d.with_nanosecond(0));
            start = Some(hour.unwrap_or(event.when));
            total = 0;
        }
        total += event.tokens;
        last = Some(event.when);
    }

    match start {
        // Passadas as 5h do início, o bloco expirou e não há uso corrente.
        Some(start) if now < start + window => total,
        _ => 0,
    }
}

fn now_ms() -> f64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

/// Snapshot completo: limites reais + tokens.
fn snapshot() -> ClaudeUsage {
    let now = Local::now();
    let limits = read_limits(now.with_timezone(&Utc));
    let events = collect_events();

    let today = now.date_naive();
    let mut usage = ClaudeUsage {
        session_percent: limits.session_percent,
        session_resets_in: limits.session_resets_in,
        weekly_percent: limits.weekly_percent,
        weekly_resets_in: limits.weekly_resets_in,
        age_min: limits.age_min,
        stale: limits.stale,
        block_tokens: active_block(&events, now),
        fetched_at: now_ms(),
        ..Default::default()
    };

    let mut models: HashMap<&str, i64> = HashMap::new();
    for event in events.iter().filter(|e| e.when.date_naive() == today) {
        usage.today_tokens += event.tokens;
        usage.today_messages += 1;
        if let Some(model) = event.model.as_deref() {
            *models.entry(model).or_default() += 1;
        }
    }
    usage.top_model = models.into_iter().max_by_key(|&(_, count)| count).map(|(model, _)| model.to_string());
    usage
}

#[tauri::command]
pub async fn claude_usage(app: AppHandle) -> Result<ClaudeUsage, String> {
    // Varre arquivos em disco, então sai da thread assíncrona.
    let usage = tauri::async_runtime::spawn_blocking(snapshot).await.err_str()?;
    *CACHE.lock().unwrap() = Some(usage.clone());
    let _ = app.emit("claude-usage-updated", &usage);
    Ok(usage)
}

#[tauri::command]
pub fn claude_usage_cached() -> Option<ClaudeUsage> {
    CACHE.lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

    fn at(iso: &str) -> DateTime<Local> {
        DateTime::parse_from_rfc3339(iso).unwrap().with_timezone(&Local)
    }

    fn event(iso: &str, tokens: i64) -> Event {
        Event { when: at(iso), tokens, model: Some("claude-opus-5".into()) }
    }

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 16, 14, 0, 0).unwrap()
    }

    #[test]
    fn parses_limits_cache() {
        let cache = json!({
            "fetchedAtMs": (now().timestamp_millis() - 5 * 60_000) as f64,
            "utilization": { "limits": [
                { "kind": "session", "percent": 42, "resets_at": "2026-10-16T17:49:00+00:00" },
                { "kind": "weekly_all", "percent": 78, "resets_at": "2026-10-18T22:00:00+00:00" },
                { "kind": "outro_qualquer", "percent": 99, "resets_at": null }
            ]}
        });
        let limits = parse_limits(&cache, now());
        assert_eq!(limits.session_percent, Some(42));
        assert_eq!(limits.session_resets_in, Some(229));
        assert_eq!(limits.weekly_percent, Some(78));
        assert_eq!(limits.weekly_resets_in, Some(2 * 24 * 60 + 8 * 60));
        assert_eq!(limits.age_min, Some(5));
        assert!(!limits.stale);
    }

    #[test]
    fn expired_window_is_unknown_not_zero() {
        let cache = json!({
            "utilization": { "limits": [
                { "kind": "session", "percent": 42, "resets_at": "2026-10-16T13:00:00+00:00" }
            ]}
        });
        let limits = parse_limits(&cache, now());
        assert_eq!(limits.session_percent, None);
        assert_eq!(limits.session_resets_in, Some(-60));
        // Sem `fetchedAtMs` não há como saber a idade, então o dado conta como velho.
        assert_eq!(limits.age_min, None);
        assert!(limits.stale);
    }

    #[test]
    fn old_cache_is_stale() {
        let cache = json!({ "fetchedAtMs": (now().timestamp_millis() - 40 * 60_000) as f64 });
        let limits = parse_limits(&cache, now());
        assert_eq!(limits.age_min, Some(40));
        assert!(limits.stale);
    }

    #[test]
    fn missing_cache_is_unknown() {
        assert_eq!(parse_limits(&json!({}), now()), Limits { stale: true, ..Default::default() });
    }

    #[test]
    fn finds_transcripts_at_any_depth() {
        // A sessão principal fica logo abaixo do projeto, os subagentes dois níveis mais fundo.
        let root = std::env::temp_dir().join(format!("pier-claude-test-{}", std::process::id()));
        let subagents = root.join("projeto").join("sessao").join("subagents");
        std::fs::create_dir_all(&subagents).unwrap();
        std::fs::write(root.join("projeto").join("sessao.jsonl"), "{}").unwrap();
        std::fs::write(subagents.join("agent-1.jsonl"), "{}").unwrap();
        std::fs::write(root.join("projeto").join("notas.txt"), "x").unwrap();

        let found = recent_files_in(root.clone(), SystemTime::UNIX_EPOCH);
        let names: HashSet<_> = found.iter().filter_map(|p| p.file_name()).collect();
        assert_eq!(names.len(), 2, "achou {found:?}");
        assert!(names.contains(std::ffi::OsStr::new("sessao.jsonl")));
        assert!(names.contains(std::ffi::OsStr::new("agent-1.jsonl")));

        // Fora da janela de lookback nada é devolvido.
        let future = SystemTime::now() + Duration::from_secs(3600);
        assert!(recent_files_in(root.clone(), future).is_empty());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn parses_assistant_usage_line() {
        let line = json!({
            "type": "assistant",
            "timestamp": "2026-10-16T14:00:25.805Z",
            "requestId": "req_1",
            "message": { "id": "msg_1", "model": "claude-opus-5", "usage": {
                "input_tokens": 2, "output_tokens": 2537,
                "cache_creation_input_tokens": 53677, "cache_read_input_tokens": 100
            }}
        })
        .to_string();
        let (key, event) = parse_event(&line).unwrap();
        assert_eq!(key, ("msg_1".into(), "req_1".into()));
        assert_eq!(event.tokens, 2 + 2537 + 53677 + 100);
        assert_eq!(event.model.as_deref(), Some("claude-opus-5"));
    }

    #[test]
    fn ignores_lines_that_are_not_usage() {
        let user = json!({ "type": "user", "timestamp": "2026-10-16T14:00:25.805Z", "message": { "usage": {} } });
        assert!(parse_event(&user.to_string()).is_none());
        let no_usage = json!({ "type": "assistant", "timestamp": "2026-10-16T14:00:25.805Z", "message": {} });
        assert!(parse_event(&no_usage.to_string()).is_none());
        let no_time = json!({ "type": "assistant", "message": { "usage": { "input_tokens": 1 } } });
        assert!(parse_event(&no_time.to_string()).is_none());
        assert!(parse_event("{lixo").is_none());
    }

    #[test]
    fn block_sums_current_window() {
        let events = [event("2026-10-16T10:30:00Z", 100), event("2026-10-16T12:00:00Z", 50)];
        // O bloco começa às 10h (hora cheia) e vale até as 15h.
        assert_eq!(active_block(&events, at("2026-10-16T13:00:00Z")), 150);
    }

    #[test]
    fn gap_longer_than_block_starts_over() {
        let events = [event("2026-10-16T02:00:00Z", 100), event("2026-10-16T12:00:00Z", 50)];
        assert_eq!(active_block(&events, at("2026-10-16T13:00:00Z")), 50);
    }

    #[test]
    fn block_expires_after_five_hours() {
        let events = [event("2026-10-16T02:00:00Z", 100)];
        assert_eq!(active_block(&events, at("2026-10-16T13:00:00Z")), 0);
        assert_eq!(active_block(&[], at("2026-10-16T13:00:00Z")), 0);
    }

    #[test]
    fn long_session_rolls_into_new_block() {
        // Atividade contínua: passadas as 5h do início, um bloco novo começa e o total reinicia.
        let events = [
            event("2026-10-16T08:10:00Z", 10),
            event("2026-10-16T11:00:00Z", 20),
            event("2026-10-16T13:30:00Z", 30),
        ];
        assert_eq!(active_block(&events, at("2026-10-16T14:00:00Z")), 30);
    }
}

#[cfg(test)]
mod live_tests {
    /// Lê o uso real desta máquina. Os números têm de bater com o `/usage` do Claude Code e com o
    /// `python usage.py` do projeto claudeUsage, que é a implementação de referência desta leitura.
    #[test]
    #[ignore = "smoke test: lê os arquivos do Claude Code na máquina"]
    fn reads_local_usage() {
        let usage = super::snapshot();
        println!("sessão 5h: {:?}% (reset em {:?} min)", usage.session_percent, usage.session_resets_in);
        println!("semana: {:?}% (reset em {:?} min)", usage.weekly_percent, usage.weekly_resets_in);
        println!("idade do cache: {:?} min (velho: {})", usage.age_min, usage.stale);
        println!("tokens hoje: {} em {} mensagens", usage.today_tokens, usage.today_messages);
        println!("bloco de 5h: {}", usage.block_tokens);
        println!("modelo dominante: {:?}", usage.top_model);
    }
}
