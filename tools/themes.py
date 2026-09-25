#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/themes.py — материалы тем из картинок.

Оформление тем раньше рисовалось только градиентами CSS: получалось плоско
(«что лёд, что закат — всё плохо»). Теперь у каждой темы свой настоящий
материал — фон и фактура, сгенерированные картинкой и сжатые в WebP.

Что делает скрипт:
  assets/themes/<тема>-bg.png   → assets/themes/<тема>-bg.webp   (фон экрана, 640×1148)
  assets/themes/<тема>-tex.png  → assets/themes/<тема>-tex.webp  (фактура кнопок, 448×448)

Мастера PNG остаются в assets/themes/_src/ — из них можно пересобрать WebP
с другим качеством. Промпты для генерации (чтобы можно было повторить):

  ice-bg        вертикальные обои, роскошная морозная ледяная поверхность,
                бледно-голубые кристаллы и трещины, холодный свет, тихо
  ice-tex       квадратная фактура, иней и морозные кристаллы, ровный свет
  sunset-bg     закатное небо над тёмным морем, оранжево-розовый градиент, дымка
  sunset-tex    квадратная фактура, тёплый лён с золотым блеском
  neon-bg       киберпанк-ночь под дождём, неон в мягком боке, мокрый асфальт
  neon-tex      квадратная фактура, тёмный шлифованный металл с царапинами
  night-bg      ночной туман над чёрной водой, бирюзовое свечение горизонта
  night-tex     квадратная фактура, тёмное дымчатое стекло с мягким блеском
  terminal-bg   фосфорный след ЭЛТ на чёрном, строки развёртки, свечение
  terminal-tex  квадратная фактура, чёрный экран ЭЛТ со строками развёртки
  material-bg   спокойный светлый фон с мягкими формами (следующий заход)
  material-tex  квадратная фактура, белая бумага с мелким зерном
  ink-bg        тёмное дерево с медной пылью, глубокие тени
  ink-tex       квадратная фактура, кованая медь с молоточным узором

Запуск: python3 tools/themes.py
"""
import pathlib
import sys

try:
    from PIL import Image
except Exception as err:                                  # pragma: no cover
    print('нет Pillow: %s' % err, file=sys.stderr)
    raise SystemExit(1)

ROOT = pathlib.Path(__file__).parent.parent.resolve()
THEMES = ROOT / 'assets' / 'themes'
MASTERS = THEMES / '_src'

# Тема → (наличие, размеры). Фон — вертикальный, фактура — квадратная.
BG = (640, 1148)
TEX = (448, 448)
QUALITY_BG = 72
QUALITY_TEX = 68


def convert(src: pathlib.Path, dst: pathlib.Path, size, quality: int) -> int:
    """Сжать картинку в WebP нужного размера. Возвращает вес в байтах."""
    img = Image.open(src).convert('RGB')
    if max(img.size) > max(size):
        img = img.copy()
        img.thumbnail(size, Image.LANCZOS)
    img.save(dst, format='WEBP', quality=quality, method=6)
    return dst.stat().st_size


def main() -> int:
    if not MASTERS.exists():
        MASTERS.mkdir(parents=True)
    moved = 0
    for kind, size, quality in (('bg', BG, QUALITY_BG), ('tex', TEX, QUALITY_TEX)):
        for png in sorted(THEMES.glob('*-%s.png' % kind)):
            theme = png.name.split('-')[0]
            webp = THEMES / ('%s-%s.webp' % (theme, kind))
            before = convert(png, webp, size, quality)
            # мастер уносим в _src: рабочая папка остаётся лёгкой
            try:
                png.replace(MASTERS / png.name)
                moved += 1
            except Exception:
                pass
            print('  %-22s %6.1f КБ' % (webp.name, before / 1024.0))
    total = sum(f.stat().st_size for f in THEMES.glob('*.webp'))
    print('материалов: %d файлов, %.0f КБ; мастеров перенесено: %d'
          % (len(list(THEMES.glob('*.webp'))), total / 1024.0, moved))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
