//! Keep AppImage libraries and GTK modules out of programs launched on the host.
use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

pub(super) fn configure(command: &mut Command) {
    if let Some(appdir) = std::env::var_os("APPDIR").filter(|dir| !dir.is_empty()) {
        configure_with(command, Path::new(&appdir), std::env::vars_os());
    }
}

fn configure_with(command: &mut Command, appdir: &Path, vars: impl IntoIterator<Item = (OsString, OsString)>) {
    for (key, value) in vars {
        match key.to_str() {
            Some("APPIMAGE" | "APPDIR") => {
                command.env_remove(key);
            }
            Some(
                "LD_LIBRARY_PATH"
                | "PATH"
                | "XDG_DATA_DIRS"
                | "GI_TYPELIB_PATH"
                | "GIO_MODULE_DIR"
                | "GTK_PATH"
                | "GDK_PIXBUF_MODULEDIR",
            ) => {
                let paths: Vec<_> = std::env::split_paths(&value).collect();
                let host: Vec<_> = paths.iter().filter(|path| !path.starts_with(appdir)).collect();
                if host.len() != paths.len() {
                    if host.is_empty() {
                        // An unset search path uses the system default; an empty one can mean cwd.
                        command.env_remove(key);
                    } else if let Ok(value) = std::env::join_paths(host) {
                        command.env(key, value);
                    }
                }
            }
            Some(
                "GTK_DATA_PREFIX"
                | "GTK_EXE_PREFIX"
                | "GSETTINGS_SCHEMA_DIR"
                | "GTK_IM_MODULE_FILE"
                | "GDK_PIXBUF_MODULE_FILE",
            ) if Path::new(&value).starts_with(appdir) => {
                command.env_remove(key);
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn child_env(vars: &[(&str, &str)]) -> String {
        let mut command = Command::new("/bin/sh");
        command.env_clear().envs(vars.iter().copied());
        configure_with(
            &mut command,
            Path::new("/tmp/Pier.AppDir"),
            vars.iter()
                .map(|(key, value)| (OsString::from(key), OsString::from(value))),
        );
        // Shell builtins avoid loading a test helper with the deliberately artificial library path.
        let output = command.args(["-c", "printf '%s\\n' \"${LD_LIBRARY_PATH-unset}\" \"${PATH-unset}\" \"${GIO_MODULE_DIR-unset}\" \"${APPIMAGE-unset}\" \"${APPDIR-unset}\" \"${GTK_IM_MODULE_FILE-unset}\" \"${DBUS_SESSION_BUS_ADDRESS-unset}\" \"${DISPLAY-unset}\" \"${XDG_DATA_DIRS-unset}\""]).output().unwrap();
        assert!(output.status.success());
        String::from_utf8(output.stdout).unwrap()
    }

    #[test]
    fn launched_process_uses_host_paths_and_session() {
        assert_eq!(
            child_env(&[
                ("LD_LIBRARY_PATH", "/tmp/Pier.AppDir/usr/lib:/host/lib"),
                ("PATH", "/tmp/Pier.AppDir/usr/bin:/host/bin"),
                ("GIO_MODULE_DIR", "/tmp/Pier.AppDir/usr/lib/gio/modules"),
                ("APPIMAGE", "/downloads/Pier.AppImage"),
                ("APPDIR", "/tmp/Pier.AppDir"),
                ("GTK_IM_MODULE_FILE", "/tmp/Pier.AppDir/usr/lib/immodules.cache"),
                ("DBUS_SESSION_BUS_ADDRESS", "unix:path=/run/user/1000/bus"),
                ("DISPLAY", ":0"),
                ("XDG_DATA_DIRS", "/tmp/Pier.AppDir/usr/share:/host/share"),
            ]),
            "/host/lib\n/host/bin\nunset\nunset\nunset\nunset\nunix:path=/run/user/1000/bus\n:0\n/host/share\n"
        );
    }

    #[test]
    fn removes_bundle_only_library_path_and_preserves_similar_host_paths() {
        let output = child_env(&[
            ("LD_LIBRARY_PATH", "/tmp/Pier.AppDir/usr/lib"),
            ("PATH", "/tmp/Pier.AppDir-backup/bin:/usr/bin"),
            ("GIO_MODULE_DIR", "/host/gio/modules"),
            ("GTK_IM_MODULE_FILE", "/host/immodules.cache"),
        ]);
        assert_eq!(output, "unset\n/tmp/Pier.AppDir-backup/bin:/usr/bin\n/host/gio/modules\nunset\nunset\n/host/immodules.cache\nunset\nunset\nunset\n");
    }

    #[test]
    fn does_not_change_unrelated_environment() {
        let mut command = Command::new("true");
        configure_with(
            &mut command,
            Path::new("/tmp/Pier.AppDir"),
            [
                (OsString::from("LD_LIBRARY_PATH"), OsString::from("/host/lib")),
                (OsString::from("WAYLAND_DISPLAY"), OsString::from("wayland-0")),
            ],
        );
        assert_eq!(command.get_envs().count(), 0);
    }
}
