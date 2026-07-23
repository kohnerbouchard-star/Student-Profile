from pathlib import Path

path = Path("scripts/progression-final-convergence.sh")
text = path.read_text()
text = text.replace(
    "  backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts\n",
    "",
    1,
)

anchor = "save(manifest_path, manifest)\n\nclassroom_path ="
block = '''save(manifest_path, manifest)

manifest_test_path = "backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts"
manifest_test = load(manifest_test_path)
if 'readPlayerProgressionRoutePath' not in manifest_test:
    import_anchor = 'import { readPlayerBusinessBankingRoutePath } from "../../business-banking/api/playerBusinessBankingRoutePaths.ts";\\n'
    if import_anchor not in manifest_test:
        raise SystemExit("manifest test import anchor missing")
    manifest_test = manifest_test.replace(
        import_anchor,
        import_anchor + 'import { readPlayerProgressionRoutePath } from "../../progression/api/playerProgressionRoutePaths.ts";\\n',
        1,
    )
route_anchor = '    "inventory", "store", "banking", "business", "loans", "world", "marketplace", "messages",\\n'
route_section = manifest_test[manifest_test.index('for (const key of ['):manifest_test.index('] as const) assertEquals(manifest.capabilities.routes')]
if '"progression",' not in route_section:
    if route_anchor not in manifest_test:
        raise SystemExit("manifest test route anchor missing")
    manifest_test = manifest_test.replace(
        route_anchor,
        '    "inventory", "store", "banking", "business", "loans", "world", "marketplace", "messages", "progression",\\n',
        1,
    )
action_anchor = '    "messageSearch", "messageSend",\\n'
if '"progressionUnlock"' not in manifest_test:
    if action_anchor not in manifest_test:
        raise SystemExit("manifest test action anchor missing")
    manifest_test = manifest_test.replace(
        action_anchor,
        '    "messageSearch", "messageSend", "progressionUnlock", "progressionClaim",\\n',
        1,
    )
endpoint_anchor = '    "messageRead", ...BUSINESS_BANKING_ENDPOINTS,\\n'
if '"progressionClaim", ...BUSINESS_BANKING_ENDPOINTS' not in manifest_test:
    if endpoint_anchor not in manifest_test:
        raise SystemExit("manifest test endpoint anchor missing")
    manifest_test = manifest_test.replace(
        endpoint_anchor,
        '    "messageRead", "progression", "progressionUnlock", "progressionClaim", ...BUSINESS_BANKING_ENDPOINTS,\\n',
        1,
    )
parameter_anchor = '        .replace(":loanKey", `lon_${"a".repeat(32)}`),\\n'
if '.replace(":skillId"' not in manifest_test:
    if parameter_anchor not in manifest_test:
        raise SystemExit("manifest test parameter anchor missing")
    manifest_test = manifest_test.replace(
        parameter_anchor,
        '        .replace(":loanKey", `lon_${"a".repeat(32)}`)\\n'
        '        .replace(":skillId", "skl_market_literacy_v1")\\n'
        '        .replace(":rewardId", `rwd_${"b".repeat(32)}`),\\n',
        1,
    )
dispatch_anchor = '      : operation.key === "notifications" || operation.key === "notificationsRead"\\n'
if 'operation.key === "progression" ||' not in manifest_test:
    if dispatch_anchor not in manifest_test:
        raise SystemExit("manifest test dispatch anchor missing")
    manifest_test = manifest_test.replace(
        dispatch_anchor,
        '      : operation.key === "progression" ||\\n'
        '          operation.key === "progressionUnlock" ||\\n'
        '          operation.key === "progressionClaim"\\n'
        '      ? readPlayerProgressionRoutePath(operation.path)\\n'
        + dispatch_anchor,
        1,
    )
save(manifest_test_path, manifest_test)

classroom_path ='''
if anchor not in text:
    raise SystemExit("convergence script manifest anchor missing")
text = text.replace(anchor, block, 1)
text = text.replace(
    "rm -f scripts/progression-final-convergence.sh\n",
    "rm -f scripts/progression-final-convergence-overlay.py\nrm -f scripts/progression-final-convergence.sh\n",
    1,
)
path.write_text(text)
