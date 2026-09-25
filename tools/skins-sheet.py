#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Общий лист скинов: все девять тем на одном снимке.

Берёт shots/v22-skin-<тема>.png (их снимает tools/skins.js) и склеивает
в один файл shots/v22-skins.png — так материал тем видно с одного взгляда.

    python3 tools/skins-sheet.py
"""
import pathlib
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception as err:  # pragma: no cover
    print('! нет Pillow: %s' % err, file=sys.stderr)
    raise SystemExit(1)

ROOT = pathlib.Path(__file__).parent.parent.resolve()
SHOTS = ROOT / 'shots'

THEMES = [
    ('night', 'Ночь'),
    ('material', 'Материальная'),
    ('neon', 'Киберпанк'),
    ('terminal', 'Терминал'),
    ('parchment', 'Пергамент'),
    ('ink', 'Тушь и медь'),
    ('sunset', 'Закат'),
    ('ice', 'Лёд'),
    ('oled', 'Чёрная'),
]

COL = 5                      # снимков в ряду
TILE_W = 300                 # ширина одной карточки на листе
PAD = 12
LABEL_H = 30
BG = (16, 18, 22)
LABEL = (232, 238, 244)


def font(size):
    for name in ('DejaVuSans-Bold.ttf', 'DejaVuSans.ttf'):
        path = pathlib.Path('/usr/share/fonts/truetype/dejavu') / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main() -> int:
    tiles = []
    for key, title in THEMES:
        path = SHOTS / ('v22-skin-%s.png' % key)
        if not path.exists():
            print('! нет снимка %s — сначала node tools/skins.js' % path.name, file=sys.stderr)
            return 1
        img = Image.open(path).convert('RGB')
        k = TILE_W / img.width
        img = img.resize((TILE_W, max(1, int(img.height * k))), Image.LANCZOS)
        tiles.append((title, img))

    tile_h = max(img.height for _t, img in tiles)
    rows = (len(tiles) + COL - 1) // COL
    cols = min(COL, len(tiles))
    cell_w = TILE_W + PAD * 2
    cell_h = tile_h + LABEL_H + PAD * 2
    sheet = Image.new('RGB', (cell_w * cols, cell_h * rows), BG)
    draw = ImageDraw.Draw(sheet)
    f = font(19)

    for i, (title, img) in enumerate(tiles):
        cx = (i % COL) * cell_w + PAD
        cy = (i // COL) * cell_h + PAD
        draw.text((cx, cy), title, font=f, fill=LABEL)
        sheet.paste(img, (cx, cy + LABEL_H))

    out = SHOTS / 'v22-skins.png'
    sheet.save(out, optimize=True)
    print('Готово: %s (%d КБ, %d×%d)' % (out.name, out.stat().st_size // 1024, sheet.width, sheet.height))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
