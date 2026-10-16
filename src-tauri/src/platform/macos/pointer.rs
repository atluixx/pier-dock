//! Hover nas janelas do Pier. O WKWebView só recebe o movimento do mouse quando a janela é a
//! janela-chave, e a dock e os painéis nunca são: o app é `Accessory` e não toma o foco de quem
//! está em uso. Então uma thread lê o cursor e manda a posição para a página (`pointer-bridge`),
//! que gera os eventos de mouse e o estado de hover por conta própria (`src/lib/pointerBridge.ts`).

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Posição em pixels CSS, relativa ao topo esquerdo da janela.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
struct Pointer {
    x: f64,
    y: f64,
    inside: bool,
}

/// Roda enquanto a janela existir.
pub fn forward(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    std::thread::spawn(move || {
        let mut last: Option<Pointer> = None;
        let mut frame: Option<(PhysicalPosition<i32>, PhysicalSize<u32>, f64)> = None;
        let mut frame_read = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(16));
            let Some(window) = app.get_webview_window(&label) else { return };
            // Posição e tamanho só mudam com o layout; cada leitura é uma ida à thread principal.
            if frame.is_none() || frame_read.elapsed() > Duration::from_millis(500) {
                frame = match (window.outer_position(), window.outer_size(), window.scale_factor()) {
                    (Ok(pos), Ok(size), Ok(scale)) => Some((pos, size, scale)),
                    _ => None,
                };
                frame_read = Instant::now();
            }
            let (Some((pos, size, scale)), Ok(cursor)) = (frame, app.cursor_position()) else { continue };
            let x = (cursor.x - pos.x as f64) / scale;
            let y = (cursor.y - pos.y as f64) / scale;
            let inside = x >= 0.0 && y >= 0.0 && x < size.width as f64 / scale && y < size.height as f64 / scale;
            let pointer = Pointer { x, y, inside };
            // Fora da janela, só a primeira posição interessa (para a página encerrar o hover).
            let unchanged = last == Some(pointer) || (!inside && last.is_some_and(|l| !l.inside));
            if unchanged {
                continue;
            }
            last = Some(pointer);
            let _ = app.emit_to(label.as_str(), "pointer-bridge", pointer);
        }
    });
}
