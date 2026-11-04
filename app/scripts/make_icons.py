"""Erzeugt Android-App-Icons und Splash-Bilder aus ../icon-512.png (einmalig nach `npx cap add android` ausführen)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT.parent / 'icon-512.png'
RES = ROOT / 'android/app/src/main/res'
RED = (200, 56, 30, 255)

src = Image.open(SRC).convert('RGBA')
# weißes Symbol freistellen
glyph = Image.new('RGBA', src.size, (0, 0, 0, 0))
px, gp = src.load(), glyph.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = px[x, y]
        if r > 180 and g > 180 and b > 180:
            gp[x, y] = (255, 255, 255, 255)
glyph = glyph.crop(glyph.getbbox())

def compose(size, glyph_ratio, bg=RED):
    im = Image.new('RGBA', (size, size), bg)
    g = glyph.copy()
    g.thumbnail((int(size * glyph_ratio), int(size * glyph_ratio)), Image.LANCZOS)
    im.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
    return im

SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dpi, s in SIZES.items():
    d = RES / f'mipmap-{dpi}'
    compose(s, 0.55).save(d / 'ic_launcher.png')
    rnd = compose(s, 0.5)
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(rnd, (0, 0), mask)
    out.save(d / 'ic_launcher_round.png')
    fs = int(s * 108 / 48)
    compose(fs, 0.36, bg=(0, 0, 0, 0)).save(d / 'ic_launcher_foreground.png')

(RES / 'values/ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#C8381E</color>\n</resources>\n')

for f in RES.glob('drawable*/splash.png'):
    w, h = Image.open(f).size
    im = Image.new('RGBA', (w, h), RED)
    g = glyph.copy()
    t = int(min(w, h) * 0.28)
    g.thumbnail((t, t), Image.LANCZOS)
    im.alpha_composite(g, ((w - g.width) // 2, (h - g.height) // 2))
    im.convert('RGB').save(f)
print('Icons erzeugt')
