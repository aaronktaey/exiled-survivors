"""Builds the title logo's pixel letters into a web font.

The logo is drawn from 5x7 grids in src/systems/PixelFont.ts (A-Z). This
reads those grids, adds digits and the punctuation the game writes on the
same grid, maps lowercase onto the capitals, and writes
public/dev-fonts/exiled-pixel.woff2 (and its CSS). It has no Hangul: paired
with a Korean pixel font as the fallback (갈무리), it is one of the 폰트 비교
candidates on the dev server (src/systems/DevFonts.ts).

    python tools/make-logo-font.py
"""
import re
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'src' / 'systems' / 'PixelFont.ts'
OUT = ROOT / 'public' / 'dev-fonts'

PX = 100            # font units a pixel
ROWS = 7            # glyph height in pixels, cap height = ROWS * PX
GAP = 1             # pixels between letters

# What the game writes that the logo never drew: digits and punctuation, on its grid.
EXTRA = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '.': ['0', '0', '0', '0', '0', '0', '1'],
    ',': ['00', '00', '00', '00', '00', '01', '10'],
    ':': ['0', '0', '1', '0', '0', '1', '0'],
    ';': ['00', '00', '01', '00', '00', '01', '10'],
    '!': ['1', '1', '1', '1', '1', '0', '1'],
    '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
    '-': ['000', '000', '000', '111', '000', '000', '000'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
    '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
    '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
    '(': ['001', '010', '100', '100', '100', '010', '001'],
    ')': ['100', '010', '001', '001', '001', '010', '100'],
    '[': ['111', '100', '100', '100', '100', '100', '111'],
    ']': ['111', '001', '001', '001', '001', '001', '111'],
    "'": ['1', '1', '0', '0', '0', '0', '0'],
    '"': ['101', '101', '000', '000', '000', '000', '000'],
    '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
    '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
    '<': ['0001', '0010', '0100', '1000', '0100', '0010', '0001'],
    '>': ['1000', '0100', '0010', '0001', '0010', '0100', '1000'],
    '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
    '×': ['00000', '10001', '01010', '00100', '01010', '10001', '00000'],
    '·': ['0', '0', '0', '1', '0', '0', '0'],
    '~': ['00000', '00000', '01000', '10101', '00010', '00000', '00000'],
}


def logo_glyphs() -> dict:
    text = SOURCE.read_text(encoding='utf-8')
    found = re.findall(r"^\s+(\w): \[([^\]]+)\],", text, re.M)
    return {ch: re.findall(r"'([01]+)'", rows) for ch, rows in found}


def draw(rows):
    """One rectangle a run of lit pixels in a row: fewer seams than a square a pixel."""
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        top = (ROWS - r) * PX
        c = 0
        while c < len(row):
            if row[c] != '1':
                c += 1
                continue
            start = c
            while c < len(row) and row[c] == '1':
                c += 1
            x0, x1 = start * PX, c * PX
            pen.moveTo((x0, top - PX))
            pen.lineTo((x0, top))
            pen.lineTo((x1, top))
            pen.lineTo((x1, top - PX))
            pen.closePath()
    return pen.glyph()


def main() -> None:
    glyphs = {**logo_glyphs(), **EXTRA}
    names = ['.notdef', 'space']
    outlines = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (5 * PX, 0), 'space': (4 * PX, 0)}
    cmap = {ord(' '): 'space'}
    for ch, rows in glyphs.items():
        name = f'uni{ord(ch):04X}'
        names.append(name)
        outlines[name] = draw(rows)
        width = max(len(row) for row in rows)
        metrics[name] = ((width + GAP) * PX, 0)
        cmap[ord(ch)] = name
        if ch.isalpha() and ch.isupper():
            cmap[ord(ch.lower())] = name

    fb = FontBuilder(unitsPerEm=1000, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(outlines)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=850, descent=-150)
    fb.setupNameTable({'familyName': 'Exiled Pixel', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=850, sTypoDescender=-150, usWinAscent=850, usWinDescent=150)
    fb.setupPost()
    OUT.mkdir(parents=True, exist_ok=True)
    fb.font.flavor = 'woff2'
    fb.save(str(OUT / 'exiled-pixel.woff2'))
    (OUT / 'exiled-pixel.css').write_text(
        "@font-face {\n  font-family: 'ExiledPixel';\n  src: url('exiled-pixel.woff2') format('woff2');\n  font-display: block;\n}\n",
        encoding='utf-8',
    )
    print(f'{len(glyphs)} glyphs -> {OUT / "exiled-pixel.woff2"}')


if __name__ == '__main__':
    main()
