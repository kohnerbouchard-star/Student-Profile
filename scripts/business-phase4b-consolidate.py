from __future__ import annotations

from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_all(path: str, old: str, new: str) -> None:
    target = ROOT / path
    if not target.exists():
        return
    text = target.read_text(encoding="utf-8")
    if old in text:
        target.write_text(text.replace(old, new), encoding="utf-8")


subprocess.run(
    [sys.executable, str(ROOT / "scripts/business-phase4b-payload.py")],
    cwd=ROOT,
    check=True,
)

contracts_path = "backend/src/domains/business/contracts/playerBusinessContracts.ts"
contracts = read(contracts_path)
contracts = contracts.replace(
    "  readWorkforceCandidates(input: {\n",
    "  readWorkforceCandidates?(input: {\n",
    1,
)
write(contracts_path, contracts)

workforce_api_path = "backend/src/domains/business/api/playerBusinessWorkforce.ts"
workforce_api = read(workforce_api_path)
if "PlayerBusinessError," not in workforce_api:
    workforce_api = workforce_api.replace(
        '  type PlayerBusinessRepository,\n} from "../contracts/playerBusinessContracts.ts";',
        '  PlayerBusinessError,\n  type PlayerBusinessRepository,\n} from "../contracts/playerBusinessContracts.ts";',
        1,
    )
if "business_workforce_unavailable" not in workforce_api:
    workforce_api = workforce_api.replace(
        "  return repository.readWorkforceCandidates(scope);",
        '''  if (!repository.readWorkforceCandidates) {
    throw new PlayerBusinessError(
      "business_workforce_unavailable",
      "The Business workforce market is not available.",
      503,
      true,
    );
  }
  return repository.readWorkforceCandidates(scope);''',
        1,
    )
write(workforce_api_path, workforce_api)

page_path = "player-terminal/src/pages/business-page.js"
page = read(page_path)
market_path = ROOT / "player-terminal/src/pages/business-workforce-market.js"
if "function workforceMarket(" in page:
    match = re.search(
        r'function workforceMarket\(workforce, business, code\) \{.*?\n\}\n\nfunction statusForm',
        page,
        flags=re.S,
    )
    if not match:
        raise SystemExit("Could not isolate workforce market renderer")
    body = match.group(0).removesuffix("\n\nfunction statusForm")
    body = body.replace(
        "function workforceMarket",
        "export function renderBusinessWorkforceMarket",
        1,
    )
    write(
        "player-terminal/src/pages/business-workforce-market.js",
        'import { escapeHtml, formatCurrency, formatNumber, formatPercent } from "../core/format.js";\n'
        'import { icon } from "../components/icons.js";\n'
        'import { renderEmptyState } from "../components/ui.js";\n\n'
        'function hiddenBusinessKey(business) {\n'
        '  return `<input name="businessKey" type="hidden" value="${escapeHtml(business.company.id)}" />`;\n'
        '}\n\n'
        + body,
    )
    page = page[: match.start()] + "function statusForm" + page[match.end() :]
if market_path.exists():
    import_line = (
        'import { renderBusinessWorkforceMarket } '
        'from "./business-workforce-market.js";\n'
    )
    if import_line not in page:
        first_break = page.find("\n") + 1
        page = page[:first_break] + import_line + page[first_break:]
    page = page.replace(
        "${workforceMarket(data.businessWorkforce, business, code)}",
        "${renderBusinessWorkforceMarket(data.businessWorkforce, business, code)}",
    )
write(page_path, page)

contract_path = "scripts/business-workforce-hiring-contract.mjs"
contract = read(contract_path)
contract = contract.replace(
    'const businessPage = fs.readFileSync(\n  "player-terminal/src/pages/business-page.js",\n  "utf8",\n);',
    '''const businessPage = [
  fs.readFileSync("player-terminal/src/pages/business-page.js", "utf8"),
  fs.readFileSync("player-terminal/src/pages/business-workforce-market.js", "utf8"),
].join("\\n");''',
)
contract = contract.replace(
    "assert.match(routes, /business\\/workforce\\/candidates/u);",
    '''assert.match(
  routes,
  /tail\\[1\\] === "workforce" && tail\\[2\\] === "candidates"/u,
);''',
    1,
)
write(contract_path, contract)

for path in [
    "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
    "player-terminal/src/api/capabilities.js",
    "player-terminal/src/api/endpoints.js",
    "player-terminal/src/api/backend-routes-core.js",
    "player-terminal/src/api/business-banking-backend-routes.js",
    "player-terminal/src/integrations/student-profile-capability-manifest.js",
    "player-terminal/tests/current-capability-manifest.mjs",
    "player-terminal/tests/student-profile-adapter.mjs",
    "player-terminal/tests/business-banking-surface.mjs",
    "docs/operations/contracts/button-action-coverage-v1.json",
]:
    replace_all(path, "businessHire", "businessCandidateHire")
    replace_all(
        path,
        "/players/me/business/employees/hire",
        "/players/me/business/workforce/candidates/:candidateKey/hire",
    )
    replace_all(path, "2026-08-21.2", "2026-08-22.1")

runtime_path = "scripts/business-banking-runtime-contract.mjs"
runtime = read(runtime_path).replace(
    "businessHire",
    "businessCandidateHire",
)
runtime = re.sub(
    r'assert\.(?:match|ok|equal|deepEqual)\([^;]*hire_business_employee_v1[^;]*;\s*',
    "",
    runtime,
    flags=re.S,
)
if "phase4bWorkforceHiringSource" not in runtime:
    runtime = runtime.rstrip() + '''

const phase4bWorkforceHiringSource = await readFile(
  "backend/src/domains/business/api/playerBusinessWorkforce.ts",
  "utf8",
);
assert.match(
  phase4bWorkforceHiringSource,
  /hire_business_workforce_candidate_v2/u,
  "Candidate-only workforce hiring must remain wired to the Phase 4B RPC.",
);
'''
write(runtime_path, runtime)

surface_path = "player-terminal/tests/business-banking-surface.mjs"
surface = read(surface_path)
surface = re.sub(
    r'candidateKey:\s*["\'][^"\']*["\']',
    'candidateKey: "wfc_' + ("d" * 32) + '"',
    surface,
)
write(surface_path, surface)

page = read(page_path)
for prohibited in [
    'name="employeePlayerIdentifier"',
    'name="role"',
    'name="wagePerCycle"',
    'name="productivityIndex"',
]:
    if prohibited in page:
        raise SystemExit(f"Legacy hiring control remains: {prohibited}")

print("Phase 4B source materialized and normalized.")
