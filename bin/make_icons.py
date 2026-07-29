#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "CairoSVG>=2.8.2",
#     "Pillow>=11.3.0",
# ]
# ///

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image


BACKGROUND = "#f7fafc"
MASTER_SIZE = 1024
SOURCE_SVG = """\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 4 248 248" fill="#3b6ef5">
  <path d="M240,112v32a16,16,0,0,1-16,16h-8l-18.1,50.69a8,8,0,0,1-7.54,5.31H177.64a8,8,0,0,1-7.54-5.31L166.29,200H97.71L93.9,210.69A8,8,0,0,1,86.36,216H73.64a8,8,0,0,1-7.54-5.31L53,174a79.7,79.7,0,0,1-21-54h0a80,80,0,0,1,80-80h32a80,80,0,0,1,73.44,48.22,82.22,82.22,0,0,1,2.9,7.78H224A16,16,0,0,1,240,112Z" opacity="0.35"/>
  <path d="M192,116a12,12,0,1,1-12-12A12,12,0,0,1,192,116ZM152,64H112a8,8,0,0,0,0,16h40a8,8,0,0,0,0-16Zm96,48v32a24,24,0,0,1-24,24h-2.36l-16.21,45.38A16,16,0,0,1,190.36,224H177.64a16,16,0,0,1-15.07-10.62L160.65,208h-57.3l-1.92,5.38A16,16,0,0,1,86.36,224H73.64a16,16,0,0,1-15.07-10.62L46,178.22a87.69,87.69,0,0,1-21.44-48.38A16,16,0,0,0,16,144a8,8,0,0,1-16,0,32,32,0,0,1,24.28-31A88.12,88.12,0,0,1,112,32H216a8,8,0,0,1,0,16H194.61a87.93,87.93,0,0,1,30.17,37c.43,1,.85,2,1.25,3A24,24,0,0,1,248,112Zm-16,0a8,8,0,0,0-8-8h-3.66a8,8,0,0,1-7.64-5.6A71.9,71.9,0,0,0,144,48H112A72,72,0,0,0,58.91,168.64a8,8,0,0,1,1.64,2.71L73.64,208H86.36l3.82-10.69A8,8,0,0,1,97.71,192h68.58a8,8,0,0,1,7.53,5.31L177.64,208h12.72l18.11-50.69A8,8,0,0,1,216,152h8a8,8,0,0,0,8-8Z"/>
</svg>
"""


def render_svg(size: int) -> Image.Image:
    png = cairosvg.svg2png(
        bytestring=SOURCE_SVG.encode(),
        output_width=size,
        output_height=size,
    )
    return Image.open(BytesIO(png)).convert("RGBA")


def make_icon(size: int, icon_scale: float, background: str | None) -> Image.Image:
    canvas = Image.new(
        "RGBA",
        (MASTER_SIZE, MASTER_SIZE),
        background or (0, 0, 0, 0),
    )
    icon_size = round(MASTER_SIZE * icon_scale)
    icon = render_svg(icon_size)
    offset = (MASTER_SIZE - icon_size) // 2
    canvas.alpha_composite(icon, (offset, offset))
    if size == MASTER_SIZE:
        return canvas
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    output_dir = repo_root / "frontend" / "public" / "icons"
    output_dir.mkdir(parents=True, exist_ok=True)

    outputs = {
        "app-icon-1024.png": make_icon(1024, 0.86, BACKGROUND),
        "app-icon-512.png": make_icon(512, 0.86, BACKGROUND),
        "app-icon-192.png": make_icon(192, 0.86, BACKGROUND),
        "apple-touch-icon-180.png": make_icon(180, 0.86, BACKGROUND).convert("RGB"),
        "favicon-48.png": make_icon(48, 1.0, None),
        "favicon-32.png": make_icon(32, 1.0, None),
        "favicon-16.png": make_icon(16, 1.0, None),
        "maskable-512.png": make_icon(512, 0.70, BACKGROUND),
        "maskable-192.png": make_icon(192, 0.70, BACKGROUND),
    }

    for name, image in outputs.items():
        image.save(output_dir / name, format="PNG")

    outputs["favicon-48.png"].save(
        output_dir / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    print(f"Wrote {len(outputs) + 1} icons to {output_dir}")


if __name__ == "__main__":
    main()
