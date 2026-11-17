# Player Crafting per-output disclosure

Roadmap item `PLAYER-CRAFTING-OUTPUT-DISCLOSURE-001`. Base main `956ad02db949ae9c4cff7d709a18ec28d20c0788`.

The existing read contract exposes every recipe output with itemKey/name, quantity and outputKind. The old page rendered the aggregate `outputQuantity` multiplied by the recipe name, which is misleading for recipes producing multiple distinct items. Render each output separately and explain its destination after claiming: equipment in Workshop, stackable items in Inventory. Missing, malformed or unknown data is explicitly unavailable instead of inferred. Preserve input, submit, job claim, cancellation, quantity, ownership and permission semantics.

No API, RPC, query, migration, economic mutation, CSS, dependency or deployment change. Existing unlocked/ingredient checks and server authority remain unchanged. Legacy preview records without outputs now state that output details are unavailable; no fabricated breakdown is shown.

## Qualification

Focused Crafting mutation controls, existing shortage/empty-recipe cases and new multiple-output/malformed-data tests pass. New browser cases cover desktop/mobile, per-output names/quantities/destinations and zero writes while viewing. Full Player verify and root aggregate passed on pinned Node22.23.1/npm10.9.8. Core backend TypeScript passed; all-Edge check blocked at frozen SDK retrieval (earlier missing-Deno run is retained as historical). Browser cases were attempted but could not launch because pinned Chromium is missing. Independent review caught the required icon grid column; the original two-cell structure was restored and a regression added. Final-tree root and Player aggregate reruns passed after the correction. Independent final re-review and exact-head hosted qualification remain pending; not merge-ready or live-qualified.

Existing open owner audit found no Crafting feature PR. Classroom #933/#938, Business #994, teacher policy #995, Loans #996 and Market #997 remain independent. Next: qualify this draft and then separately audit remaining Crafting/Inventory lifecycle gaps.

## Publication and actual-number qualification

Draft PR #998 published source `fad2ecca27d03ce48c4a3c89d0b00e40771fe8b7`, verified by fetch and ls-remote, tree `0ab5a89f8bb80cc98ab59e9a61808bc50762177f` equal to tested local source. After explicit owner public-upload approval, publication succeeded. Actual-number authority locks eight changed paths plus two unchanged read-only verifier files; 23 current workflow families, 45 active tuples and three manual-only guarded skips. 72 required identities / 45 critical job names include dynamic CodeQL. No workflow or verifier edits. Authority verifier and all 16 regression cases pass. Fresh published-head hosted checks remain required; no merge/deployment.
