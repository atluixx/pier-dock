//! Replace the updated Linux process after Tauri has closed the old instance.
//! Keeping the PID also keeps launcher/container supervisors alive during restart.
use std::io;
use std::os::unix::{fs::PermissionsExt, process::CommandExt};
use std::process::{Command, Stdio};

pub struct Relaunch(Command);

pub fn prepare(env: &tauri::Env) -> io::Result<Relaunch> {
    let release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
    let runner = nixos_runner(&release, std::env::var_os("PATH").as_deref(), env.appdir.as_deref().map(std::path::Path::new));
    prepare_with_runner(env, runner.as_deref())
}

fn nixos_runner(release: &str, path: Option<&std::ffi::OsStr>, appdir: Option<&std::path::Path>) -> Option<std::path::PathBuf> {
    if !release.lines().any(|line| line.trim().strip_prefix("ID=").is_some_and(|id| id.trim_matches('"') == "nixos")) {
        return None;
    }
    std::env::split_paths(path?)
        .filter(|dir| dir.is_absolute() && appdir.is_none_or(|appdir| !dir.starts_with(appdir)))
        .map(|dir| dir.join("appimage-run"))
        .find(|program| program.metadata().is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0))
        .and_then(|program| std::path::absolute(program).ok())
}

fn prepare_with_runner(env: &tauri::Env, runner: Option<&std::path::Path>) -> io::Result<Relaunch> {
    // Resolve before install: a native development binary can itself be replaced by an AppImage.
    // The updater supports native package paths too, which use the same installed binary path.
    let path = std::path::absolute(tauri::process::current_binary(env)?)?;
    let metadata = path.metadata()?;
    if !metadata.is_file() || metadata.permissions().mode() & 0o111 == 0 {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "Updated application path is not executable"));
    }
    let mut command = Command::new(runner.unwrap_or(&path));
    if runner.is_some() {
        command.arg(&path);
    }
    command.args(env.args_os.iter().skip(1));
    crate::util::configure_host_command(&mut command);
    // A terminal/launcher may have disappeared during installation. Do not inherit its pipes.
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let cwd = std::env::current_dir().ok().filter(|cwd| env.appdir.as_ref().is_none_or(|dir| !cwd.starts_with(dir)));
    if let Some(cwd) = cwd.as_deref().or_else(|| path.parent()) {
        command.current_dir(cwd);
    }
    Ok(Relaunch(command))
}

impl Relaunch {
    /// Success replaces this process and never returns. The caller logs a failure before exiting.
    pub fn exec(mut self) -> io::Error {
        self.0.exec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "pier-relaunch-{}-{}",
                std::process::id(),
                SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn wait_for(path: &Path) {
        let start = Instant::now();
        while !path.exists() {
            assert!(start.elapsed() < Duration::from_secs(10), "timed out waiting for {}", path.display());
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    fn env(image: Option<&Path>, appdir: Option<&Path>) -> tauri::Env {
        let mut env = tauri::Env::default();
        env.appimage = image.map(|p| p.as_os_str().into());
        env.appdir = appdir.map(|p| p.as_os_str().into());
        env.args_os = vec!["pier".into(), "argument with spaces;$(literal)".into()];
        env
    }

    #[test]
    fn native_binary_path_is_preserved_before_it_is_replaced_by_an_appimage() {
        let plan = prepare_with_runner(&env(None, None), None).unwrap();
        assert_eq!(plan.0.get_program(), std::env::current_exe().unwrap().as_os_str());
    }

    #[test]
    fn missing_or_nonexecutable_image_is_rejected_before_installing() {
        let dir = Temp::new();
        let image = dir.0.join("Pier.AppImage");
        assert!(prepare_with_runner(&env(Some(&image), None), None).is_err());
        fs::write(&image, "not executable").unwrap();
        assert!(prepare_with_runner(&env(Some(&image), None), None).is_err());
    }

    #[test]
    fn updated_image_replaces_the_process_with_clean_environment_and_detached_stdio() {
        for use_runner in [false, true] {
            let dir = Temp::new();
            let image = dir.0.join("Pier custom location.AppImage");
            let appdir = dir.0.join("old bundle");
            fs::create_dir_all(&appdir).unwrap();
            fs::write(&image, "#!/bin/sh\nexit 42\n").unwrap();
            fs::set_permissions(&image, fs::Permissions::from_mode(0o755)).unwrap();
            let runner = dir.0.join("appimage-run");
            fs::write(&runner, "#!/bin/sh\nset -eu\nprintf runner > runner-used\nexec \"$@\"\n").unwrap();
            fs::set_permissions(&runner, fs::Permissions::from_mode(0o755)).unwrap();
            let mut child = Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "updater::relaunch::tests::exec_fixture", "--nocapture"])
                .env("PIER_RELAUNCH_FIXTURE", &dir.0)
                .env("PIER_RELAUNCH_RUNNER", if use_runner { runner.as_os_str() } else { std::ffi::OsStr::new("") })
                .env("APPDIR", &appdir)
                .env("APPIMAGE", &image)
                .env("LD_LIBRARY_PATH", format!("{}:/host/lib", appdir.join("usr/lib").display()))
                .env("GTK_IM_MODULE_FILE", appdir.join("immodules.cache"))
                .env("DBUS_SESSION_BUS_ADDRESS", "unix:path=/test/session-bus")
                .current_dir(&appdir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            wait_for(&dir.0.join("ready"));
            // The replacement must survive even if the original terminal stops reading these pipes.
            drop(child.stdout.take());
            drop(child.stderr.take());
            fs::write(dir.0.join("go"), "").unwrap();
            assert!(child.wait().unwrap().success());
            assert_eq!(dir.0.join("runner-used").exists(), use_runner);
            let output = fs::read_to_string(dir.0.join("result")).unwrap();
            assert_eq!(
                output.lines().collect::<Vec<_>>(),
                [
                    "updated",
                    &child.id().to_string(),
                    "argument with spaces;$(literal)",
                    "unset",
                    "unset",
                    "/host/lib",
                    "unset",
                    "unix:path=/test/session-bus",
                    dir.0.to_str().unwrap(),
                ]
            );
        }
    }

    #[test]
    fn only_nixos_uses_an_existing_host_runner() {
        let dir = Temp::new();
        let bundle = dir.0.join("bundle");
        let host = dir.0.join("host");
        for root in [&bundle, &host] {
            fs::create_dir(root).unwrap();
            let runner = root.join("appimage-run");
            fs::write(&runner, "#!/bin/sh\n").unwrap();
            fs::set_permissions(&runner, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let path = std::env::join_paths([&bundle, &host]).unwrap();
        assert_eq!(nixos_runner("ID=\"nixos\"\n", Some(&path), Some(&bundle)), Some(host.join("appimage-run")));
        assert!(nixos_runner("ID=ubuntu\n", Some(&path), None).is_none());
        assert!(nixos_runner("ID=nixos\n", Some(bundle.as_os_str()), Some(&bundle)).is_none());
    }

    // Run by the parent test in a separate process, keeping global environment changes isolated.
    #[test]
    fn exec_fixture() {
        let Some(dir) = std::env::var_os("PIER_RELAUNCH_FIXTURE").map(PathBuf::from) else { return };
        let image = dir.join("Pier custom location.AppImage");
        let plan = prepare_with_runner(
            &env(Some(&image), Some(&dir.join("old bundle"))),
            std::env::var_os("PIER_RELAUNCH_RUNNER").filter(|runner| !runner.is_empty()).as_deref().map(Path::new),
        )
        .unwrap();
        // Mirror the updater: replace the installed file after the relaunch plan was captured.
        fs::rename(&image, dir.join("previous.AppImage")).unwrap();
        fs::write(&image, "#!/bin/sh\nset -eu\nprintf 'stdio is open\\n'\nprintf 'stderr is open\\n' >&2\nprintf '%s\\n' updated \"$$\" \"$1\" \"${APPIMAGE-unset}\" \"${APPDIR-unset}\" \"${LD_LIBRARY_PATH-unset}\" \"${GTK_IM_MODULE_FILE-unset}\" \"$DBUS_SESSION_BUS_ADDRESS\" \"$PWD\" > result\n").unwrap();
        fs::set_permissions(&image, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(dir.join("ready"), "").unwrap();
        wait_for(&dir.join("go"));
        panic!("could not exec updated image: {}", plan.exec());
    }

    #[test]
    fn failed_exec_returns_the_launch_error() {
        let dir = Temp::new();
        let image = dir.0.join("Pier.AppImage");
        fs::write(&image, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&image, fs::Permissions::from_mode(0o755)).unwrap();
        let status = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "updater::relaunch::tests::failed_exec_fixture"])
            .env("PIER_RELAUNCH_FAILURE_FIXTURE", &dir.0)
            .status()
            .unwrap();
        assert!(status.success());
        assert_eq!(fs::read_to_string(dir.0.join("error")).unwrap(), "NotFound");
    }

    #[test]
    fn failed_exec_fixture() {
        let Some(dir) = std::env::var_os("PIER_RELAUNCH_FAILURE_FIXTURE").map(PathBuf::from) else { return };
        let image = dir.join("Pier.AppImage");
        let plan = prepare_with_runner(&env(Some(&image), None), None).unwrap();
        fs::remove_file(image).unwrap();
        // exec failure can change cwd/environment/stdio, so this fixture is a disposable process.
        fs::write(dir.join("error"), format!("{:?}", plan.exec().kind())).unwrap();
        std::process::exit(0);
    }
}
