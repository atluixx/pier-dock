use super::KeyboardLayouts;

pub fn layouts() -> KeyboardLayouts {
    KeyboardLayouts::default()
}

pub fn set_layout(_id: &str) -> Result<(), String> {
    Err(crate::i18n::tr("a troca de layout do teclado só existe no Windows", "switching the keyboard layout only exists on Windows").into())
}
