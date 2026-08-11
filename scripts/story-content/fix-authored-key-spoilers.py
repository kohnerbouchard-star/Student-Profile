from __future__ import annotations

from pathlib import Path

path = Path("scripts/story-content/build-act3-act8-packs.py")
text = path.read_text(encoding="utf-8")
replacements = {
    '"false-calm-posture"': '"year-end-stabilization-posture"',
    'news.campaign.d148.false-calm.v1': 'news.campaign.d148.partial-stabilization.v1',
    'country_news(news,152,"false-calm"': 'country_news(news,152,"year-end-stabilization"',
    '(150,"false-calm-recovery"': '(150,"year-end-stabilization"',
    'event.campaign.d155.false-calm-posture-callback.v1': 'event.campaign.d155.year-end-stabilization-posture-callback.v1',
    'news.campaign.d197.pre-attack-anomalies.v1': 'news.campaign.d197.verification-anomalies.v1',
}
for old, new in replacements.items():
    count = text.count(old)
    if count < 1:
        raise SystemExit(f"expected public-key spoiler token missing from builder: {old}")
    text = text.replace(old, new)

if "false-calm" in text:
    raise SystemExit("builder still contains false-calm in executable source")
if "pre-attack" in text:
    raise SystemExit("builder still contains pre-attack in executable source")

compile(text, str(path), "exec")
path.write_text(text, encoding="utf-8")
