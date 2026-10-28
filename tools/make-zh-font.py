"""Cuts the Chinese pixel font down to the characters the game writes.

갈무리 11 has only part of Simplified Chinese, so a zh game draws its hanzi in
Fusion Pixel Font 12px (SIL OFL 1.1, © TakWolf — assets-src/fonts/fusion,
licences beside it). The whole font is about 1 MB; the game uses a few hundred
of its characters, so this keeps only those: every non-Hangul character in
the Chinese strings and the patch notes, plus printable ASCII. It writes

    public/fonts/fusion/fusion-pixel-zh.woff2   (the font the game loads)
    public/fonts/fusion/OFL.txt, LICENSES/      (its licences, shipped with it)
    assets-src/fonts/fusion/chars.txt           (what it kept, and lacks.txt what
                                                 the font has no glyph for — test-i18n
                                                 checks the Chinese text against both)

Rerun it after adding Chinese text: a character left out falls back to the
system font, and test-i18n names it.

    python tools/make-zh-font.py
"""
import shutil
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets-src' / 'fonts' / 'fusion'
FONT = SOURCE / 'fusion-pixel-12px-proportional-zh_hans.ttf.woff2'
OUT = ROOT / 'public' / 'fonts' / 'fusion'
TEXTS = [ROOT / 'src' / 'i18n' / 'zh.ts', ROOT / 'src' / 'content' / 'patchNotes.ts']


def hangul(c: str) -> bool:
    return 0x1100 <= ord(c) <= 0x11FF or 0x3130 <= ord(c) <= 0x318F or 0xAC00 <= ord(c) <= 0xD7A3


def main() -> None:
    wanted = {chr(c) for c in range(0x20, 0x7F)}
    for path in TEXTS:
        wanted |= {c for c in path.read_text(encoding='utf-8') if ord(c) > 0x7F and not hangul(c)}
    font = TTFont(FONT)
    has = set(font.getBestCmap())
    kept = sorted(c for c in wanted if ord(c) in has)
    lacks = sorted(c for c in wanted if ord(c) not in has)

    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[ord(c) for c in kept])
    subsetter.subset(font)
    OUT.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(OUT / 'fusion-pixel-zh.woff2')

    shutil.copy(SOURCE / 'OFL.txt', OUT / 'OFL.txt')
    shutil.copytree(SOURCE / 'LICENSES', OUT / 'LICENSES', dirs_exist_ok=True)
    (SOURCE / 'chars.txt').write_text(''.join(kept), encoding='utf-8')
    (SOURCE / 'lacks.txt').write_text(''.join(lacks), encoding='utf-8')
    size = (OUT / 'fusion-pixel-zh.woff2').stat().st_size
    print(f'{len(kept)} characters, {size // 1024} KB; not in the font: {"".join(lacks)}')


if __name__ == '__main__':
    main()
