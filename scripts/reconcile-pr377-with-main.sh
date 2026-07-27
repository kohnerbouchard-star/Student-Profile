#!/usr/bin/env bash
set -euo pipefail

exec > >(tee /tmp/pr377-reconcile-script.log) 2>&1

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git fetch origin main

set +e
git merge --no-commit --no-ff origin/main
merge_status=$?
set -e

if [ "$merge_status" -ne 0 ]; then
  printf '%s\n' \
    '.github/workflows/admin-browser-e2e.yml' \
    '.github/workflows/beta-security-contract.yml' \
    'admin/progression-review-client.js' \
    'backend/src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts' \
    'backend/src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts' \
    'backend/src/domains/contracts/api/playerContractRoutePaths.ts' \
    'player-terminal/src/api/player-api.js' \
    'player-terminal/tests/messaging-connected-lifecycle.mjs' \
    'scripts/admin-messaging-moderation-contract.mjs' \
    'scripts/admin-mounted-modal-focus-reconciled-smoke.mjs' \
    'scripts/admin-mounted-operational-modal-focus-smoke.mjs' \
    'scripts/econovaria-local-gateway.py' \
    > /tmp/expected-conflicts.txt
  git diff --name-only --diff-filter=U | sort > /tmp/actual-conflicts.txt
  diff -u /tmp/expected-conflicts.txt /tmp/actual-conflicts.txt
fi

git checkout --theirs -- \
  .github/workflows/beta-security-contract.yml \
  admin/progression-review-client.js \
  backend/src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts \
  backend/src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts \
  player-terminal/tests/messaging-connected-lifecycle.mjs \
  scripts/admin-messaging-moderation-contract.mjs \
  scripts/admin-mounted-modal-focus-reconciled-smoke.mjs \
  scripts/admin-mounted-operational-modal-focus-smoke.mjs \
  scripts/econovaria-local-gateway.py

git checkout --ours -- backend/src/domains/contracts/api/playerContractRoutePaths.ts
git checkout --theirs -- .github/workflows/admin-browser-e2e.yml player-terminal/src/api/player-api.js

python3 - <<'PY'
from pathlib import Path

path = Path('.github/workflows/admin-browser-e2e.yml')
text = path.read_text()

def insert_after(source: str, anchor: str, addition: str) -> str:
    if addition.strip() in source:
        return source
    if anchor not in source:
        raise SystemExit(f'missing Admin workflow anchor: {anchor!r}')
    return source.replace(anchor, anchor + addition, 1)

text = insert_after(text, '      - "admin/**"\n',
    '      - "player-terminal/**"\n'
    '      - "backend/src/security/**"\n'
    '      - "backend/src/domains/attendance/**"\n'
    '      - "backend/src/domains/contracts/**"\n')
text = insert_after(text, '      - "scripts/admin-browser-reconnaissance.mjs"\n',
    '      - "scripts/admin-connected-ledger-mutation-browser-acceptance.mjs"\n'
    '      - "scripts/button-action-coverage-contract.mjs"\n')
text = insert_after(text, '      - "scripts/local-auth-readiness.mjs"\n',
    '      - "scripts/local-staging-gateway.py"\n')
text = insert_after(text, '      - "docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json"\n',
    '      - "docs/operations/contracts/button-action-coverage-v1.json"\n')
text = text.replace('name: Rendered Admin browser journey',
                    'name: Rendered Admin browser and secure mutation journey', 1)
text = insert_after(text, '          node --check scripts/admin-browser-reconnaissance.mjs\n',
    '          node --check scripts/admin-connected-ledger-mutation-browser-acceptance.mjs\n'
    '          node --check scripts/button-action-coverage-contract.mjs\n')
text = text.replace('          python3 -m py_compile scripts/econovaria-local-gateway.py\n',
                    '          python3 -m py_compile scripts/econovaria-local-gateway.py scripts/local-staging-gateway.py\n', 1)

browser_block = (
    "      - name: Execute rendered Create Game and Admin journey\n"
    "        id: browser\n"
    "        continue-on-error: true\n"
    "        run: node scripts/admin-browser-reconnaissance.mjs\n"
)
ledger_block = (
    "\n      - name: Execute secure Admin ledger mutation journey\n"
    "        id: ledger_mutation\n"
    "        if: steps.browser.outcome == 'success'\n"
    "        continue-on-error: true\n"
    "        run: node scripts/admin-connected-ledger-mutation-browser-acceptance.mjs\n"
)
text = insert_after(text, browser_block, ledger_block)
text = text.replace("        if: steps.browser.outcome == 'failure'\n",
                    "        if: steps.browser.outcome == 'failure' || steps.ledger_mutation.outcome == 'failure'\n", 1)

browser_expr = '$' + '{{ steps.browser.outcome }}'
ledger_expr = '$' + '{{ steps.ledger_mutation.outcome }}'
old = (
    '      - name: Enforce rendered browser result\n'
    '        if: always()\n'
    '        shell: bash\n'
    f'        run: test "{browser_expr}" = "success"\n'
)
new = (
    '      - name: Enforce rendered browser results\n'
    '        if: always()\n'
    '        shell: bash\n'
    '        run: |\n'
    f'          test "{browser_expr}" = "success"\n'
    f'          test "{ledger_expr}" = "success"\n'
)
if old not in text:
    raise SystemExit('missing Admin enforcement block')
path.write_text(text.replace(old, new, 1))
PY

python3 - <<'PY'
from pathlib import Path

path = Path('player-terminal/src/api/player-api.js')
text = path.read_text()
helper = (
    'function actionPathParams(endpointKey, payload, params = {}) {\n'
    '  const endpoint = PLAYER_ENDPOINTS[endpointKey];\n'
    '  if (!endpoint || typeof endpoint.path !== "string") return { ...params };\n'
    '  const resolved = { ...params };\n'
    '  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};\n'
    '  for (const match of endpoint.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)) {\n'
    '    const key = match[1];\n'
    '    if (resolved[key] !== undefined && resolved[key] !== null && String(resolved[key]).trim()) continue;\n'
    '    const value = source[key];\n'
    '    if (value === undefined || value === null || !String(value).trim()) continue;\n'
    '    resolved[key] = value;\n'
    '  }\n'
    '  return resolved;\n'
    '}\n\n'
)
anchor = 'function sessionFingerprint(config) {'
if 'function actionPathParams(' not in text:
    if anchor not in text:
        raise SystemExit('missing Player API helper anchor')
    text = text.replace(anchor, helper + anchor, 1)

read_open = '  async request(endpointKey, { params = {}, payload, force = false, signal = null } = {}) {\n'
read_route = '    const { endpoint, path } = resolvedPath(endpointKey, params);\n'
if read_open not in text or read_route not in text:
    raise SystemExit('missing Player API read route lines')
text = text.replace(read_open + read_route,
    read_open +
    '    const resolvedParams = actionPathParams(endpointKey, payload, params);\n' +
    '    const { endpoint, path } = resolvedPath(endpointKey, resolvedParams);\n', 1)

read_context = '    const context = { endpointKey, method: endpoint.method, path, payload, requestId, signal: mergedSignal.signal };\n'
if read_context not in text:
    raise SystemExit('missing Player API read context line')
text = text.replace(read_context,
    '    const context = { endpointKey, method: endpoint.method, path, payload, params: resolvedParams, requestId, signal: mergedSignal.signal };\n', 1)

write_open = '  execute(endpointKey, payload, params = {}, { signal = null } = {}) {\n'
write_route = '    const { endpoint, path } = resolvedPath(endpointKey, params);\n'
if write_open not in text or write_route not in text:
    raise SystemExit('missing Player API write route lines')
text = text.replace(write_open + write_route,
    write_open +
    '    const resolvedParams = actionPathParams(endpointKey, payload, params);\n' +
    '    const { endpoint, path } = resolvedPath(endpointKey, resolvedParams);\n', 1)

write_context = '    const context = { endpointKey, method: endpoint.method, path, payload, requestId, idempotencyKey, signal: mergedSignal.signal };\n'
if write_context not in text:
    raise SystemExit('missing Player API write context line')
text = text.replace(write_context,
    '    const context = { endpointKey, method: endpoint.method, path, payload, params: resolvedParams, requestId, idempotencyKey, signal: mergedSignal.signal };\n', 1)
path.write_text(text)
PY

python3 - <<'PY'
from pathlib import Path

repository = Path('backend/src/domains/marketplace/infrastructure/supabasePlayerMarketplaceRepository.ts')
text = repository.read_text()
projection = 'select("item_key,name,description,category,image_url")'
image_line = '    image: optionalAsset(item?.image_url),\n'
if projection not in text or image_line not in text:
    raise SystemExit('missing Marketplace repository image anchors')
text = text.replace(projection, 'select("item_key,name,description,category")', 1)
text = text.replace(image_line, '    image: null,\n', 1)
repository.write_text(text)

page = Path('player-terminal/src/pages/marketplace-page.js')
text = page.read_text()
import_anchor = 'import { renderEmptyState, renderStatusPill } from "../components/ui.js";\n'
import_line = 'import { resolveStoreItemImage } from "../features/store/store-artwork.js";\n'
if import_line not in text:
    if import_anchor not in text:
        raise SystemExit('missing Marketplace artwork import anchor')
    text = text.replace(import_anchor, import_anchor + import_line, 1)
listing_image = '<span class="player-terminal-marketplace-image"><img src="${escapeHtml(listing.image)}" alt="" /></span>'
detail_image = '<span><img src="${escapeHtml(selected.image)}" alt="" /></span>'
if listing_image not in text or detail_image not in text:
    raise SystemExit('missing Marketplace image render anchors')
text = text.replace(listing_image,
    '<span class="player-terminal-marketplace-image"><img src="${escapeHtml(resolveStoreItemImage({ itemKey: listing.itemId, image: listing.image }))}" alt="" /></span>', 1)
text = text.replace(detail_image,
    '<span><img src="${escapeHtml(resolveStoreItemImage({ itemKey: selected.itemId, image: selected.image }))}" alt="" /></span>', 1)
page.write_text(text)
PY

rm -f player-terminal/src/api/player-api-core.js
rm -f docs/operations/reconciliation/pr377-conflict-inventory.md
rm -f docs/operations/reconciliation/pr377-conflict-hunks.md
rm -f docs/operations/reconciliation/pr377-reconcile-failure.log
rm -f docs/operations/reconciliation/pr377-reconcile-v2-failure.log
rmdir docs/operations/reconciliation 2>/dev/null || true
rm -f .github/workflows/reconcile-pr377-with-main.yml
rm -f .github/workflows/reconcile-pr377-with-main-v2.yml
rm -f scripts/reconcile-pr377-with-main.sh

git add -A
test -z "$(git diff --name-only --diff-filter=U)"
! git grep -nE '^(<<<<<<<|=======|>>>>>>>)'
git diff --check --cached
node --check player-terminal/src/api/player-api.js
node --check player-terminal/src/pages/marketplace-page.js
node --check scripts/admin-connected-ledger-mutation-browser-acceptance.mjs
python3 -m py_compile scripts/econovaria-local-gateway.py scripts/local-staging-gateway.py

git commit -m "Merge main into PR 377 and reconcile runtime contracts"
