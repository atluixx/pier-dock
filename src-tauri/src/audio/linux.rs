//! Saídas e volume por app pelo `pactl`, que fala tanto com o PulseAudio quanto com o PipeWire
//! (pipewire-pulse). As saídas são os sinks; cada app tocando áudio tem um ou mais sink inputs.

use std::collections::HashMap;

use super::{AppStream, AudioState, OutputDevice};
use crate::platform::linux::desktop_entry::{self, DesktopEntry};
use crate::util::run;

/// Um item do `pactl list`: `Sink #47` ou `Sink Input #85`, com os campos (`Mute: no`) e as
/// propriedades (`application.name = "Firefox"`).
#[derive(Clone, Copy, Debug, PartialEq)]
enum Availability { Available, Unavailable, Unknown }

#[derive(Debug, Default)]
struct Block {
    index: u32,
    fields: HashMap<String, String>,
    props: HashMap<String, String>,
    ports: HashMap<String, Availability>,
}

fn parse_blocks(output: &str) -> Vec<Block> {
    let mut blocks: Vec<Block> = Vec::new();
    let mut in_ports = false;
    for line in output.lines() {
        if !line.starts_with(char::is_whitespace) {
            if let Some((_, index)) = line.rsplit_once('#') {
                if let Ok(index) = index.trim().parse() {
                    blocks.push(Block { index, ..Default::default() });
                    in_ports = false;
                }
            }
            continue;
        }
        let Some(block) = blocks.last_mut() else { continue };
        let text = line.trim();
        let indent: usize = line.chars().take_while(|c| c.is_whitespace()).map(|c| if c == '\t' { 4 } else { 1 }).sum();
        if in_ports && indent > 4 {
            // Port metadata may have nested properties; only a port header has depth two.
            if indent == 8 {
                if let Some((name, description)) = text.split_once(": ") {
                    block.ports.insert(name.to_owned(), port_availability(description));
                }
            }
            continue;
        }
        in_ports = text == "Ports:";
        if in_ports { continue; }
        if line.starts_with("\t\t") || line.starts_with("        ") {
            if let Some((key, value)) = text.split_once(" = ") {
                block.props.insert(key.to_string(), value.trim_matches('"').to_string());
                continue;
            }
        }
        if let Some((key, value)) = text.split_once(": ") {
            block.fields.entry(key.to_string()).or_insert_with(|| value.to_string());
        } else if let Some(key) = text.strip_suffix(':') {
            block.fields.entry(key.to_string()).or_default();
        }
    }
    blocks
}

/// Parse only the final availability field, never words in a device's display name.
fn port_availability(description: &str) -> Availability {
    let status = description.rsplit_once(" (")
        .and_then(|(_, metadata)| metadata.strip_suffix(')'))
        .and_then(|metadata| metadata.rsplit(',').next()).map(str::trim);
    match status {
        Some("not available" | "availability: no") => Availability::Unavailable,
        Some("available" | "availability: yes") => Availability::Available,
        _ => Availability::Unknown,
    }
}

fn sink_available(sink: &Block) -> bool {
    if let Some(active) = sink.fields.get("Active Port").and_then(|port| sink.ports.get(port)) {
        return *active != Availability::Unavailable;
    }
    // Virtual/Bluetooth sinks and older pactl versions may not expose ports or jack detection.
    sink.ports.is_empty() || sink.ports.values().any(|availability| *availability != Availability::Unavailable)
}

fn with_available_output(id: &str, outputs: &[OutputDevice], apply: impl FnOnce(&str) -> Result<(), String>) -> Result<(), String> {
    if !outputs.iter().any(|device| device.id == id) { return Err("Audio output is no longer available".into()); }
    apply(id)
}

/// `front-left: 32768 /  50% / -18.06 dB,   front-right: …`: o primeiro canal basta.
fn parse_level(volume: &str) -> Option<f32> {
    volume.split('/').map(str::trim).find_map(|part| part.strip_suffix('%')?.trim().parse::<f32>().ok()).map(|p| p / 100.0)
}

fn default_sink() -> Option<String> {
    run("pactl", &["get-default-sink"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| run("pactl", &["info"])?.lines().find_map(|l| l.strip_prefix("Default Sink: ").map(|s| s.trim().to_string())))
}

fn outputs_from(sinks: &[Block], default: Option<&str>) -> Vec<OutputDevice> {
    sinks
        .iter()
        .filter(|sink| sink_available(sink))
        .filter_map(|sink| {
            let id = sink.fields.get("Name")?.clone();
            let name = sink.fields.get("Description").cloned().unwrap_or_else(|| id.clone());
            Some(OutputDevice { default: default == Some(id.as_str()), id, name })
        })
        .collect()
}

pub fn outputs() -> Result<Vec<OutputDevice>, String> {
    let sinks = run("pactl", &["list", "sinks"]).ok_or(crate::i18n::tr("não foi possível listar as saídas (pactl)", "couldn't list the outputs (pactl)"))?;
    Ok(outputs_from(&parse_blocks(&sinks), default_sink().as_deref()))
}

pub fn set_output(id: &str) -> Result<(), String> {
    with_available_output(id, &outputs()?, |id| {
        run("pactl", &["set-default-sink", id]).ok_or(crate::i18n::tr("falha ao trocar a saída de áudio", "couldn't switch the audio output"))?;
        // PipeWire moves streams itself; PulseAudio only applies the default to new streams.
        if let Some(inputs) = run("pactl", &["list", "short", "sink-inputs"]) {
            for index in inputs.lines().filter_map(|l| l.split_whitespace().next()) {
                let _ = run("pactl", &["move-sink-input", index, id]);
            }
        }
        Ok(())
    })
}

/// Os sink inputs agrupados por app: o Firefox, por exemplo, abre um stream por aba.
fn apps_from(inputs: &[Block], sinks: &[Block], entries: &[DesktopEntry], exe: impl Fn(&str) -> Option<String>) -> Vec<AppStream> {
    let mut apps: Vec<AppStream> = Vec::new();
    let mut keys: Vec<String> = Vec::new();
    for input in inputs {
        let props = &input.props;
        let Some(name) = props.get("application.name").or_else(|| props.get("application.process.binary")).or_else(|| props.get("media.name")) else {
            continue;
        };
        let key = props.get("application.id").or_else(|| props.get("application.process.binary")).unwrap_or(name).clone();
        let output_id = input.fields.get("Sink").and_then(|index| index.parse::<u32>().ok())
            .and_then(|index| sinks.iter().find(|sink| sink.index == index)).and_then(|sink| sink.fields.get("Name")).cloned();
        let level = input.fields.get("Volume").and_then(|v| parse_level(v)).unwrap_or(1.0);
        let muted = input.fields.get("Mute").is_some_and(|m| m == "yes");
        if let Some(i) = keys.iter().position(|k| *k == key) {
            let app = &mut apps[i];
            app.id = format!("{},{}", app.id, input.index);
            app.level = app.level.max(level);
            app.muted &= muted;
            if app.output_id != output_id { app.output_id = None; }
            continue;
        }
        let executable = props.get("application.process.id").and_then(|pid| exe(pid));
        let icon = app_icon(props, entries, executable);
        keys.push(key);
        apps.push(AppStream { id: input.index.to_string(), name: name.clone(), icon, level, muted, output_id });
    }
    apps
}

pub fn state() -> AudioState {
    let sinks = run("pactl", &["list", "sinks"]).map(|s| parse_blocks(&s)).unwrap_or_default();
    let inputs = run("pactl", &["list", "sink-inputs"]);
    let entries = desktop_entry::all();
    let exe = |pid: &str| std::fs::read_link(format!("/proc/{pid}/exe")).ok().map(|p| p.display().to_string());
    let outputs = outputs_from(&sinks, default_sink().as_deref());
    let can_route_apps = inputs.is_some() && !outputs.is_empty();
    let apps = inputs.map(|input| apps_from(&parse_blocks(&input), &sinks, &entries, exe));
    AudioState { outputs, apps, apps_need_permission: false, can_route_apps }
}

pub fn apps() -> Option<Vec<AppStream>> { state().apps }

/// All validation completes before the first stream is moved.
fn move_streams(id: &str, output: &str, available: &[OutputDevice], mut move_one: impl FnMut(u32, &str) -> Result<(), String>) -> Result<(), String> {
    with_available_output(output, available, |output| {
        let indices: Vec<u32> = id.split(',').map(|part| part.parse::<u32>().map_err(|_| "Invalid audio stream".to_string())).collect::<Result<_, _>>()?;
        for index in indices { move_one(index, output)?; }
        Ok(())
    })
}

pub fn set_app_output(id: &str, output: &str) -> Result<(), String> {
    move_streams(id, output, &outputs()?, |index, sink| {
        run("pactl", &["move-sink-input", &index.to_string(), sink]).ok_or_else(|| "Could not move the application audio stream".to_string()).map(drop)
    })
}

fn app_icon(props: &HashMap<String, String>, entries: &[DesktopEntry], executable: Option<String>) -> Option<String> {
    let desktop = props.get("application.desktop").or_else(|| props.get("application.id"));
    if let Some(id) = desktop {
        let id = id.strip_suffix(".desktop").unwrap_or(id);
        if let Some(entry) = entries.iter().find(|entry| entry.id.strip_suffix(".desktop").unwrap_or(&entry.id).eq_ignore_ascii_case(id)) {
            return Some(entry.id.clone());
        }
    }
    let binary = props.get("application.process.binary").map(String::as_str).or(executable.as_deref());
    let simple_name = |name: &str| std::path::Path::new(name).file_name().unwrap_or_default().to_string_lossy().trim_start_matches('.').trim_end_matches("-wrapped").to_lowercase();
    if let Some(binary) = binary {
        if let Some(entry) = entries.iter().find(|entry| entry.executable().is_some_and(|program| simple_name(&program) == simple_name(binary))) {
            return Some(entry.id.clone());
        }
    }
    if let Some(icon) = props.get("application.icon_name").filter(|name| !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || "_.-+".contains(c))) {
        return Some(format!("theme:{icon}"));
    }
    executable
}

pub fn set_app_volume(id: &str, level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    for index in id.split(',') {
        index.parse::<u32>().map_err(|_| format!("stream inválido: {index}"))?;
        if let Some(level) = level {
            let percent = format!("{}%", (level * 100.0).round() as u32);
            run("pactl", &["set-sink-input-volume", index, &percent]).ok_or(crate::i18n::tr("falha ao ajustar o volume do app", "couldn't set the app's volume"))?;
        }
        if let Some(muted) = muted {
            run("pactl", &["set-sink-input-mute", index, if muted { "1" } else { "0" }]).ok_or(crate::i18n::tr("falha ao silenciar o app", "couldn't mute the app"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SINKS: &str = "Sink #47
\tState: RUNNING
\tName: alsa_output.pci-0000_00_1f.3.analog-stereo
\tDescription: Built-in Audio Analog Stereo
\tMute: no
\tVolume: front-left: 32768 /  50% / -18.06 dB,   front-right: 32768 /  50% / -18.06 dB
\t        balance 0.00
\tProperties:
\t\talsa.card = \"0\"
\t\tdevice.description = \"Built-in Audio Analog Stereo\"

Sink #52
\tState: SUSPENDED
\tName: bluez_output.AA_BB_CC_DD_EE_FF.1
\tDescription: WH-1000XM4
\tMute: no
";

    const INPUTS: &str = "Sink Input #85
\tDriver: PipeWire
\tSink: 47
\tMute: no
\tVolume: front-left: 65536 / 100% / 0.00 dB,   front-right: 65536 / 100% / 0.00 dB
\t        balance 0.00
\tProperties:
\t\tapplication.name = \"Firefox\"
\t\tapplication.process.id = \"1234\"
\t\tapplication.process.binary = \"firefox\"
\t\tmedia.name = \"AudioStream\"

Sink Input #86
\tSink: 47
\tMute: yes
\tVolume: front-left: 32768 /  50% / -18.06 dB,   front-right: 32768 /  50% / -18.06 dB
\tProperties:
\t\tapplication.name = \"Firefox\"
\t\tapplication.process.id = \"1234\"
\t\tapplication.process.binary = \"firefox\"

Sink Input #90
\tSink: 47
\tMute: yes
\tVolume: mono: 19661 /  30% / -31.37 dB
\tProperties:
\t\tapplication.name = \"Spotify\"
\t\tapplication.process.binary = \"spotify\"
";

    #[test]
    fn parses_sinks_and_default() {
        let outputs = outputs_from(&parse_blocks(SINKS), Some("bluez_output.AA_BB_CC_DD_EE_FF.1"));
        assert_eq!(outputs.len(), 2);
        assert_eq!(outputs[0].name, "Built-in Audio Analog Stereo");
        assert!(!outputs[0].default);
        assert_eq!(outputs[1], OutputDevice { id: "bluez_output.AA_BB_CC_DD_EE_FF.1".into(), name: "WH-1000XM4".into(), default: true });
    }

    const PORT_SINKS: &str = include_str!("fixtures/output-availability.txt");

    #[test]
    fn hides_disconnected_hdmi_ports_but_keeps_idle_builtin_speakers() {
        // PipeWire UCM advertises four sinks even with all HDMI connectors unplugged.
        for fixture in [PORT_SINKS.to_owned(), PORT_SINKS.replace('\t', "    ")] {
            let sinks = parse_blocks(&fixture);
            assert_eq!(sinks[2].ports.len(), 1, "nested port properties are not additional ports");
            let outputs = outputs_from(&sinks, Some("speaker"));
            assert_eq!(outputs, [OutputDevice { id: "speaker".into(), name: "Built-in Speaker".into(), default: true }]);
            assert!(outputs_from(&sinks, Some("hdmi1")).iter().all(|output| !output.default));
        }
    }

    #[test]
    fn availability_uses_the_active_port_and_preserves_missing_or_unknown_metadata() {
        let mut sink = Block::default();
        assert!(sink_available(&sink), "virtual/Bluetooth outputs may have no port metadata");
        sink.ports.insert("speaker".into(), Availability::Available);
        sink.ports.insert("headphones".into(), Availability::Unavailable);
        sink.fields.insert("Active Port".into(), "headphones".into());
        assert!(!sink_available(&sink), "another port being available cannot make the active disconnected port audible");
        sink.fields.insert("Active Port".into(), "speaker".into());
        sink.fields.insert("State".into(), "SUSPENDED".into());
        assert!(sink_available(&sink), "suspended means idle, not disconnected");
        sink.fields.remove("Active Port");
        assert!(sink_available(&sink));
        sink.ports.insert("speaker".into(), Availability::Unavailable);
        assert!(!sink_available(&sink), "without an active port, all explicitly unavailable ports are hidden");
        sink.ports.insert("speaker".into(), Availability::Unknown);
        assert!(sink_available(&sink));
    }

    #[test]
    fn reads_only_the_port_metadata_availability_field() {
        assert_eq!(port_availability("HDMI (priority: 500, available)"), Availability::Available);
        assert_eq!(port_availability("HDMI (priority: 500, not available)"), Availability::Unavailable);
        assert_eq!(port_availability("Headphones (priority: 100, availability: no)"), Availability::Unavailable);
        assert_eq!(port_availability("A device named not available (priority: 100, availability unknown)"), Availability::Unknown);
        assert_eq!(port_availability("Older port description without availability"), Availability::Unknown);
    }

    #[test]
    fn disconnected_routes_are_rejected_before_any_audio_mutation() {
        let outputs = outputs_from(&parse_blocks(PORT_SINKS), None);
        assert!(with_available_output("hdmi1", &outputs, |_| panic!("must not change the default")).is_err());
        assert!(move_streams("85,86", "hdmi1", &outputs, |_, _| panic!("must not move any stream")).is_err());
        let mut selected = None;
        with_available_output("speaker", &outputs, |id| { selected = Some(id.to_owned()); Ok(()) }).unwrap();
        assert_eq!(selected.as_deref(), Some("speaker"));
        let mut moved = Vec::new();
        move_streams("85", "speaker", &outputs, |index, _| { moved.push(index); Ok(()) }).unwrap();
        assert_eq!(moved, [85]);
    }

    #[test]
    fn groups_sink_inputs_by_app() {
        let apps = apps_from(&parse_blocks(INPUTS), &parse_blocks(SINKS), &[], |pid| Some(format!("/proc/{pid}/exe")));
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0], AppStream { id: "85,86".into(), name: "Firefox".into(), icon: Some("/proc/1234/exe".into()), level: 1.0, muted: false, output_id: Some("alsa_output.pci-0000_00_1f.3.analog-stereo".into()) });
        assert_eq!(apps[1], AppStream { id: "90".into(), name: "Spotify".into(), icon: None, level: 0.3, muted: true, output_id: Some("alsa_output.pci-0000_00_1f.3.analog-stereo".into()) });
    }
    #[test]
    fn route_moves_only_the_selected_group_and_validates_every_id_first() {
        let outputs = vec![OutputDevice { id: "headphones".into(), name: "Headphones".into(), default: false }];
        let mut moved = vec![];
        move_streams("85,86", "headphones", &outputs, |id, sink| { moved.push((id, sink.to_string())); Ok(()) }).unwrap();
        assert_eq!(moved, [(85, "headphones".into()), (86, "headphones".into())]);
        assert!(move_streams("85,invalid", "headphones", &outputs, |_, _| panic!("must validate first")).is_err());
        assert!(move_streams("85", "missing", &outputs, |_, _| panic!("must validate output")).is_err());
        assert!(move_streams("85,86", "headphones", &outputs, |_, _| Err("device disappeared".into())).is_err());
    }
    #[test]
    fn desktop_metadata_and_wrapped_binary_resolve_real_icons() {
        let entry = DesktopEntry { id: "org.mozilla.firefox.desktop".into(), exec: Some("/usr/bin/firefox".into()), icon: Some("firefox".into()), ..Default::default() };
        let entries = [entry];
        let props = HashMap::from([("application.id".into(), "org.mozilla.firefox".into())]);
        assert_eq!(app_icon(&props, &entries, Some("/nix/store/unknown-exe".into())).as_deref(), Some("org.mozilla.firefox.desktop"));
        let props = HashMap::from([("application.process.binary".into(), ".firefox-wrapped".into())]);
        assert_eq!(app_icon(&props, &entries, None).as_deref(), Some("org.mozilla.firefox.desktop"));
        let props = HashMap::from([("application.icon_name".into(), "spotify".into())]);
        assert_eq!(app_icon(&props, &[], None).as_deref(), Some("theme:spotify"));
    }
    #[test]
    fn grouped_streams_with_different_outputs_report_mixed_routing() {
        let mut inputs = parse_blocks(INPUTS);
        inputs[1].fields.insert("Sink".into(), "52".into());
        let apps = apps_from(&inputs, &parse_blocks(SINKS), &[], |_| None);
        assert_eq!(apps[0].output_id, None);
    }

}
