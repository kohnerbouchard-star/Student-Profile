#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one match in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def sub_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected exactly one regex match in {path}: {pattern[:160]!r}")
    file.write_text(updated, encoding="utf-8")


def align_capability_manifest() -> None:
    path = Path("backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts")
    text = path.read_text(encoding="utf-8")
    replacements = [
        (
            'export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-08-22.1" as const;',
            'export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-08-23.1" as const;',
        ),
        (
            '  | "businessProduction"\n  | "businessStatus"',
            '  | "businessProduction"\n  | "businessManufacturingJobs"\n  | "businessManufacturingStart"\n  | "businessManufacturingCancel"\n  | "businessStatus"',
        ),
    ]
    for old, new in replacements:
        if text.count(old) != 1:
            raise SystemExit(f"Capability manifest expected exactly one match: {old!r}")
        text = text.replace(old, new, 1)

    pattern = re.compile(
        r'''(?ms)^  \{\n    key: "businessProduction",\n    operations: \[\{\n      method: "POST",\n      pathTemplate: "/players/me/business/production-runs",\n    \}\],\n    actionCapabilities: \["businessProduction"\],\n  \},\n'''
    )
    match = pattern.search(text)
    if not match:
        raise SystemExit("Expected one Business production capability descriptor.")
    addition = match.group(0) + '''  {
    key: "businessManufacturingJobs",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/businesses/:businessKey/manufacturing/jobs",
    }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessManufacturingStart",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/businesses/:businessKey/manufacturing/jobs",
    }],
    actionCapabilities: ["businessProduction"],
  },
  {
    key: "businessManufacturingCancel",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/businesses/:businessKey/manufacturing/jobs/:jobKey/cancel",
    }],
    actionCapabilities: ["businessProduction"],
  },
'''
    text = text[: match.start()] + addition + text[match.end() :]
    path.write_text(text, encoding="utf-8")


def align_rate_limits() -> None:
    sub_once(
        "backend/src/security/playerRateLimitDispatch.ts",
        r'''(?m)^  businessProduction: byMethod\(\{\n    POST: operation\("player\.business\.production\.run", "sensitive"\),\n  \}\),\n''',
        '''  businessProduction: byMethod({
    POST: operation("player.business.production.run", "sensitive"),
  }),
  businessManufacturingJobs: byMethod({
    GET: operation("player.business.manufacturing.jobs.read", "read"),
  }),
  businessManufacturingStart: byMethod({
    POST: operation("player.business.manufacturing.jobs.start", "sensitive"),
  }),
  businessManufacturingCancel: byMethod({
    POST: operation("player.business.manufacturing.jobs.cancel", "sensitive"),
  }),
''',
    )


def align_classroom_dispatch() -> None:
    sub_once(
        "backend/supabase/functions/classroom-api/index.ts",
        r'''(?m)^    const endpointKey =\n      playerBusinessBankingRoute\.kind === "businessRead" &&\n        playerBusinessBankingRoute\.resource === "workforceCandidates"\n        \? "businessWorkforce"\n        : \(\{\n''',
        '''    const endpointKey =
      playerBusinessBankingRoute.kind === "businessRead" &&
        playerBusinessBankingRoute.resource === "workforceCandidates"
        ? "businessWorkforce"
        : playerBusinessBankingRoute.kind === "businessManufacturingCollection"
        ? request.method === "GET"
          ? "businessManufacturingJobs"
          : "businessManufacturingStart"
        : playerBusinessBankingRoute.kind === "businessManufacturingCancel"
        ? "businessManufacturingCancel"
        : ({
''',
    )


def align_player_surface_contract() -> None:
    path = Path("player-terminal/tests/business-banking-surface.mjs")
    text = path.read_text(encoding="utf-8")
    replacements = [
        (
            'const productKey = `bpr_${"b".repeat(32)}`;\n',
            'const productKey = `bpr_${"b".repeat(32)}`;\nconst manufacturingJobKey = `mfg_${"7".repeat(32)}`;\n',
        ),
        (
            '    inventory: [{ itemKey: "machine-steel-billet", kind: "input", quantity: 10, unitCost: 2 }],\n    workforceUtilization: {\n',
            '''    inventory: [{ itemKey: "machine-steel-billet", kind: "input", quantity: 10, unitCost: 2 }],
    manufacturingJobs: [{
      jobKey: manufacturingJobKey,
      businessKey,
      productKey,
      productName: "Utility Module",
      status: "in_progress",
      resourceState: "reserved",
      priority: "standard",
      quantity: 10,
      completedOutputQuantity: 0,
      queuedAt: "2026-08-23T00:00:00.000Z",
      startedAt: "2026-08-23T00:01:00.000Z",
      completesAt: "2026-08-23T00:11:00.000Z",
      completedAt: null,
      cancelledAt: null,
      failedAt: null,
      failureCode: null,
      canCancel: true,
    }],
    workforceUtilization: {
''',
        ),
        ('  "businessProduction",\n', '  "businessManufacturingStart",\n'),
    ]
    for old, new in replacements:
        if text.count(old) != 1:
            raise SystemExit(f"Business surface expected exactly one match: {old!r}")
        text = text.replace(old, new, 1)

    marker = '}\nassert.match(markup, /data-endpoint="businessCandidateHire"/);\n'
    addition = '''}
assert.match(markup, /data-endpoint="businessManufacturingCancel"/);
assert.match(markup, new RegExp(`data-business-manufacturing-job="${manufacturingJobKey}"`));
assert.ok(
  WRITE_INVALIDATIONS.businessManufacturingCancel?.includes("business"),
  "missing businessManufacturingCancel Business invalidation",
);
assert.doesNotMatch(markup, /data-endpoint="businessProduction"/);
assert.equal(
  PLAYER_ENDPOINTS.businessManufacturingStart.path,
  "/businesses/:businessId/manufacturing/jobs",
);
assert.equal(
  PLAYER_ENDPOINTS.businessManufacturingCancel.path,
  "/businesses/:businessId/manufacturing/jobs/:jobId/cancel",
);
assert.match(markup, /data-endpoint="businessCandidateHire"/);
'''
    if text.count(marker) != 1:
        raise SystemExit("Expected one Business surface assertion marker.")
    path.write_text(text.replace(marker, addition, 1), encoding="utf-8")


def align_phase4_recovery_contract() -> None:
    replace_once(
        "scripts/business-phase4c-player-recovery-contract.mjs",
        '  "Recipe labor minutes are enforced server-side",\n',
        '  "The server reserves exact materials, labor, equipment, and completion time",\n',
    )


def align_cross_cutting_authority() -> None:
    path = Path("docs/operations/contracts/player-cross-cutting-verification-authority-v1.json")
    authority = json.loads(path.read_text(encoding="utf-8"))
    authority["allowedPaths"] = sorted(
        set(
            authority["allowedPaths"]
            + [
                "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
                "backend/src/security/playerRateLimitDispatch.ts",
                "backend/supabase/functions/classroom-api/index.ts",
                "player-terminal/tests/business-banking-surface.mjs",
                "scripts/business-phase4c-player-recovery-contract.mjs",
            ]
        )
    )
    path.write_text(json.dumps(authority, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    align_capability_manifest()
    align_rate_limits()
    align_classroom_dispatch()
    align_player_surface_contract()
    align_phase4_recovery_contract()
    align_cross_cutting_authority()


if __name__ == "__main__":
    main()
