#!/usr/bin/env python3
"""
Genera los assets visuales de Adhan Companion:
- app icon master 1024px (para `pnpm tauri icon`)
- íconos del tray por estado 32px (gris/azul/ámbar/verde del spec)

Glyph: luna creciente + estrella de 4 puntas. PIL puro, supersampled 8x.
"""
import math
import os

from PIL import Image, ImageChops, ImageDraw

S = 8  # supersample factor

ACENTO_OSCURO = (0x0E, 0x6F, 0x63, 255)
ACENTO_CLARO = (0x27, 0xA0, 0x8E, 255)
BLANCO = (255, 255, 255, 255)
ORO = (0xF4, 0xD0, 0x6F, 255)

# geometría normalizada a un lienzo 1024 (ideal 1:1 entre master y tray)
CIRCLE_A = (410, 470, 250)  # centro x, centro y, radio
CIRCLE_B = (560, 430, 215)


def circle_mask(canvas: int, cx: int, cy: int, r: int) -> Image.Image:
    """Mask L del tamaño del canvas supersampleado — coords ya en unidades S"""
    im = Image.new("L", (canvas, canvas), 0)
    d = ImageDraw.Draw(im)
    d.ellipse((cx * S - r * S, cy * S - r * S, cx * S + r * S, cy * S + r * S), fill=255)
    return im


def star_mask(canvas: int, cx: int, cy: int, r: int) -> Image.Image:
    im = Image.new("L", (canvas, canvas), 0)
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(8):
        ang = math.pi / 2 * (i / 2) - math.pi / 2
        rad = r if i % 2 == 0 else int(r * 0.18)
        pts.append((cx * S + rad * S * math.cos(ang), cy * S + rad * S * math.sin(ang)))
    d.polygon(pts, fill=255)
    return im


def colorize(mask: Image.Image, color: tuple) -> Image.Image:
    solid = Image.new("RGBA", mask.size, color)
    solid.putalpha(mask)
    return solid


def crescent_glyph(size_inner: int, crescent_color: tuple, star_color: tuple | None = None) -> Image.Image:
    canvas = size_inner * S
    # geometry normalized to 1024 → scale per measured size
    k = size_inner / 1024
    a = (int(CIRCLE_A[0] * k), int(CIRCLE_A[1] * k), int(CIRCLE_A[2] * k))
    b = (int(CIRCLE_B[0] * k), int(CIRCLE_B[1] * k), int(CIRCLE_B[2] * k))
    star = (int(665 * k), int(615 * k), int(95 * k))
    mask_crescent = ImageChops.subtract(
        circle_mask(canvas, a[0], a[1], a[2]),
        circle_mask(canvas, b[0], b[1], b[2]),
    )
    if star_color is None:
        star_color = crescent_color
    mask_crescent = ImageChops.add(mask_crescent, star_mask(canvas, star[0], star[1], star[2]))
    glyph = colorize(mask_crescent, crescent_color)
    if star_color is not None:
        glyph_star = colorize(star_mask(canvas, star[0], star[1], star[2]), star_color)
        glyph = Image.alpha_composite(glyph, glyph_star)
    return glyph.resize((size_inner, size_inner), Image.LANCZOS)


def master_icon(path_out: str) -> None:
    size = 1024
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # fondo degradado vertical con esquinas redondeadas (squircle-ish: radius 320)
    grad = Image.new("RGBA", (size, size))
    top, bottom = ACENTO_OSCURO, ACENTO_CLARO
    for y in range(size):
        t = y / size
        col = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        ImageDraw.Draw(grad).line([(0, y), (size, y)], fill=col)
    mask_sq = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask_sq).rounded_rectangle((0, 0, size - 1, size - 1), radius=320, fill=255)
    im.paste(grad, (0, 0), mask_sq)
    glyph = crescent_glyph(size, BLANCO, ORO)
    im = Image.alpha_composite(im, glyph)
    im.save(path_out)
    print("master icon →", path_out)


def tray_icon(path_out: str, color: tuple) -> None:
    size = 32
    im = crescent_glyph(size, color, color)
    im.save(path_out)
    print("tray icon →", path_out, color)


if __name__ == "__main__":
    ROOT = "/home/usuario/personal/code/adhan-companion"
    os.makedirs("/tmp/opencode", exist_ok=True)
    tray_dir = os.path.join(ROOT, "src-tauri", "assets", "tray")
    os.makedirs(tray_dir, exist_ok=True)
    master_icon("/tmp/opencode/adhan-master-1024.png")
    tray_icon(os.path.join(tray_dir, "silenciado.png"), (0x9E, 0x9E, 0x9E, 255))
    tray_icon(os.path.join(tray_dir, "dia.png"), (0x21, 0x96, 0xF3, 255))
    tray_icon(os.path.join(tray_dir, "proximo.png"), (0xFF, 0x98, 0x00, 255))
    tray_icon(os.path.join(tray_dir, "adhan.png"), (0x4C, 0xAF, 0x50, 255))
