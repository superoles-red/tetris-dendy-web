#!/usr/bin/env python3
"""Build the Tengen/PSCD menu typeface from the two bundled cartridges.

Requires fontTools. Run from any directory with python3 tools/build-font.py.
"""
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen


ROOT = Path(__file__).resolve().parents[1]
PIXEL = 128

# In the translation's main 8x8 alphabet, several Cyrillic letters occupy
# digit slots or the second group of letters after the English alphabet.
RUSSIAN_TILES = {
    "А": 0x41, "Б": 0x42, "В": 0x43, "Г": 0x44, "Д": 0x45, "Е": 0x46,
    "Ё": 0x48, "Ж": 0x47, "З": 0x33, "И": 0x49, "Й": 0x4A, "К": 0x4B,
    "Л": 0x4C, "М": 0x4D, "Н": 0x4E, "О": 0x30, "П": 0x50, "Р": 0x51,
    "С": 0x52, "Т": 0x53, "У": 0x54, "Ф": 0x55, "Х": 0x56, "Ц": 0x82,
    "Ч": 0x34, "Ш": 0x57, "Ъ": 0x4F, "Ы": 0x83, "Ь": 0x84, "Э": 0x58,
    "Ю": 0x59, "Я": 0x5A,
}


def chr_data(filename):
    rom = (ROOT / filename).read_bytes()
    first_chr = 16 + (512 if rom[6] & 4 else 0) + 16384 * rom[4]
    return rom[first_chr:]


def tile(data, index):
    # The alphabet is drawn in plane 0 of each 16-byte NES tile.
    return data[16 * index:16 * index + 8]


def outline(rows):
    pen = TTGlyphPen(None)
    for y, bits in enumerate(rows):
        for x in range(8):
            if bits & (0x80 >> x):
                left, top = x * PIXEL, (8 - y) * PIXEL
                bottom, right = top - PIXEL, left + PIXEL
                pen.moveTo((left, bottom))
                pen.lineTo((left, top))
                pen.lineTo((right, top))
                pen.lineTo((right, bottom))
                pen.closePath()
    return pen.glyph()


def build():
    english = chr_data('game.nes')
    russian = chr_data('game-ru.nes')
    rows = {' ': bytes(8)}
    for char in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ':
        rows[char] = tile(english, ord(char))
    rows.update({char: tile(russian, index) for char, index in RUSSIAN_TILES.items()})
    # PSCD supplies Ш and Ц but no Щ. Use Ш and the descender row of Ц.
    rows['Щ'] = rows['Ш'][:7] + rows['Ц'][7:]

    glyphs = {'.notdef': outline(bytes(8))}
    metrics = {'.notdef': (8 * PIXEL, 0)}
    cmap = {}
    for char, bitmap in rows.items():
        name = f'uni{ord(char):04X}'
        glyphs[name] = outline(bitmap)
        if char.isascii():
            bearing = 0  # retain the original web port's Latin metrics
        else:
            bearing = next(x for x in range(8) if any(b & (0x80 >> x) for b in bitmap)) * PIXEL
        metrics[name] = (8 * PIXEL, bearing)
        cmap[ord(char)] = name
        # Both cartridge alphabets use capitals, including for menu labels.
        cmap[ord(char.lower())] = name

    builder = FontBuilder(8 * PIXEL, isTTF=True)
    builder.setupGlyphOrder(list(glyphs))
    builder.setupCharacterMap(cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=8 * PIXEL, descent=0)
    builder.setupNameTable({'familyName': 'Tengen Tiles', 'styleName': 'Regular',
                            'psName': 'TengenTiles', 'fullName': 'Tengen Tiles'})
    builder.setupOS2(sTypoAscender=8 * PIXEL, sTypoDescender=0,
                     usWinAscent=8 * PIXEL, usWinDescent=0)
    builder.setupPost()
    builder.setupMaxp()
    builder.font.recalcTimestamp = False
    builder.font['head'].created = builder.font['head'].modified = 2082844800
    builder.save(ROOT / 'assets' / 'tengen.ttf')


if __name__ == '__main__':
    build()
