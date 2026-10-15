//! Conexões D-Bus compartilhadas (session e system bus) e um atalho para proxies sem cache.

use std::sync::OnceLock;

use zbus::blocking::{Connection, Proxy};
use zbus::proxy::CacheProperties;

/// Nome que o WinDock ocupa no session bus. A extensão do GNOME só aceita chamadas deste dono e
/// desfaz tudo quando ele some.
pub const APP_BUS_NAME: &str = "dev.windock.App";

pub fn session() -> Option<&'static Connection> {
    static CONN: OnceLock<Option<Connection>> = OnceLock::new();
    CONN.get_or_init(|| {
        let conn = Connection::session().ok()?;
        let _ = conn.request_name(APP_BUS_NAME);
        Some(conn)
    })
    .as_ref()
}

pub fn system() -> Option<&'static Connection> {
    static CONN: OnceLock<Option<Connection>> = OnceLock::new();
    CONN.get_or_init(|| Connection::system().ok()).as_ref()
}

/// Proxy genérico que lê propriedades na hora (sem assinar `PropertiesChanged`).
pub fn proxy(conn: &Connection, destination: &str, path: &str, interface: &str) -> Option<Proxy<'static>> {
    zbus::blocking::proxy::Builder::<Proxy<'static>>::new(conn)
        .destination(destination.to_string())
        .ok()?
        .path(path.to_string())
        .ok()?
        .interface(interface.to_string())
        .ok()?
        .cache_properties(CacheProperties::No)
        .build()
        .ok()
}
