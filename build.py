#!/usr/bin/env python3
"""
Сборка одностраничной версии игры: build.py -> game.html

Склеивает index.html + src/styles.css + src/*.js + картинки из assets/
в один автономный HTML-файл (все ресурсы внутри — работает офлайн,
удобно кидать на GitHub Pages или отдавать как один файл).

Модульная версия (index.html) при этом остаётся как есть.
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.resolve()
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
OUT = ROOT / "game.html"

COVERS = ["menu-bg", "sc-forest", "sc-ocean", "sc-space", "sc-noir", "sc-waste",
          "gw-azeroth", "gw-nightcity", "gw-runes", "gw-custom"]


def data_uri(path: pathlib.Path) -> str:
    suffix = path.suffix.lower()
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
            ".png": "image/png"}.get(suffix, "image/png")
    return "data:%s;base64,%s" % (mime, base64.b64encode(path.read_bytes()).decode("ascii"))


# Обложки — иллюстрации к карточкам, а не постеры: в WebP при 512 px они
# весят в полтора-два раза меньше и всё ещё выглядят хорошо на телефоне.
WEBP_MAX = 512
MENU_MAX = 1024


def webp_bytes(path: pathlib.Path, max_side: int, quality: int = 72):
    """Сжимаем картинку в WebP. Нет Pillow — возвращаем None и живём на JPEG."""
    try:
        from PIL import Image
    except Exception:
        return None
    try:
        img = Image.open(path).convert("RGB")
        if max(img.size) > max_side:
            k = max_side / float(max(img.size))
            img = img.resize((max(1, int(img.width * k)), max(1, int(img.height * k))), Image.LANCZOS)
        import io
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality, method=6)
        return buf.getvalue()
    except Exception as err:
        print("! WebP не вышел для %s: %s" % (path.name, err), file=sys.stderr)
        return None


def asset_uri(name: str, path: pathlib.Path) -> str:
    """Картинка в data-URI: сначала пробуем WebP, потом честный JPEG."""
    max_side = MENU_MAX if name == "menu-bg" else WEBP_MAX
    raw = webp_bytes(path, max_side)
    if raw:
        return "data:image/webp;base64,%s" % base64.b64encode(raw).decode("ascii")
    return data_uri(path)


def main() -> int:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    # скины тем: тот же интерфейс, другой материал (см. src/skins.css)
    css = (SRC / "styles.css").read_text(encoding="utf-8")\
        + "\n" + (SRC / "skins.css").read_text(encoding="utf-8")
    # материалы тем: картинки фактур вшиваются прямо в CSS (data:image/webp)
    themed = []
    for art in sorted((ASSETS / "themes").glob("*.webp")):
        token = "assets/themes/%s" % art.name
        if token in css:
            css = css.replace(token, data_uri(art))
            themed.append(art)
    if themed:
        print("материалы тем: %d файлов, %.0f КБ"
              % (len(themed), sum(f.stat().st_size for f in themed) / 1024.0))

    js_parts = [(SRC / name).read_text(encoding="utf-8")
                for name in ("metrics.js", "stories.js", "daily.js", "books.js", "engine.js", "backdrop.js",
                             "critters.js", "api.js", "app.js")]

    # 1. Встроить картинки меню/сценариев (и в CSS, и в JS-карту ассетов)
    assets_map = {}
    for name in COVERS:
        path = ASSETS / ("%s.jpg" % name)
        if not path.exists():
            print("! нет файла %s" % path, file=sys.stderr)
            return 1
        assets_map[name] = asset_uri(name, path)

    # картинки подставляются через window.DT_ASSETS, поэтому правки CSS не нужны

    assets_js = "<script>window.DT_ASSETS={%s};</script>" % ",".join(
        '"%s":"%s"' % (name, uri) for name, uri in assets_map.items()
    )

    # 1b. Иконки приложения — тоже внутрь файла
    if (ASSETS / "icon-192.png").exists():
        html = html.replace('href="assets/icon-192.png"', 'href="%s"' % data_uri(ASSETS / "icon-192.png"))
    if (ASSETS / "icon-180.png").exists():
        html = html.replace('href="assets/icon-180.png"', 'href="%s"' % data_uri(ASSETS / "icon-180.png"))
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '')

    # 2. Встроить CSS и JS
    html = html.replace(
        '<link rel="stylesheet" href="src/styles.css">\n'
        '  <link rel="stylesheet" href="src/skins.css">',
        "<style>\n%s\n</style>" % css,
    )
    scripts = "\n".join("<script>\n%s\n</script>" % js for js in js_parts)
    # lambda вместо строки-замены: иначе re.sub съест обратные слэши из JS-кода
    html = re.sub(
        r'<script src="src/engine\.js"></script>\s*'
        r'<script src="src/backdrop\.js"></script>\s*'
        r'<script src="src/critters\.js"></script>\s*'
        r'<script src="src/api\.js"></script>\s*'
        r'<script src="src/app\.js"></script>',
        lambda _m: assets_js + "\n" + scripts,
        html,
    )
    html = html.replace(
        "<title>Кости и Судьбы — текстовая RPG</title>",
        "<title>Кости и Судьбы — текстовая RPG (один файл)</title>\n"
        "  <!-- Собрано build.py: index.html + src + assets. Не редактируйте вручную. -->",
    )

    OUT.write_text(html, encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print("Готово: %s (%.0f КБ)" % (OUT.name, size_kb))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
