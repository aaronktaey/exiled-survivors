"""Cuts 갈무리 11 down to the characters the game writes.

갈무리 11 (SIL OFL 1.1, © Lee Minseo — assets-src/fonts/galmuri, licence
beside it) draws every Hangul, kana and kanji the game shows, and the whole
pair of files is about 670 KB, most of it syllables the game never writes.
This keeps only what the source writes: every non-ASCII character in src/
(the locales, the patch notes, the tables' Korean names), plus printable
ASCII and the KS X 1001 Hangul (the 2,350 everyday syllables), so a name a
player brings with them — a sign-in name — is still drawn in the game's
font. It writes

    public/fonts/galmuri/Galmuri11.woff2, Galmuri11-Bold.woff2   (what the game loads)
    public/fonts/galmuri/LICENSE.txt                              (its licence, shipped with it)
    assets-src/fonts/galmuri/chars.txt                            (what it kept from the source)

Rerun it after adding text in a new character: one left out falls back to
the system font, and test-i18n names it.

    python tools/make-ko-font.py
"""
import shutil
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets-src' / 'fonts' / 'galmuri'
OUT = ROOT / 'public' / 'fonts' / 'galmuri'
FACES = ['Galmuri11.woff2', 'Galmuri11-Bold.woff2']


def everyday_hangul() -> set:
    """The 2,350 syllables of KS X 1001, read off the EUC-KR table."""
    out = set()
    for lead in range(0xB0, 0xC9):
        for trail in range(0xA1, 0xFF):
            try:
                out.add(bytes([lead, trail]).decode('euc-kr'))
            except UnicodeDecodeError:
                pass
    return out


def main() -> None:
    written = set()
    for path in (ROOT / 'src').rglob('*.ts'):
        written |= {c for c in path.read_text(encoding='utf-8') if ord(c) > 0x7F}
    wanted = written | {chr(c) for c in range(0x20, 0x7F)} | everyday_hangul()
    OUT.mkdir(parents=True, exist_ok=True)
    for face in FACES:
        font = TTFont(SOURCE / face)
        has = set(font.getBestCmap())
        kept = [ord(c) for c in wanted if ord(c) in has]
        options = subset.Options()
        options.flavor = 'woff2'
        options.layout_features = ['*']
        options.name_IDs = ['*']
        options.notdef_outline = True
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=kept)
        subsetter.subset(font)
        font.flavor = 'woff2'
        font.save(OUT / face)
        print(f'{face}: {len(kept)} characters, {(OUT / face).stat().st_size // 1024} KB')
    shutil.copy(SOURCE / 'LICENSE.txt', OUT / 'LICENSE.txt')
    (SOURCE / 'chars.txt').write_text(''.join(sorted(written)), encoding='utf-8')


if __name__ == '__main__':
    main()
