//! Ícones em alta resolução de qualquer coisa que o shell entenda (.exe, .lnk, pastas,
//! `shell:AppsFolder\<AUMID>`), convertidos para PNG e cacheados em disco.

use std::hash::{Hash, Hasher};
use std::io::Cursor;

use base64::Engine;
use windows::core::{Interface, HSTRING};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HBITMAP,
};
use windows::Win32::UI::Shell::{IShellItem, IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY};

use crate::util::{com_init, data_dir, reject_network_path, ErrStr};

const ICON_SIZE: i32 = 256;

fn cache_path(key: &str) -> std::path::PathBuf {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    key.to_lowercase().hash(&mut hasher);
    let dir = data_dir().join("icons");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(format!("{:016x}.png", hasher.finish()))
}

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
        let has_alpha = pixels.chunks_exact(4).any(|p| p[3] != 0);
        for p in pixels.chunks_exact_mut(4) {
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

fn extract_png(key: &str) -> Result<Vec<u8>, String> {
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
    let (w, h, pixels) = rgba.ok_or("falha ao ler o bitmap do ícone")?;
    let img = image::RgbaImage::from_raw(w, h, pixels).ok_or("bitmap inválido")?;
    let mut png = Vec::new();
    img.write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png).err_str()?;
    Ok(png)
}

pub fn icon_data_url(key: &str) -> Result<String, String> {
    reject_network_path(key)?;
    let path = cache_path(key);
    let png = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => {
            let bytes = extract_png(key)?;
            let _ = std::fs::write(&path, &bytes);
            bytes
        }
    };
    Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
}

#[tauri::command]
pub async fn get_icon(key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || icon_data_url(&key)).await.err_str()?
}
