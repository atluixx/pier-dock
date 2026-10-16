//! Eventos globais do AppKit.

use std::ptr::NonNull;

use block2::RcBlock;
use objc2_app_kit::{NSEvent, NSEventMask};

/// Chama `handler` (na thread principal) a cada clique que vai para outro app. Monitores globais
/// de mouse não pedem permissão, ao contrário dos de teclado.
pub fn on_click_outside(handler: impl Fn() + 'static) {
    let mask = NSEventMask::LeftMouseDown | NSEventMask::RightMouseDown | NSEventMask::OtherMouseDown;
    let block = RcBlock::new(move |_event: NonNull<NSEvent>| handler());
    // O monitor vale pela vida inteira do app; o token só serviria para removê-lo.
    if let Some(token) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &block) {
        std::mem::forget(token);
    }
}
