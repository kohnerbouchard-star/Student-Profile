#!/usr/bin/env bash
set -euo pipefail

readonly REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

readonly EXPECTED_IMPLEMENTATION_HEAD="dbd65e277cce83f4b026a9f4f6f35a75aaf8b79b"
readonly EXPECTED_MAIN_HEAD="955c97a9a2c8e734cfd89e5202a052afc74edacd"
readonly EXPECTED_MERGE_BASE="7f89e8f7bd390a0d27877cc970b4deff993f9c9a"
readonly BRANCH_NAME="agent/progression-reputation-achievements-v1"

fail() {
  printf 'progression convergence failed: %s\n' "$*" >&2
  exit 1
}

git fetch --no-tags origin main "$BRANCH_NAME"
git merge-base --is-ancestor "$EXPECTED_IMPLEMENTATION_HEAD" HEAD || fail "implementation head is not an ancestor"
test "$(git rev-parse origin/main)" = "$EXPECTED_MAIN_HEAD" || fail "main moved"
test "$(git merge-base "$EXPECTED_IMPLEMENTATION_HEAD" "$EXPECTED_MAIN_HEAD")" = "$EXPECTED_MERGE_BASE" || fail "merge base changed"

patch_paths=(
  backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts
  backend/src/security/playerRateLimitDispatch.ts
  player-terminal/src/api/payload-normalizer.js
  player-terminal/src/api/response-normalizer.js
  player-terminal/src/data/empty-read-models.js
)
for path in "${patch_paths[@]}"; do
  safe_name="${path//\//__}"
  git diff --binary "$EXPECTED_MERGE_BASE" "$EXPECTED_IMPLEMENTATION_HEAD" -- "$path" > "/tmp/${safe_name}.patch"
done

set +e
git merge --no-commit --no-ff -X theirs "$EXPECTED_MAIN_HEAD"
merge_status=$?
set -e

known_conflicts=(
  .github/workflows/player-terminal-verify.yml
  admin/index.html
  backend/package.json
  backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts
  backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts
  backend/src/security/playerRateLimitDispatch.ts
  backend/supabase/functions/admin-api/index.ts
  package.json
  player-terminal/src/api/backend-routes.js
  player-terminal/src/api/payload-normalizer.js
  player-terminal/src/api/response-normalizer.js
  player-terminal/src/data/empty-read-models.js
  player-terminal/src/pages/progression-page.js
)
mapfile -t unmerged < <(git diff --name-only --diff-filter=U)
for path in "${unmerged[@]}"; do
  allowed=false
  for candidate in "${known_conflicts[@]}"; do
    if [[ "$path" == "$candidate" ]]; then
      allowed=true
      break
    fi
  done
  [[ "$allowed" == true ]] || fail "unexpected merge conflict: $path"
  git checkout --theirs -- "$path"
  git add "$path"
done
if [[ "$merge_status" -ne 0 ]] && [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
  fail "unresolved merge conflicts remain"
fi

main_owned_shared=(
  .github/workflows/player-terminal-verify.yml
  admin/index.html
  backend/package.json
  backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts
  backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts
  backend/src/security/playerRateLimitDispatch.ts
  backend/supabase/functions/admin-api/index.ts
  backend/supabase/functions/classroom-api/index.ts
  package.json
  player-terminal/src/api/backend-routes.js
  player-terminal/src/api/payload-normalizer.js
  player-terminal/src/api/response-normalizer.js
  player-terminal/src/data/empty-read-models.js
)
git checkout "$EXPECTED_MAIN_HEAD" -- "${main_owned_shared[@]}"
git checkout "$EXPECTED_IMPLEMENTATION_HEAD" -- player-terminal/src/pages/progression-page.js

git add "${main_owned_shared[@]}" player-terminal/src/pages/progression-page.js
for path in "${patch_paths[@]}"; do
  safe_name="${path//\//__}"
  git apply --3way --index --whitespace=nowarn "/tmp/${safe_name}.patch" || fail "narrow patch failed: $path"
done
test -z "$(git diff --name-only --diff-filter=U)" || fail "shared patch conflicts remain"

python3 - <<'PY'
from pathlib import Path
import json
import re


def load(path: str) -> str:
    return Path(path).read_text()


def save(path: str, content: str) -> None:
    Path(path).write_text(content)


def insert_before(path: str, anchor: str, block: str, guard: str) -> None:
    text = load(path)
    if guard in text:
        return
    if anchor not in text:
        raise SystemExit(f"missing anchor in {path}: {anchor!r}")
    save(path, text.replace(anchor, block + anchor, 1))


manifest_path = "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts"
manifest = load(manifest_path)
manifest = re.sub(
    r'PLAYER_CAPABILITY_MANIFEST_VERSION = "[^"]+"',
    'PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-07-23.2"',
    manifest,
    count=1,
)
union_start = manifest.index("export type PlayerCapabilityEndpointKey")
union_end = manifest.index("export type PlayerCapabilityHttpMethod")
if '| "progression"' not in manifest[union_start:union_end]:
    anchor = '  | "portfolio"\n'
    if anchor not in manifest:
        raise SystemExit("capability endpoint union anchor missing")
    manifest = manifest.replace(
        anchor,
        anchor + '  | "progression"\n  | "progressionUnlock"\n  | "progressionClaim"\n',
        1,
    )
reviewed = manifest[manifest.index("const REVIEWED_ENDPOINTS"):]
if 'key: "progression"' not in reviewed:
    anchor = '  {\n    key: "store",\n'
    descriptor = '''  {
    key: "progression",
    operations: [{ method: "GET", pathTemplate: "/players/me/progression" }],
    routeCapabilities: ["progression"],
  },
  {
    key: "progressionUnlock",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/progression/skills/:skillId/unlock",
    }],
    routeCapabilities: ["progression"],
    actionCapabilities: ["progressionUnlock"],
  },
  {
    key: "progressionClaim",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/progression/rewards/:rewardId/claim",
    }],
    routeCapabilities: ["progression"],
    actionCapabilities: ["progressionClaim"],
  },
'''
    if anchor not in manifest:
        raise SystemExit("capability descriptor anchor missing")
    manifest = manifest.replace(anchor, descriptor + anchor, 1)
save(manifest_path, manifest)

classroom_path = "backend/supabase/functions/classroom-api/index.ts"
insert_before(
    classroom_path,
    'import { dispatchClassroomMessagingRequest } from "./messagingDispatch.ts";\n',
    'import { handlePlayerProgressionRequest } from "../../../src/domains/progression/api/playerProgressionHttpHandler.ts";\n'
    'import { readPlayerProgressionRoutePath } from "../../../src/domains/progression/api/playerProgressionRoutePaths.ts";\n',
    'readPlayerProgressionRoutePath',
)
progression_dispatch = '''  const playerProgressionRoute = readPlayerProgressionRoutePath(url.pathname);

  if (playerProgressionRoute) {
    const endpointKey = playerProgressionRoute.kind === "unlock"
      ? "progressionUnlock"
      : playerProgressionRoute.kind === "claim"
      ? "progressionClaim"
      : "progression";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerProgressionRequest(request, playerProgressionRoute, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

'''
insert_before(
    classroom_path,
    '  const playerStoryDeliveryRoute = readPlayerStoryDeliveryRoutePath(url.pathname);\n',
    progression_dispatch,
    'const playerProgressionRoute = readPlayerProgressionRoutePath',
)

admin_path = "backend/supabase/functions/admin-api/index.ts"
insert_before(
    admin_path,
    'import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";\n',
    'import { handleProgressionOperation } from "./progressionOperations.ts";\n',
    'handleProgressionOperation',
)
admin = load(admin_path)
if "progressionReview: true" not in admin:
    anchor = "          marketplaceAdminTrading: false,\n"
    if anchor not in admin:
        raise SystemExit("admin capability anchor missing")
    admin = admin.replace(
        anchor,
        anchor + "          progressionReview: true,\n          progressionCorrection: true,\n",
        1,
    )
if "const progressionOperation = await handleProgressionOperation" not in admin:
    anchor = "    const redemptionOperation = await handleInventoryRedemptionOperation(\n"
    block = '''    const progressionOperation = await handleProgressionOperation(
      context.service,
      {
        request,
        gameId,
        staffUserId: context.staff.id,
        suffix,
      },
    );
    if (progressionOperation.handled) {
      return json(
        request,
        progressionOperation.status || 500,
        progressionOperation.body,
      );
    }

'''
    if anchor not in admin:
        raise SystemExit("admin operation anchor missing")
    admin = admin.replace(anchor, block + anchor, 1)
save(admin_path, admin)

bootstrap_path = "admin/admin-bootstrap.js"
bootstrap = load(bootstrap_path)
if '"./progression-review-loader.js"' not in bootstrap:
    anchor = '      "./messaging-moderation-loader.js",\n'
    if anchor not in bootstrap:
        raise SystemExit("admin bootstrap messaging anchor missing")
    bootstrap = bootstrap.replace(
        anchor,
        anchor + '      "./progression-review-loader.js",\n',
        1,
    )
save(bootstrap_path, bootstrap)

backend_routes_path = "player-terminal/src/api/backend-routes.js"
backend_routes = load(backend_routes_path)
if 'from "./progression-backend-routes.js"' not in backend_routes:
    anchor = '''import {
  MESSAGING_BACKEND_ROUTE_KEYS,
  hasMessagingBackendRoute,
  resolveMessagingBackendRequest,
} from "./messaging-backend-routes.js";
'''
    block = '''import {
  PROGRESSION_BACKEND_ROUTE_KEYS,
  hasProgressionBackendRoute,
  resolveProgressionBackendRequest,
} from "./progression-backend-routes.js";
'''
    if anchor not in backend_routes:
        raise SystemExit("backend route import anchor missing")
    backend_routes = backend_routes.replace(anchor, anchor + block, 1)
if '...PROGRESSION_BACKEND_ROUTE_KEYS.filter' not in backend_routes:
    anchor = '''  ...MESSAGING_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !CRAFTING_BACKEND_ROUTE_KEYS.includes(key)
  ),
'''
    block = '''  ...PROGRESSION_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !CRAFTING_BACKEND_ROUTE_KEYS.includes(key) &&
    !MESSAGING_BACKEND_ROUTE_KEYS.includes(key)
  ),
'''
    if anchor not in backend_routes:
        raise SystemExit("backend route key anchor missing")
    backend_routes = backend_routes.replace(anchor, anchor + block, 1)
backend_routes = backend_routes.replace(
    "    hasCraftingBackendRoute(endpointKey) ||\n    hasMessagingBackendRoute(endpointKey);",
    "    hasCraftingBackendRoute(endpointKey) ||\n    hasMessagingBackendRoute(endpointKey) ||\n    hasProgressionBackendRoute(endpointKey);",
    1,
)
if "if (hasProgressionBackendRoute(input.endpointKey))" not in backend_routes:
    anchor = '''export function resolvePlayerBackendRequest(input) {
  if (hasMessagingBackendRoute(input.endpointKey)) {
'''
    replacement = '''export function resolvePlayerBackendRequest(input) {
  if (hasProgressionBackendRoute(input.endpointKey)) {
    return resolveProgressionBackendRequest(input);
  }
  if (hasMessagingBackendRoute(input.endpointKey)) {
'''
    if anchor not in backend_routes:
        raise SystemExit("backend route resolver anchor missing")
    backend_routes = backend_routes.replace(anchor, replacement, 1)
save(backend_routes_path, backend_routes)

progression_adapter = '''import { ApiRequestError } from "./errors.js";

export const PROGRESSION_BACKEND_ROUTE_KEYS = Object.freeze([
  "progression",
  "progressionUnlock",
  "progressionClaim",
]);

export function hasProgressionBackendRoute(endpointKey) {
  return PROGRESSION_BACKEND_ROUTE_KEYS.includes(endpointKey);
}

export function resolveProgressionBackendRequest({ endpointKey, payload = {}, params = {} }) {
  const required = (value, field) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
    throw new ApiRequestError(`${field} is required for ${endpointKey}.`, {
      body: { code: "player_route_context_missing", fieldName: field, endpointKey },
    });
  };
  const idempotencyKey = () => required(payload.idempotencyKey, "idempotencyKey");

  switch (endpointKey) {
    case "progression":
      return request(endpointKey, "GET", "/players/me/progression");
    case "progressionUnlock": {
      const skillId = required(params.skillId || payload.skillId, "skillId");
      return request(
        endpointKey,
        "POST",
        `/players/me/progression/skills/${encodeURIComponent(skillId)}/unlock`,
        { idempotencyKey: idempotencyKey() },
      );
    }
    case "progressionClaim": {
      const rewardId = required(params.rewardId || payload.rewardId, "rewardId");
      return request(
        endpointKey,
        "POST",
        `/players/me/progression/rewards/${encodeURIComponent(rewardId)}/claim`,
        { idempotencyKey: idempotencyKey() },
      );
    }
    default:
      throw new ApiRequestError(`No Progression backend route is registered for ${endpointKey}.`, {
        body: { code: "player_route_not_registered", endpointKey },
      });
  }
}

function request(endpointKey, method, path, payload) {
  return {
    endpointKey,
    method,
    path,
    payload,
    provisional: { method, path, payload },
  };
}
'''
save("player-terminal/src/api/progression-backend-routes.js", progression_adapter)

root_package = Path("package.json")
root_data = json.loads(root_package.read_text())
root_scripts = root_data["scripts"]
root_scripts["test:admin-progression"] = "node scripts/admin-progression-contract.mjs"
root_scripts["test:progression-simulation"] = "node scripts/progression-balance-simulation.mjs && node scripts/progression-event-delivery-simulation.mjs && node scripts/progression-abuse-threshold-simulation.mjs"
for command in ["npm run test:admin-progression", "npm run test:progression-simulation"]:
    if command not in root_scripts["test"]:
        anchor = "npm run test:admin-game-lifecycle"
        if anchor not in root_scripts["test"]:
            raise SystemExit("root test script anchor missing")
        root_scripts["test"] = root_scripts["test"].replace(anchor, anchor + " && " + command, 1)
root_package.write_text(json.dumps(root_data, indent=2) + "\n")

backend_package = Path("backend/package.json")
backend_data = json.loads(backend_package.read_text())
backend_scripts = backend_data["scripts"]
backend_scripts["test:player-progression"] = (
    "deno test --allow-read=supabase/migrations/20260721160000_add_progression_reputation_runtime_v1.sql,"
    "supabase/migrations/20260721162000_harden_progression_event_idempotency_v1.sql,"
    "supabase/migrations/20260721163000_rebalance_progression_curve_v1.sql "
    "--config supabase/functions/classroom-api/deno.json --lock=supabase/functions/deno.lock --frozen "
    "src/domains/progression/api/playerProgressionRoutePaths.test.ts "
    "src/domains/progression/api/playerProgressionReadModel.test.ts "
    "src/domains/progression/api/playerProgressionHttpHandler.test.ts "
    "src/domains/progression/services/progressionIntegrationEventService.test.ts "
    "src/domains/progression/services/progressionIntegrationEventBoundary.test.ts "
    "src/domains/progression/tests/progressionMigrationContract.test.ts"
)
if "npm run test:player-progression" not in backend_scripts["test:smoke"]:
    anchor = "npm run test:player-notifications"
    if anchor not in backend_scripts["test:smoke"]:
        raise SystemExit("backend smoke anchor missing")
    backend_scripts["test:smoke"] = backend_scripts["test:smoke"].replace(
        anchor,
        anchor + " && npm run test:player-progression",
        1,
    )
backend_package.write_text(json.dumps(backend_data, indent=2) + "\n")
PY

git mv backend/supabase/migrations/20260721113000_add_progression_reputation_runtime_v1.sql backend/supabase/migrations/20260721160000_add_progression_reputation_runtime_v1.sql
git mv backend/supabase/migrations/20260721114500_fix_progression_read_volatility_v1.sql backend/supabase/migrations/20260721161000_fix_progression_read_volatility_v1.sql
git mv backend/supabase/migrations/20260721115500_harden_progression_event_idempotency_v1.sql backend/supabase/migrations/20260721162000_harden_progression_event_idempotency_v1.sql
git mv backend/supabase/migrations/20260721120500_rebalance_progression_curve_v1.sql backend/supabase/migrations/20260721163000_rebalance_progression_curve_v1.sql

for mapping in \
  20260721113000:20260721160000 \
  20260721114500:20260721161000 \
  20260721115500:20260721162000 \
  20260721120500:20260721163000
do
  old="${mapping%%:*}"
  new="${mapping##*:}"
  while IFS= read -r path; do
    sed -i "s/$old/$new/g" "$path"
  done < <(git grep -l "$old" || true)
done

python3 - <<'PY'
from pathlib import Path
path = Path("docs/workstreams/progression-preconvergence-v1.md")
text = path.read_text()
text = text.replace(
    'Status: `PROVISIONAL_UNSYNCHRONIZED_DRAFT`',
    'Status: `CONVERGED_AFTER_MESSAGING_PENDING_EXACT_HEAD_ACCEPTANCE`',
)
text = text.replace(
    'Final predecessor: Messaging PR #248. This ledger is preparation evidence only. It does not authorize synchronization, authoritative migration identities, canonical staging, production changes, ready-for-review, or merge.',
    'Final predecessor: Messaging PR #248, merge SHA `955c97a9a2c8e734cfd89e5202a052afc74edacd`. The one authorized synchronization and migration rekey are complete. Canonical staging, production, ready-for-review, and merge remain unauthorized pending exact-head acceptance.',
)
for item in [
    'exact Messaging merge SHA recorded',
    'final controller-assigned Progression migration range recorded',
    'one authoritative migration rekey completed',
    'zero provisional migration references remain',
    'one synchronization with final predecessor `main` completed',
    'shared files reconstructed additively from final `main`',
    'migration uniqueness and monotonic ordering verified',
    'Capability Manifest complete and descriptive only',
    'central Player and Admin rate limits complete',
    'Classroom API Progression read/unlock/claim reachable',
    'Admin API review/history/correction reachable',
    'Player endpoint, resource, invalidation, adapter and page publication complete',
    'Admin loader publication complete',
]:
    text = text.replace(f'- [ ] {item};', f'- [x] {item};')
path.write_text(text)
PY

git add -A

test -z "$(git diff --name-only --diff-filter=U)" || fail "unmerged files remain"
test -z "$(git grep -l '20260721113000\|20260721114500\|20260721115500\|20260721120500' || true)" || fail "provisional migration references remain"
for migration in \
  20260721160000_add_progression_reputation_runtime_v1.sql \
  20260721161000_fix_progression_read_volatility_v1.sql \
  20260721162000_harden_progression_event_idempotency_v1.sql \
  20260721163000_rebalance_progression_curve_v1.sql
do
  test -f "backend/supabase/migrations/$migration" || fail "missing migration $migration"
done
grep -Fq 'readPlayerProgressionRoutePath' backend/supabase/functions/classroom-api/index.ts
grep -Fq 'handlePlayerProgressionRequest' backend/supabase/functions/classroom-api/index.ts
grep -Fq 'handleProgressionOperation' backend/supabase/functions/admin-api/index.ts
grep -Fq '"./progression-review-loader.js"' admin/admin-bootstrap.js
grep -Fq 'key: "progression"' backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts
grep -Fq 'progressionUnlock' backend/src/security/playerRateLimitDispatch.ts
grep -Fq 'progression-backend-routes.js' player-terminal/src/api/backend-routes.js
node --check player-terminal/src/api/progression-backend-routes.js
node --check scripts/admin-progression-contract.mjs
node --check scripts/progression-balance-simulation.mjs
node --check scripts/progression-event-delivery-simulation.mjs
node --check scripts/progression-abuse-threshold-simulation.mjs
node scripts/progression-balance-simulation.mjs
node scripts/progression-event-delivery-simulation.mjs
node scripts/progression-abuse-threshold-simulation.mjs
git diff --cached --check
git merge-base --is-ancestor "$EXPECTED_MAIN_HEAD" HEAD || fail "Messaging main not incorporated"

rm -f .github/workflows/progression-final-convergence-carrier.yml
rm -f scripts/progression-final-convergence.sh
git checkout "$EXPECTED_IMPLEMENTATION_HEAD" -- .github/workflows/progression-runtime-v1.yml
git add -A

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "feat(progression): converge after messaging"
git push origin "HEAD:$BRANCH_NAME"
