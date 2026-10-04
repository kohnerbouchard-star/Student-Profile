# Market receipt lifecycle blocker

Parent-authorized separate repair; PR846 remains frozen. Narrow #624 UI/realtime
handoff permits only the Market flow and a real-render browser regression.
Preserve #668/#736 inventory authority and REF042 freshness/session boundaries.
No app/API/realtime/backend/CSS changes, economic writes, live requests, credential
changes, deployment, release-hold restoration, or assertion/deadline weakening.
At most five paths and 350 semantic changed lines; runtime at most 100 lines.

Temporary real-module reproduction on base f590dadd and PR846 c9303240:
synthetic accepted sell -> exact FILLED visible -> pending notifications refresh
resolves -> real terminal store render removes the appended receipt. Without
the late refresh, receipt remains. All four cases make one mutation call, preserve
fixture holdings, and have no page errors. Default freshness coordinator retained.
This proves the mechanism, not original CI causality or database persistence.
Diagnostic result SHA256: 5b06f37b4eab1abfb3d51840b6b9fcbab6099faf88400ec98e43ca3b49cf7e8f.

Proposed repair retains an accepted receipt through terminal renders, while
explicit dismissal, navigation, session exit, and flow destruction retire it.
Tests cover late/repeated refresh, focus/accessibility, dismissal, destroy/recreate,
and no duplicate mutation. Parent owns independent review and merge. REF025 stays
BLOCKED; REF027 retains its 025+026 dependency. Validation pending.
