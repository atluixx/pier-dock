//! Ícones no Windows: qualquer coisa que o shell entenda (.exe, .lnk, pastas,
//! `shell:AppsFolder\<AUMID>`), convertida para PNG.

use std::io::Cursor;

use windows::core::{Interface, HSTRING};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HBITMAP,
};
use windows::Win32::UI::Shell::{IShellItem, IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY};

use crate::util::{com_init, ErrStr};

const ICON_SIZE: i32 = 256;

fn bitmap_to_rgba(hbmp: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
    unsafe {
        let mut bm = BITMAP::default();
        if GetObjectW(hbmp, std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) == 0 {
            return None;
        }
        let (w, h) = (bm.bmWidth, bm.bmHeight);
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        let hdc = GetDC(None);
        let lines = GetDIBits(hdc, hbmp, 0, h as u32, Some(pixels.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
        ReleaseDC(None, hdc);
        if lines == 0 {
            return None;
        }
        let has_alpha = pixels.as_chunks::<4>().0.iter().any(|p| p[3] != 0);
        for p in pixels.as_chunks_mut::<4>().0 {
            p.swap(0, 2); // BGRA → RGBA
            if !has_alpha {
                p[3] = 255;
            } else if p[3] > 0 && p[3] < 255 {
                // O shell entrega alfa pré-multiplicado.
                let a = p[3] as u32;
                for c in &mut p[..3] {
                    *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
                }
            }
        }
        Some((w as u32, h as u32, pixels))
    }
}

pub fn extract(key: &str) -> Result<(Vec<u8>, &'static str), String> {
    com_init();
    let hbmp = unsafe {
        let item: IShellItem = SHCreateItemFromParsingName(&HSTRING::from(key), None).err_str()?;
        let factory: IShellItemImageFactory = item.cast().err_str()?;
        factory
            .GetImage(SIZE { cx: ICON_SIZE, cy: ICON_SIZE }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK)
            .err_str()?
    };
    let rgba = bitmap_to_rgba(hbmp);
    unsafe {
        let _ = DeleteObject(hbmp);
    }
    let (w, h, pixels) = rgba.ok_or(crate::i18n::tr("falha ao ler o bitmap do ícone", "couldn't read the icon bitmap"))?;
    let img = image::RgbaImage::from_raw(w, h, pixels).ok_or(crate::i18n::tr("bitmap inválido", "invalid bitmap"))?;
    let mut png = Vec::new();
    img.write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png).err_str()?;
    Ok((png, "image/png"))
}
