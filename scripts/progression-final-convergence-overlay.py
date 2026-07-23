from pathlib import Path

path = Path("scripts/progression-final-convergence.sh")
text = path.read_text()
for patch_path in [
    "backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts",
    "backend/src/security/playerRateLimitDispatch.ts",
    "player-terminal/src/api/payload-normalizer.js",
    "player-terminal/src/api/response-normalizer.js",
    "player-terminal/src/data/empty-read-models.js",
]:
    text = text.replace(f"  {patch_path}\n", "", 1)

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

rate_path = "backend/src/security/playerRateLimitDispatch.ts"
rate_text = load(rate_path)
if 'player.progression.read' not in rate_text:
    rate_anchor = '''  savingsTransfer: byMethod({
    POST: operation("player.banking.savings.transfer", "sensitive"),
  }),
'''
    rate_block = '''  progression: byMethod({
    GET: operation("player.progression.read", "read"),
  }),
  progressionUnlock: byMethod({
    POST: operation("player.progression.skill.unlock", "sensitive"),
  }),
  progressionClaim: byMethod({
    POST: operation("player.progression.reward.claim", "sensitive"),
  }),
'''
    if rate_anchor not in rate_text:
        raise SystemExit("rate-limit insertion anchor missing")
    rate_text = rate_text.replace(rate_anchor, rate_block + rate_anchor, 1)
save(rate_path, rate_text)

payload_path = "player-terminal/src/api/payload-normalizer.js"
payload_text = load(payload_path)
if 'endpointKey === "progressionUnlock"' not in payload_text:
    payload_anchor = '  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalidPayload(endpointKey, "request");\\n'
    payload_block = '''  if (endpointKey === "progressionUnlock" || endpointKey === "progressionClaim") {
    return {};
  }
'''
    if payload_anchor not in payload_text:
        raise SystemExit("payload insertion anchor missing")
    payload_text = payload_text.replace(payload_anchor, payload_anchor + payload_block, 1)
save(payload_path, payload_text)

response_path = "player-terminal/src/api/response-normalizer.js"
response_text = load(response_path)
if 'function unwrap(endpointKey, raw)' not in response_text:
    response_text = response_text.replace('function unwrap(raw) {', 'function unwrap(endpointKey, raw) {', 1)
    unwrap_anchor = '  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;\\n'
    unwrap_block = '''  if (
    endpointKey === "progression" &&
    raw.progression &&
    typeof raw.progression === "object" &&
    !Array.isArray(raw.progression)
  ) return raw.progression;
'''
    if unwrap_anchor not in response_text:
        raise SystemExit("response unwrap anchor missing")
    response_text = response_text.replace(unwrap_anchor, unwrap_anchor + unwrap_block, 1)
    response_text = response_text.replace(
        'sanitizeValue(unwrap(raw), context.config || {})',
        'sanitizeValue(unwrap(endpointKey, raw), context.config || {})',
        1,
    )
if 'value.currentLevelXp = 0;' not in response_text:
    defaults_anchor = '  return value;\\n}\\n\\nfunction validateWorldRuntime'
    defaults_block = '''  if (
    endpointKey === "progression" &&
    !Number.isSafeInteger(value.currentLevelXp) &&
    Number.isSafeInteger(value.xp) && value.xp >= 0
  ) {
    value.currentLevelXp = 0;
  }
  return value;
}

function validateWorldRuntime'''
    if defaults_anchor not in response_text:
        raise SystemExit("response defaults anchor missing")
    response_text = response_text.replace(defaults_anchor, defaults_block, 1)
if 'value.skillPoints > 200' not in response_text:
    validation_anchor = '  if (endpointKey === "notificationsPage") {\\n'
    validation_block = '''  if (endpointKey === "progression") {
    if (
      !Number.isSafeInteger(value.level) || value.level < 1 || value.level > 20 ||
      !Number.isSafeInteger(value.xp) || value.xp < 0 ||
      !Number.isSafeInteger(value.currentLevelXp) || value.currentLevelXp < 0 ||
      value.currentLevelXp > value.xp ||
      !Number.isSafeInteger(value.nextLevelXp) || value.nextLevelXp < value.xp ||
      !Number.isSafeInteger(value.skillPoints) || value.skillPoints < 0 || value.skillPoints > 200 ||
      typeof value.playerName !== "string" ||
      typeof value.title !== "string" ||
      typeof value.summary !== "string"
    ) {
      throw invalidResponse(endpointKey, context.requestId, context.path);
    }
  }
'''
    if validation_anchor not in response_text:
        raise SystemExit("response validation anchor missing")
    response_text = response_text.replace(validation_anchor, validation_block + validation_anchor, 1)
save(response_path, response_text)

empty_path = "player-terminal/src/data/empty-read-models.js"
empty_text = load(empty_path)
old_empty = '''    progression: {
      playerName: "",
      title: "",
      level: 0,
      xp: 0,
      nextLevelXp: 1,
      reputation: 0,
      skillPoints: 0,
      summary: [],
'''
new_empty = '''    progression: {
      playerName: "",
      title: "New Arrival",
      level: 1,
      xp: 0,
      currentLevelXp: 0,
      nextLevelXp: 100,
      skillPoints: 0,
      summary: "Building a balanced economic path.",
      reputation: [],
'''
if old_empty in empty_text:
    empty_text = empty_text.replace(old_empty, new_empty, 1)
elif 'currentLevelXp: 0' not in empty_text:
    raise SystemExit("empty Progression model anchor missing")
save(empty_path, empty_text)

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
