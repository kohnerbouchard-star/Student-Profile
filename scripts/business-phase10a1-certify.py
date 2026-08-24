from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

SOURCE = "1abc8b878df5b08716107adb467bd013e85b6df4"
DEDICATED = "32753253910"
WITHDRAWAL = "32753253771"
QUALITY = "32753253904"
SUPPLY = "32753253694"


def verify_evidence() -> None:
    repository = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GH_TOKEN"]
    expected = {
        "Business Store Purchase Settlement Foundation V2": int(DEDICATED),
        "Business Store Withdrawal Safety V2": int(WITHDRAWAL),
        "Repository Quality": int(QUALITY),
        "Supply Chain Security": int(SUPPLY),
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "econovaria-phase10a1-certifier",
    }
    for name, run_id in expected.items():
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repository}/actions/runs/{run_id}",
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            run = json.load(response)
        if run.get("name") != name:
            raise SystemExit(f"Unexpected workflow name for {run_id}: {run.get('name')}")
        if run.get("head_sha") != SOURCE:
            raise SystemExit(f"Workflow {name} was not run on {SOURCE}")
        if run.get("status") != "completed" or run.get("conclusion") != "success":
            raise SystemExit(
                f"Workflow {name} is not green: {run.get('status')}/{run.get('conclusion')}"
            )
    print(json.dumps({"certifiedSource": SOURCE, "runs": expected}, indent=2))


def update_scope() -> None:
    path = Path("docs/roadmaps/business-phase10-store-purchase-settlement-scope-v1.md")
    text = path.read_text()
    old_status = (
        "**Status:** IN PROGRESS — checkpoint 10A.1 authority foundation locked; "
        "runtime settlement is not implemented or certified"
    )
    new_status = (
        "**Status:** COMPLETE — checkpoint 10A.1 authority foundation certified; "
        "checkpoint 10A.2 offer-aware quote authority is open"
    )
    if old_status not in text and new_status not in text:
        raise SystemExit("Phase 10 scope status anchor is missing")
    text = text.replace(old_status, new_status, 1)

    anchor = (
        "**Current clean Phase 9A branch head:** "
        "`8183702d64ff72988cff2ba992a85b1cf85d82dd`\n"
    )
    if "**Certified checkpoint 10A.1 exact-head source:**" not in text:
        if anchor not in text:
            raise SystemExit("Phase 10 scope metadata anchor is missing")
        text = text.replace(
            anchor,
            anchor
            + f"**Certified checkpoint 10A.1 exact-head source:** `{SOURCE}`\n"
            + f"**Dedicated certification workflow:** `{DEDICATED}`\n"
            + "**Certification date:** 2026-08-25\n",
            1,
        )

    if "## Certification evidence\n" not in text:
        next_heading = "## Next implementation sequence\n"
        if next_heading not in text:
            raise SystemExit("Phase 10 next-sequence heading is missing")
        certification = f"""## Certification evidence

**Exact certified implementation and verification source:** `{SOURCE}`  
**Dedicated workflow:** Business Store Purchase Settlement Foundation V2 `{DEDICATED}`

- Phase 10A.1 structural, typed command/receipt, offer-first lock-order, purchase-first, withdrawal-first, replay, conflict, rollback, and two-game simulations: **PASS**.
- Complete database replay from zero twice and rebuilt-database lint: **PASS** in `{DEDICATED}`.
- Retained Business Economy, Banking, workforce/payroll, equipment, timed manufacturing, Store, Inventory, all Backend/Edge TypeScript, Player Edge bundleability, Admin API, required game timezone, exchange calendar, Player Terminal, and Chromium: **PASS** in `{DEDICATED}`.
- Retained Phase 9A withdrawal authority: **PASS** (`{WITHDRAWAL}`).
- Repository Quality and deterministic architecture inventory: **PASS** (`{QUALITY}`).
- Supply Chain Security: **PASS** (`{SUPPLY}`).
- PR #665 remained open, draft, mergeable, unmerged, and undeployed. No database migration, runtime persistence, settlement RPC, money movement, Inventory movement, Player route/UI, secret mutation, or live database mutation was introduced by checkpoint 10A.1.
- The exact certified source remains `{SOURCE}`. Later certification-only documentation commits do not replace that tested implementation source.

Checkpoint 10A.1 is complete. Runtime Store purchase settlement is not complete. The next authorized checkpoint is 10A.2, limited to immutable offer-aware quote authority.

"""
        text = text.replace(next_heading, certification + next_heading, 1)
    path.write_text(text)


def update_plan() -> None:
    path = Path("docs/roadmaps/business-v2-development-execution-plan-v1.md")
    text = path.read_text()
    old = """## Phase 10 — Atomic Store purchase settlement

**Status:** OPEN — bounded checkpoint 10A authorized

- [ ] Lock offer and validate purchasable state.
- [ ] Lock/check buyer balance and listing inventory.
- [ ] Atomically debit Buyer Checking, credit Business cash, transfer inventory, and update offer quantity.
- [ ] Enforce idempotency and exact-once revenue/inventory settlement.
- [ ] Add both lock-order race tests: purchase-first and withdrawal-first.

Exit: no paid-without-item or item-without-payment state is possible.
"""
    new = f"""## Phase 10 — Atomic Store purchase settlement

**Status:** FOUNDATION COMPLETE — checkpoint 10A.1 certified exact-head source `{SOURCE}`; checkpoint 10A.2 offer-aware quote authority is OPEN

- [x] Freeze the immutable public purchase-receipt contract and trusted/browser command boundary.
- [x] Freeze one seller-offer-first economic row-lock order.
- [x] Prove purchase-first and withdrawal-first ordering plus replay, conflict, rollback, and two-game isolation in deterministic simulations.
- [ ] Add immutable offer-aware quote authority bound to exact offer, version, seller, custody, quantity, price, currency, and expiry.
- [ ] Lock offer and validate purchasable state in the runtime settlement command.
- [ ] Lock/check buyer balance and listing inventory.
- [ ] Atomically debit Buyer Checking, credit Business cash, transfer inventory, and update offer quantity.
- [ ] Enforce idempotency and exact-once revenue/inventory settlement.

Certified checkpoint:

- **10A.1:** non-mutating Store settlement authority foundation; immutable public `spr_...` receipt contract; trusted command boundary; fixed offer-first lock order; deterministic purchase/withdrawal ordering, replay, conflict, rollback, and two-game simulations; complete retained database, Business, Store, Inventory, backend/Edge, repository, security, Player, and Chromium matrix. **Certified implementation and exact-head verification source:** `{SOURCE}`. Dedicated workflow: `{DEDICATED}`.

Exit: no paid-without-item or item-without-payment state is possible. **Not yet met; quote and settlement runtime remain open.**
"""
    if old not in text and new not in text:
        raise SystemExit("Phase 10 execution-plan anchor is missing")
    path.write_text(text.replace(old, new, 1))


def update_log() -> None:
    path = Path("docs/roadmaps/business-v2-development-execution-log-v1.md")
    text = path.read_text()
    marker = "## 2026-08-25 — Phase 10A.1 COMPLETE: Store settlement authority foundation"
    if marker in text:
        return
    text += f"""

---

{marker}

### Certified source and repository state

- **Exact certified implementation and verification source:** `{SOURCE}`.
- Feature branch: `feat/business-store-purchase-settlement-v2`.
- Stacked draft PR: #665, based on `feat/business-store-withdrawal-safety-v2` / PR #664.
- Certified Phase 9A implementation source: `bf17e2493654620229d1acdeaae0fbaba21caf63`.
- PR #665 remained open, draft, mergeable, unmerged, and undeployed at certification.
- Integration PR #648 remained open, draft, mergeable, and unmerged.
- The exact implementation delta contains the permanent Phase 10A.1 workflow, authority audit, scope, typed contracts, structural verification, and deterministic lock/replay/rollback/two-game simulations. No temporary writer/controller workflow remains after this certification commit.
- No migration, runtime persistence, API route, Player control, deployment, secret mutation, or live database mutation occurred.

### What is now authoritative

- A future Business seller-offer purchase is defined as one indivisible economic transaction binding one exact offer, quote, Buyer Checking debit, Business cash credit, Store Listing-to-Buyer Inventory transfer, revenue/COGS result, offer-version transition, and immutable public receipt.
- Browser input expresses only offer/quote/quantity/version/idempotency intent. Game, Buyer, seller, Business, custody, money, and Inventory scope are trusted server authority.
- The public receipt identity is `spr_[0-9a-f]{{32}}`; internal ledger and table UUIDs remain private.
- All economic row locking begins with the seller offer. Buyer money or Inventory may never be locked before the offer.
- Purchase-first may complete atomically and advance the offer once; withdrawal-first changes the offer to `withdrawal_pending` and forces purchase rejection before any economic mutation.
- Matching replay returns immutable recorded receipt evidence. Conflicting idempotency reuse fails closed. Any posting failure rolls the full conceptual transaction back.
- The retained seeded Store purchase channel remains unchanged and is not silently repurposed for Business seller offers.

### Exact-head verification on `{SOURCE}`

- **Business Store Purchase Settlement Foundation V2 — PASS** (`{DEDICATED}`): Phase 10A.1 structural/type/race/replay/conflict/rollback/two-game contracts; Database Replay twice and lint; retained Store/Inventory/Business Economy/Banking/workforce/payroll/equipment/manufacturing; all Backend/Edge TypeScript; Player Edge bundleability; Admin API; required game timezone; exchange calendar; Player Terminal; Chromium.
- **Business Store Withdrawal Safety V2 — PASS** (`{WITHDRAWAL}`).
- **Repository Quality — PASS** (`{QUALITY}`).
- **Supply Chain Security — PASS** (`{SUPPLY}`).

### Phase 10A.1 exit result

- Immutable public receipt and trusted command boundary: **met**.
- Fixed seller-offer-first economic lock order: **met**.
- Purchase-first and withdrawal-first ordering model: **met**.
- Replay, conflicting reuse, rollback, and two-game deterministic coverage: **met**.
- Complete retained exact-head matrix: **met**.
- Temporary machinery zero net; PR draft/unmerged; no deployment/live mutation: **met**.
- Runtime quote, settlement, money movement, Inventory movement, revenue/COGS posting, and Player cutover: **not implemented and not claimed**.

### Decisions and unresolved boundaries

- Checkpoint 10A.2 must introduce a durable offer-aware quote rather than widening the retained seeded compatibility quote.
- The quote must bind exact offer/version/seller/Business/custody/item/quantity/price/currency/expiry and immutable request hash.
- Checkpoint 10A.3 remains the first authority allowed to debit Buyer Checking, credit Business cash, transfer Inventory, or recognize seller revenue/COGS.
- Player Store read/UI cutover, automatic consumer sales, equity/IPO, merge, staging, and production remain unauthorized.

### Next authorized step

**Phase 10 checkpoint 10A.2 — immutable offer-aware quote authority is OPEN.** Add only the durable quote schema, service-only quote command/repository, exact replay and conflict behavior, expiry/version/custody validation, typed public contract, deterministic tests, and exact-head certification. Do not add Buyer debit, seller credit, Inventory transfer, revenue/COGS, Player route/UI, automatic sales, equity/IPO, merge, deployment, secrets, or live database mutation.
"""
    path.write_text(text)


def main() -> None:
    verify_evidence()
    update_scope()
    update_plan()
    update_log()


if __name__ == "__main__":
    main()
