#!/usr/bin/env python3
"""Build the 1400x560 Chrome Web Store marquee from existing assets only.

  python3 scripts/build-store-marquee.py

Left: the brand lockup, headline and two feature chips cropped from the
design export store/promo/marquee-1400x560.png (from design/SkipSponsorAI.pen),
without the "Any language" chip (broader than what was tested). Right: pure
crops of the extension's real UI from the store screenshots (the popup's
header, timeline and segment list from 02, the cut note from 01), captured
from the packaged build on a public YouTube page. Nothing is drawn except the
background (the design's own base colour and purple glow), a rounded mask and
a shadow. Writes store/promo/marquee-real-ui-1400x560.png (RGB, no alpha).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / "store"
W, H = 1400, 560
BASE = (14, 17, 22)  # design background
GLOW = (26, 22, 52)  # design's purple glow (top right of the original)


def background() -> Image.Image:
    bg = Image.new("RGB", (W, H), BASE)
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((700, -420, 1700, 520), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    return Image.composite(Image.new("RGB", (W, H), GLOW), bg, glow)


def rounded(img: Image.Image, r: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), r, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def paste_card(canvas: Image.Image, card: Image.Image, xy: tuple[int, int]) -> None:
    shadow = Image.new("L", (card.width + 80, card.height + 80), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((40, 48, 40 + card.width, 48 + card.height), 16, fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas.paste(Image.new("RGB", shadow.size, (0, 0, 0)), (xy[0] - 40, xy[1] - 40), shadow)
    canvas.paste(card, xy, card)


def main() -> None:
    design = Image.open(STORE / "promo" / "marquee-1400x560.png").convert("RGB")
    canvas = background()

    # Left column from the design export, minus the third chip.
    left = design.crop((0, 0, 620, H))
    patch = left.crop((425, 420, 612, 470))  # plain background below the chips
    left.paste(patch, (425, 362))
    # Opaque up to x=560 (all text and chips), feathered to 0 at x=620.
    fade = Image.new("L", (620, H), 255)
    draw = ImageDraw.Draw(fade)
    for x in range(560, 620):
        draw.line((x, 0, x, H), fill=round(255 * (620 - x) / 60))
    canvas.paste(left, (0, 0), fade)

    # Real extension UI, cropped from the store screenshots (no edits).
    popup = Image.open(STORE / "screenshots" / "02-see-what-it-found.png").convert("RGB")
    popup = popup.crop((905, 18, 1245, 280))
    k = 1.42
    popup = popup.resize((round(popup.width * k), round(popup.height * k)), Image.Resampling.LANCZOS)
    paste_card(canvas, rounded(popup, 14), (800, 58))

    toast = Image.open(STORE / "screenshots" / "01-skips-sponsor-reads.png").convert("RGB")
    toast = toast.crop((903, 548, 1263, 615))
    toast = toast.resize((round(toast.width * k), round(toast.height * k)), Image.Resampling.LANCZOS)
    paste_card(canvas, rounded(toast, 12), (700, 418))

    out = STORE / "promo" / "marquee-real-ui-1400x560.png"
    canvas.convert("RGB").save(out, optimize=True)
    print(out.relative_to(ROOT), canvas.size)


if __name__ == "__main__":
    main()
