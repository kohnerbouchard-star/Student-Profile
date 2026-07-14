# Econovaria Admin Runtime

The `/admin/` runtime hosts the accepted v606 Admin Overview Terminal bundle inside the authenticated application shell.

## Visual baseline

The generated terminal bundle and its primary CSS remain the accepted v606 files. Runtime wiring must not redesign or replace their UI.

Original repository-owned assets are served from `admin/assets/` using the filenames expected by the bundle. This includes the player-action, bank, holdings, Google Classroom, and ten-country currency SVGs; CSV/export and mask PNGs; and the original modal videos:

- SCI-ID card: `assets/videos/id-background.mp4`
- Add Player: `assets/videos/player-background.mp4`
- Add Contract: `assets/videos/contract-background.mp4`
- Add Store Item: `assets/videos/store-background.mp4`
- Attendance Scanner: `assets/videos/scanner-background.mp4`

Generic media fallbacks apply only to uploaded/content media. They must not replace interface symbols or modal videos.

The current branch has been cross-checked against v606 commit `2a1d223c3d986fbb75f8c0b87d93c53820ef2e35`. The generated terminal bundle, primary terminal CSS, page-shell CSS, and integrity CSS are byte-identical. Remaining differences are intentional authentication, API, asset-restoration, credential-wiring, confirmation-layout, and validation layers.

## Player credentials

The existing **Edit Player Profile** popup is the only existing-player credential editing surface.

- Player ID / RFID card is editable there.
- New Access Code is optional; leaving it blank preserves the current Access Code.
- Existing Access Codes cannot be displayed because only secure hashes are stored.
- The internal player UUID remains hidden and immutable and is used only as the backend route target.
- No Overview Player IDs button, standalone credential manager, or separate inline identity panel is permitted.

In **Add Player**, Player ID / RFID card and Access Code are optional inputs. A blank field is generated with browser cryptographic randomness immediately before the authenticated create request is sent. Manually entered credentials are preserved unchanged.

A successful create closes the editor and opens a bounded, responsive v606-style **Player created** confirmation. It displays the Player ID and Access Code once, identifies generated versus custom values, supports copying, and requires explicit acknowledgement. The old inline-styled credential overlay is suppressed and removed.

## Runtime rule

Use the authenticated `/api/admin` transport. Do not add additional fetch/XHR wrapper layers. Non-create requests must pass through the create-action adapter without consuming their `Request` bodies. Player creation UX may prepare form values, but it must not intercept or replace the network transport.

## Validation and known gaps

The browser suite covers desktop, compact, and narrow layouts; all create workflows; blank and manual player credentials; the Player-created confirmation; Edit Player Profile; player login; and attendance. Backend Typecheck, Admin API Check, Admin Bundle Contract Audit, and Admin Shell Smoke must remain green.

The broader audit identified incomplete game-code reset UX, partial net-worth scoring, missing attendance reward-ledger aggregation, safe empty notification/help states, advanced contract/store/settings mutations that still need live verification, and session-based rather than heartbeat-based presence. These are existing feature-completeness gaps, not visual or architectural regressions introduced by this branch.