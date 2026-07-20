#!/usr/bin/env python3
from pathlib import Path

path = Path("scripts/admin-v606-full-drift-audit.mjs")
source = path.read_text(encoding="utf-8")
old = '''const expectedScripts = [
  "./auth-session-manager.js", "./session-gate.js", "./admin-auth.js",
  "./dist/admin-overview-terminal.js", "./asset-wiring.js", "./classroom-write-fallback.js",
  "./create-action-adapter.js", "./player-access-code-bridge.js", "./modal-accessibility.js",
  "./player-create-lifecycle.js", "./player-drawer-wiring.js", "./player-identity-wiring.js",
  "./player-create-ux.js", "./game-code-wiring.js", "./admin-stabilization.js",
  "./interaction-quality.js", "./data-state-contracts.js", "./interaction-quality-control-reset.js",
  "./dist/admin-overview-boot.js", "./shape-accurate-skeletons.js",
];
assert(JSON.stringify(scriptSources) === JSON.stringify(expectedScripts), `Admin script order drifted: ${JSON.stringify(scriptSources)}.`);
assert(!/<style(?:\\s|>)/i.test(html), "Admin entrypoint contains an inline style block.");
'''
new = '''const expectedScripts = [
  "../runtime-config.env.js", "../frontend/src/core/runtime-config.js",
  "./auth-session-manager.js", "./session-gate.js", "./admin-auth.js",
  "./dist/admin-overview-terminal.js", "./asset-wiring.js", "./classroom-write-fallback.js",
  "./create-action-adapter.js", "./player-access-code-bridge.js", "./modal-accessibility.js",
  "./player-create-lifecycle.js", "./player-drawer-wiring.js", "./player-identity-wiring.js",
  "./player-create-ux.js", "./game-code-wiring.js", "./admin-stabilization.js",
  "./interaction-quality.js", "./data-state-contracts.js", "./interaction-quality-control-reset.js",
  "./dist/admin-overview-boot.js", "./shape-accurate-skeletons.js",
];
assert(JSON.stringify(scriptSources) === JSON.stringify(expectedScripts), `Admin script order drifted: ${JSON.stringify(scriptSources)}.`);
assert(html.includes('meta name="econovaria-admin-api-base" content=""'), "Admin API metadata is not reserved for validated runtime configuration.");
assert(!/<style(?:\\s|>)/i.test(html), "Admin entrypoint contains an inline style block.");
'''
if old not in source:
    if new in source:
        raise SystemExit(0)
    raise RuntimeError("admin-v606 expected script block not found")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
