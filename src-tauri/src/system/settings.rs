//! Desktop-aware Linux settings launch plans, tested without starting host applications.
#[derive(Clone, Debug, PartialEq)]
pub struct Command(pub &'static str, pub &'static [&'static str]);

pub fn candidates(desktop: &str, kind: &str) -> Vec<Command> {
    let kde = match kind {
        "bluetooth" => Command("systemsettings", &["kcm_bluetooth"]),
        "sound" => Command("systemsettings", &["kcm_pulseaudio"]),
        "network" => Command("systemsettings", &["kcm_networkmanagement"]),
        _ => Command("systemsettings", &[]),
    };
    let gnome = Command("gnome-control-center", match kind {
        "bluetooth" => &["bluetooth"], "sound" => &["sound"], "network" => &["wifi"], _ => &[],
    });
    let cinnamon = Command("cinnamon-settings", match kind {
        "bluetooth" => &["bluetooth"], "sound" => &["sound"], "network" => &["network"], _ => &[],
    });
    let desktop = desktop.to_lowercase();
    let mut commands = if desktop.split(':').any(|d| d == "kde" || d == "plasma") {
        vec![kde.clone(), Command("systemsettings6", kde.1), Command("kcmshell6", kde.1), gnome, cinnamon]
    } else if desktop.contains("cinnamon") {
        vec![cinnamon, gnome, kde]
    } else { vec![gnome, kde, cinnamon] };
    match kind {
        "bluetooth" => commands.push(Command("blueman-manager", &[])),
        "sound" => commands.push(Command("pavucontrol", &[])),
        "network" => commands.push(Command("nm-connection-editor", &[])),
        "quick-settings" => {},
        _ => return Vec::new(),
    }
    commands
}

pub fn launch(commands: &[Command], mut spawn: impl FnMut(&str, &[&str]) -> Result<(), String>) -> Result<(), String> {
    let mut failures = Vec::new();
    for Command(program, args) in commands {
        match spawn(program, args) {
            Ok(()) => return Ok(()),
            Err(error) => failures.push(format!("{program}: {error}")),
        }
    }
    Err(format!("Could not open system settings: {}", failures.join("; ")))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uses_current_desktop_and_correct_panels() {
        assert_eq!(candidates("KDE", "bluetooth")[0], Command("systemsettings", &["kcm_bluetooth"]));
        assert_eq!(candidates("ubuntu:GNOME", "network")[0], Command("gnome-control-center", &["wifi"]));
        assert_eq!(candidates("X-Cinnamon", "sound")[0], Command("cinnamon-settings", &["sound"]));
        assert!(candidates("KDE", "unknown").is_empty());
    }
    #[test]
    fn falls_back_and_stops_after_success() {
        let mut calls = Vec::new();
        launch(&candidates("KDE", "bluetooth"), |program, _| {
            calls.push(program.to_owned());
            if program == "systemsettings6" { Ok(()) } else { Err("missing".into()) }
        }).unwrap();
        assert_eq!(calls, ["systemsettings", "systemsettings6"]);
        assert!(launch(&candidates("GNOME", "bluetooth"), |_, _| Err("missing".into())).unwrap_err().contains("blueman-manager"));
    }
}
