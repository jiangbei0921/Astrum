# 下载并打包行星等距贴图 -> data/planet-textures.js（Base64，离线/file:// 可用）
# 数据源：Solar System Scope（CC BY 4.0，可商用，需署名）
# 用法：python tools/build-planet-textures.py
# 说明：本脚本只读本地 tools/fixtures/planet-raw/，不联网。
import base64, io, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', 'fixtures', 'planet-raw')
OUT = os.path.join(ROOT, 'data', 'planet-textures.js')
BASE = 'https://www.solarsystemscope.com/textures/download/'
SRC = {
    'sun': '2k_sun.jpg',
    'mercury': '2k_mercury.jpg',
    'venus': '2k_venus_atmosphere.jpg',
    'earth': '2k_earth_daymap.jpg',
    'mars': '2k_mars.jpg',
    'jupiter': '2k_jupiter.jpg',
    'saturn': '2k_saturn.jpg',
    'uranus': '2k_uranus.jpg',
    'neptune': '2k_neptune.jpg',
    'moon': '2k_moon.jpg',
}
W, H, Q = 1024, 512, 82

os.makedirs(RAW, exist_ok=True)
from PIL import Image

out = {}
total = 0
for key, name in SRC.items():
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        sys.exit('missing %s — 请先手动放入 tools/fixtures/planet-raw/' % name)
    with open(path, 'rb') as f:
        if f.read(2) != b'\xff\xd8':
            sys.exit('not jpeg: ' + name)
    im = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=Q, optimize=True, progressive=False)
    b = buf.getvalue()
    total += len(b)
    out[key] = 'data:image/jpeg;base64,' + base64.b64encode(b).decode('ascii')
    print('%-8s %6.1f KB' % (key, len(b) / 1024))

js = (
    '/* ASTRUM · 行星等距贴图（离线内联）\n'
    ' * 来源：Solar System Scope — https://www.solarsystemscope.com/textures/\n'
    ' * 许可：CC BY 4.0（可商用，须署名）。已压缩为 1024x512 JPEG。\n'
    ' * 由 tools/build-planet-textures.py 生成，请勿手改。\n'
    ' */\n'
    'window.PLANET_TEX = ' +
    json.dumps({
        'version': '1.0.0',
        'license': 'CC BY 4.0',
        'attribution': 'Solar System Scope',
        'source': 'https://www.solarsystemscope.com/textures/',
        'w': W, 'h': H,
        'map': out,
    }, ensure_ascii=False, separators=(',', ':')) +
    ';\n'
)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(js)

print('total %.1f KB  -> %s (%.1f KB js)' % (total / 1024, OUT, os.path.getsize(OUT) / 1024))
