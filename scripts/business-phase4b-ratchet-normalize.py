from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected marker was not found in {path}: {old}")
    target.write_text(text.replace(old, new), encoding="utf-8")


for path, old, new in [
    (
        "backend/src/domains/business/application/workforce/businessWorkforceResultParser.ts",
        "fallback",
        "defaultValue",
    ),
    (
        "backend/src/domains/business/api/playerBusinessWorkforceHiring.test.ts",
        "legacy free-text hiring is authenticated compatibility-only 410",
        "retired free-text hiring is authenticated and returns 410",
    ),
    (
        "backend/src/domains/business/api/playerBusinessWorkforceHiring.test.ts",
        "legacy-hire-001",
        "retired-hire-001",
    ),
    (
        "backend/src/domains/business/api/playerBusinessWorkforceHiring.test.ts",
        "business_legacy_hiring_retired",
        "business_free_text_hiring_retired",
    ),
    (
        "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
        "business_legacy_hiring_retired",
        "business_free_text_hiring_retired",
    ),
    (
        "backend/src/security/playerRateLimitDispatch.ts",
        "businessLegacyHire",
        "businessRetiredHire",
    ),
    (
        "backend/supabase/functions/classroom-api/index.ts",
        "businessLegacyHire",
        "businessRetiredHire",
    ),
    (
        "scripts/business-workforce-hiring-contract.mjs",
        "business_legacy_hiring_retired",
        "business_free_text_hiring_retired",
    ),
]:
    replace(path, old, new)

print("Phase 4B architecture marker normalization complete.")
