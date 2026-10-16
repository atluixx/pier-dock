//! API de Acessibilidade (AXUIElement): janelas de outros apps, com título, estado e ações.

use std::ffi::c_void;
use std::sync::Once;

use accessibility_sys::{
    kAXErrorSuccess, kAXTrustedCheckOptionPrompt, AXError, AXIsProcessTrusted, AXIsProcessTrustedWithOptions,
    AXUIElementCopyAttributeValue, AXUIElementCreateApplication, AXUIElementCreateSystemWide, AXUIElementGetPid,
    AXUIElementGetTypeID,
    AXUIElementPerformAction, AXUIElementRef, AXUIElementSetAttributeValue, AXUIElementSetMessagingTimeout,
};
use core_foundation::array::CFArray;
use core_foundation::base::{CFGetTypeID, CFRelease, CFRetain, CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::CFString;

extern "C" {
    // Privada, mas estável há mais de uma década (Hammerspoon, AltTab e yabai dependem dela): é o
    // único jeito de saber o CGWindowID de uma janela AX.
    fn _AXUIElementGetWindow(element: AXUIElementRef, id: *mut u32) -> AXError;
}

pub fn is_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Mostra o pedido do sistema para incluir o Pier na lista de Acessibilidade.
pub fn request_trust() {
    let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
    let options = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), CFBoolean::true_value().as_CFType())]);
    unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) };
}

/// Cada chamada AX é uma mensagem para o outro processo; com o padrão de 6 s um app travado
/// congelaria a lista de janelas inteira.
fn set_global_timeout() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| unsafe {
        let system = AXUIElementCreateSystemWide();
        AXUIElementSetMessagingTimeout(system, 0.25);
        CFRelease(system as CFTypeRef);
    });
}

/// Um `AXUIElementRef` retido. Objetos CF podem ser retidos e liberados de qualquer thread, e as
/// chamadas AX são IPC sem estado local.
pub struct Element(AXUIElementRef);

unsafe impl Send for Element {}
unsafe impl Sync for Element {}

impl Drop for Element {
    fn drop(&mut self) {
        unsafe { CFRelease(self.0 as CFTypeRef) }
    }
}

impl Clone for Element {
    fn clone(&self) -> Self {
        unsafe { CFRetain(self.0 as CFTypeRef) };
        Element(self.0)
    }
}

impl Element {
    pub fn application(pid: i32) -> Option<Element> {
        set_global_timeout();
        let element = unsafe { AXUIElementCreateApplication(pid) };
        (!element.is_null()).then_some(Element(element))
    }

    /// Retém `value` se ele for um AXUIElement.
    fn from_value(value: *const c_void) -> Option<Element> {
        if value.is_null() || unsafe { CFGetTypeID(value) } != unsafe { AXUIElementGetTypeID() } {
            return None;
        }
        unsafe { CFRetain(value) };
        Some(Element(value as AXUIElementRef))
    }

    fn attribute(&self, name: &str) -> Option<CFType> {
        let mut value: CFTypeRef = std::ptr::null();
        let name = CFString::new(name);
        let err = unsafe { AXUIElementCopyAttributeValue(self.0, name.as_concrete_TypeRef(), &mut value) };
        (err == kAXErrorSuccess && !value.is_null()).then(|| unsafe { CFType::wrap_under_create_rule(value) })
    }

    pub fn string(&self, name: &str) -> Option<String> {
        self.attribute(name)?.downcast::<CFString>().map(|s| s.to_string())
    }

    pub fn bool(&self, name: &str) -> bool {
        self.attribute(name).and_then(|v| v.downcast::<CFBoolean>()).map(bool::from).unwrap_or(false)
    }

    pub fn element(&self, name: &str) -> Option<Element> {
        Element::from_value(self.attribute(name)?.as_CFTypeRef())
    }

    pub fn elements(&self, name: &str) -> Vec<Element> {
        let Some(array) = self.attribute(name).and_then(|v| v.downcast::<CFArray>()) else { return Vec::new() };
        array.iter().filter_map(|item| Element::from_value(*item)).collect()
    }

    pub fn set_bool(&self, name: &str, value: bool) -> bool {
        let name = CFString::new(name);
        let value = CFBoolean::from(value);
        unsafe { AXUIElementSetAttributeValue(self.0, name.as_concrete_TypeRef(), value.as_CFTypeRef()) == kAXErrorSuccess }
    }

    pub fn perform(&self, action: &str) -> bool {
        let action = CFString::new(action);
        unsafe { AXUIElementPerformAction(self.0, action.as_concrete_TypeRef()) == kAXErrorSuccess }
    }

    pub fn pid(&self) -> Option<i32> {
        let mut pid = 0;
        let err = unsafe { AXUIElementGetPid(self.0, &mut pid) };
        (err == kAXErrorSuccess).then_some(pid)
    }

    /// CGWindowID da janela.
    pub fn window_id(&self) -> Option<u32> {
        let mut id = 0u32;
        let err = unsafe { _AXUIElementGetWindow(self.0, &mut id) };
        (err == kAXErrorSuccess && id != 0).then_some(id)
    }
}
