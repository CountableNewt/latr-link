#!/usr/bin/env bash
# Minimal blue square PNG icons for the extension manifest (run once if icons are missing).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICON_DIR="$ROOT/public/icon"
mkdir -p "$ICON_DIR"

if command -v magick >/dev/null 2>&1; then
  for size in 16 32 48 128; do
    magick -size "${size}x${size}" xc:'#2563eb' "$ICON_DIR/${size}.png"
  done
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
import struct, zlib, pathlib
root = pathlib.Path(__file__).resolve().parents[1] / "public" / "icon"
root.mkdir(parents=True, exist_ok=True)

def png(size: int, path: pathlib.Path) -> None:
    r, g, b = 0x25, 0x63, 0xEB
    raw = b"".join(
        b"\x00" + bytes([r, g, b, 255]) * size for _ in range(size)
    )
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    path.write_bytes(data)

for s in (16, 32, 48, 128):
    png(s, root / f"{s}.png")
PY
  exit 0
fi

echo "Install ImageMagick or use python3 to generate icons." >&2
exit 1
