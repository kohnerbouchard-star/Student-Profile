# Phase 14D — Business integration with the Financial Market

Roadmap item `BUSINESS-V2-14D`, within `BETA-BUSINESS-V2-001`. Status `IN_PROGRESS`, draft PR #687. Owner `feat/business-financial-market-integration-v2`, from green Phase 14C documentation handoff `1b1af1d492cc0f9dfe55dfa0f6a326106be3f8ea`: 43 workflows, 84 jobs and Vercel passed; four manual/historical skips. Predecessor implementation remains `cf3fabf2444a2c85d71155fccfa1e5b371bc2c37`, draft #686.

The owner authorized implementation and verification through Phase 14D. This work does not authorize Phase 14 merge, deployment, live SQL, scheduler or secret changes. `BETA-LIVE-MIGRATION-PARITY-001` remains a separate runtime/release blocker.

## Authority and behavior

Business remains the sole common-share quantity authority. Player shares plus finite Market custody equal outstanding shares; immutable transfer receipts reconcile both. Secondary trades do not issue shares or change issuer cash. Custody cannot cast votes. A manager can sell the last share while retaining an explicit operating mandate.

Business publishes versioned completed-IPO, financial-close and status events. A Market-owned consumer uses Business public ports and its own immutable consumption receipts. A bounded anti-join preserves late-committing observations without timestamp-watermark loss. The existing Market runner consumes before loading/ticking; no new scheduler or secret. Business never writes Stock internals.

Only fully allocated paid IPOs list. Approved IPO price seeds the initial listing; subsequent price belongs to the existing Market engine. Latest complete financial evidence is public-key-only, with exact decimal text and period/source provenance. Positive book equity per outstanding share is a named Market anchor policy. Beta, liquidity and volatility defaults are simulation policy, not fabricated Business observations; missing fundamental inputs are omitted. Inactive issuers or unreconciled latest statements halt trading. Order-time checks protect against consumer lag.

The existing quote/buy/sell commands retain canonical Banking funding, prices, ticks, immutable evidence and replay. A narrow Business port transfers whole shares between players and finite Market custody. Linked Stock holdings retain cost/PnL metadata with zero stored quantity, guarded against a second quantity authority or raw service mutation. Market cash starts under the existing zero-balance policy and is funded through real retained purchases; no invented seed liquidity or redirected IPO proceeds.

Market, Portfolio and Dashboard reads derive IPO and secondary quantities from Business. Dashboard valuation and currency-scoped leaderboards include only matching currency amounts, with explicit unconverted position evidence. Portfolio shows listing-currency values separately; its ECO summary excludes unconverted national currency positions and states that limitation. Accepted Player visual components, authenticated scope, UUID privacy and review/recovery remain intact.

## Required proof and rollout

Two fresh zero-to-head migration replays and advisors; real formation → Store sale → reconciled close → approved/full IPO → versioned consumer → listing → Portfolio → secondary trades; no liquidity/custody, whole-share, role/game/player and raw-write denials; concurrent custody race; five settlement failure stages; replay; money/share conservation; zero-share manager and reentry; exact financial provenance/status; populated canonical purge and other-game isolation. Browser checks cover desktop/mobile, keyboard review, holdings/currency rendering, uncertain retry, committed-success refresh failure and unavailable states. Retain all A/B/C economic, connected, load, security, repository and application gates on the exact source.

Forward migrations add Business ports, Market linkage/consumption and bounded settlement adapters, then deterministic purge registration and observed fingerprint convergence. Applied migrations are not rewritten. Frozen purge writer bodies must remain identical except reviewed hashes/counts/cursors. Rollout requires ordered A → B → C → D, clean replay, parity and exact artifacts under separate release approval. Corrections remain forward-only. A draft implementation and fixture browser data are not live certification.
