#!/bin/sh
# Gera os ícones de todas as plataformas a partir dos SVGs (app-icon.svg e src-tauri/icons/source).
# Em 32px ou menos o símbolo vira a versão simplificada (barra + app em foco), também dentro do
# .ico e do .icns. O .icns precisa do `iconutil`, então este script roda no macOS.
set -e
cd "$(dirname "$0")/.."
ICONS=src-tauri/icons
SRC=$ICONS/source
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

npx tauri icon app-icon.svg -o "$ICONS"
rm -rf "$ICONS/android" "$ICONS/ios"
npx tauri icon "$SRC/app-icon-small.svg" -o "$TMP/small" -p 16,24,30,32
npx tauri icon app-icon.svg -o "$TMP/full" -p 48,64,128,256,512,1024
npx tauri icon "$SRC/tray.svg" -o "$TMP/tray" -p 32
npx tauri icon "$SRC/tray-template.svg" -o "$TMP/tray-template" -p 32

cp "$TMP/small/32x32.png" "$ICONS/32x32.png"
cp "$TMP/small/30x30.png" "$ICONS/Square30x30Logo.png"
cp "$TMP/tray/32x32.png" "$ICONS/tray.png"
cp "$TMP/tray-template/32x32.png" "$ICONS/tray-template.png"

python3 - "$ICONS/icon.ico" "$TMP" <<'PY'
import struct, sys
out, tmp = sys.argv[1], sys.argv[2]
layers = [f"{tmp}/small/{s}x{s}.png" for s in (16, 24, 32)] + [f"{tmp}/full/{s}x{s}.png" for s in (48, 64, 256)]
pngs = [open(p, "rb").read() for p in layers]
sizes = [16, 24, 32, 48, 64, 256]
offset = 6 + 16 * len(pngs)
header = struct.pack("<HHH", 0, 1, len(pngs))
entries = b""
for size, data in zip(sizes, pngs):
    entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
open(out, "wb").write(header + entries + b"".join(pngs))
PY

ICONSET="$TMP/icon.iconset"
mkdir "$ICONSET"
cp "$TMP/small/16x16.png" "$ICONSET/icon_16x16.png"
cp "$TMP/small/32x32.png" "$ICONSET/icon_16x16@2x.png"
cp "$TMP/small/32x32.png" "$ICONSET/icon_32x32.png"
cp "$TMP/full/64x64.png" "$ICONSET/icon_32x32@2x.png"
cp "$TMP/full/128x128.png" "$ICONSET/icon_128x128.png"
cp "$TMP/full/256x256.png" "$ICONSET/icon_128x128@2x.png"
cp "$TMP/full/256x256.png" "$ICONSET/icon_256x256.png"
cp "$TMP/full/512x512.png" "$ICONSET/icon_256x256@2x.png"
cp "$TMP/full/512x512.png" "$ICONSET/icon_512x512.png"
cp "$TMP/full/1024x1024.png" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$ICONS/icon.icns"
