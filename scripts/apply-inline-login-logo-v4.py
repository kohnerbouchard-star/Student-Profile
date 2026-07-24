#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
SMOKE = ROOT / "scripts/login-surface-browser-smoke.mjs"
SOURCE = ROOT / "assets/brand/econovaria-logo.png"

with Image.open(SOURCE) as image:
    image = image.convert("RGB")
    image.thumbnail((480, 270), Image.Resampling.LANCZOS)
    if image.size != (480, 270):
        raise SystemExit(f"Unexpected resized logo dimensions: {image.size}")
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)

payload = base64.b64encode(output.getvalue()).decode("ascii")
data_uri = f"data:image/png;base64,{payload}"

html = INDEX.read_text(encoding="utf-8")
old = '<img src="./assets/brand/econovaria-logo.png?v=20260724.4" width="1200" height="675" alt="Econovaria" decoding="async" fetchpriority="high" data-econovaria-brand-image />'
new = f'<img src="{data_uri}" width="480" height="270" alt="Econovaria" decoding="sync" data-econovaria-brand-image data-econovaria-brand-source="inline" />'
if old not in html:
    raise SystemExit("Expected external login logo element was not found")
html = html.replace(old, new, 1)
INDEX.write_text(html, encoding="utf-8")

smoke = SMOKE.read_text(encoding="utf-8")
smoke = smoke.replace(
    '      logoStatus: logoResponse.status,\n      logoType: logoResponse.headers.get("content-type") || "",',
    '      logoStatus: logoResponse.status,\n      logoType: logoResponse.headers.get("content-type") || "",\n      logoSource: logo?.getAttribute("src") || "",\n      logoMode: logo?.getAttribute("data-econovaria-brand-source") || "",',
    1,
)
smoke = smoke.replace('  assert.ok(surface.logoNaturalWidth >= 1000);', '  assert.equal(surface.logoNaturalWidth, 480);', 1)
smoke = smoke.replace('  assert.ok(surface.logoNaturalHeight >= 600);', '  assert.equal(surface.logoNaturalHeight, 270);', 1)
smoke = smoke.replace(
    '  assert.match(surface.logoType, /image\\/png/);',
    '  assert.match(surface.logoType, /image\\/png/);\n  assert.ok(surface.logoSource.startsWith("data:image/png;base64,"));\n  assert.equal(surface.logoMode, "inline");',
    1,
)
SMOKE.write_text(smoke, encoding="utf-8")

print(f"Embedded optimized login logo: {len(output.getvalue())} bytes, {len(data_uri)} URI characters")
