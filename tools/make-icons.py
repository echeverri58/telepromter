#!/usr/bin/env python3
"""
make-icons.py — genera los iconos PNG del Teleprompter a partir de un dibujo
vectorial hecho con Pillow (sin dependencias externas de SVG).

Uso (desde la raíz del repositorio):

    python tools/make-icons.py

Requisitos: Python 3 + Pillow  (pip install pillow)

Genera en icons/:
    icon-180.png            apple-touch-icon (iOS)
    icon-192.png            icono normal
    icon-512.png            icono normal
    icon-maskable-192.png   icono maskable (Android, zona segura del 80 %)
    icon-maskable-512.png   icono maskable (Android, zona segura del 80 %)

Diseño: pantalla blanca redondeada con tres renglones de texto y el renglón
central en rojo (el guion que se lee). Fondo oscuro con degradado.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"

# Paleta
BG_TOP = (27, 39, 53)      # #1b2735
BG_BOTTOM = (7, 10, 15)    # #070a0f
SCREEN = (244, 248, 253)   # #f4f8fd
INK = (16, 24, 34)         # #101822
ACCENT = (255, 59, 48)     # #ff3b30

SUPERSAMPLE = 4            # dibujamos 4x y reducimos: bordes suaves


def gradient(size: int) -> Image.Image:
    """Degradado diagonal oscuro, opaco de borde a borde."""
    y, x = np.mgrid[0:size, 0:size]
    t = (x * 0.35 + y * 0.65) / (size * 0.35 + size * 0.65)
    top = np.array(BG_TOP, dtype=np.float32)
    bottom = np.array(BG_BOTTOM, dtype=np.float32)
    arr = top * (1.0 - t)[..., None] + bottom * t[..., None]
    return Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")


def render(size: int, glyph_scale: float = 1.0) -> Image.Image:
    """Dibuja el icono a `size` px. glyph_scale encoge el símbolo (maskable)."""
    big = size * SUPERSAMPLE
    k = big / 512.0                    # unidades de diseño (viewBox 512) -> px
    img = gradient(big)
    draw = ImageDraw.Draw(img)

    def pt(value: float) -> float:
        return value * k

    # Símbolo centrado; para maskable se escala sobre el centro.
    cx = cy = 256.0

    def scale_box(x0, y0, x1, y1):
        """Escala un rectángulo alrededor del centro (256,256)."""
        xa = cx + (x0 - cx) * glyph_scale
        xb = cx + (x1 - cx) * glyph_scale
        ya = cy + (y0 - cy) * glyph_scale
        yb = cy + (y1 - cy) * glyph_scale
        return (pt(xa), pt(ya), pt(xb), pt(yb))

    # Sombra suave de la pantalla
    shadow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        scale_box(96, 120, 416, 392),
        radius=pt(44 * glyph_scale),
        fill=(0, 0, 0, 140),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(pt(16)))
    img = Image.alpha_composite(img, shadow)
    draw = ImageDraw.Draw(img)

    # Pantalla blanca
    draw.rounded_rectangle(
        scale_box(96, 120, 416, 392),
        radius=pt(44 * glyph_scale),
        fill=SCREEN,
    )

    # Tres renglones de "texto"
    bars = [
        (140, 187, 310, 217, INK),      # ancho 170
        (140, 241, 372, 271, ACCENT),   # ancho 232 (renglón que se lee)
        (140, 295, 280, 325, INK),      # ancho 140
    ]
    for x0, y0, x1, y1, color in bars:
        draw.rounded_rectangle(
            scale_box(x0, y0, x1, y1),
            radius=pt(15 * glyph_scale),
            fill=color,
        )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-180.png", 180, 1.0),
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("icon-maskable-192.png", 192, 0.82),
        ("icon-maskable-512.png", 512, 0.82),
    ]
    for name, size, scale in jobs:
        image = render(size, scale)
        image.save(OUT / name, "PNG", optimize=True)
        print(f"  {name:24} {size}x{size}  (simbolo al {scale * 100:.0f} %)")


if __name__ == "__main__":
    main()
