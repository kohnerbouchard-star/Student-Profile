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

The current branch has been cross-checked against v606 commit `2a1d223c3d986fbb75f8c0b87d93c53820ef2e35`. The generated terminal bundle, primary terminal CSS, page-shell CSS, and integrity CSS are byte-identical. Remaining differences are intentional authentication, API, asset-restoration, credential-wiring, and validation layers.

## Player credentials

The existing **Edit Player Profile** popup is the only existing-player credential editing surface.

- Player ID / RFID card is editable there.
- New Access Code is optional; leaving it blank preserves the current Access Code.
- Existing Access Codes cannot be displayed because only secure hashes are stored.
- The internal player UUID remains hidden and immutable and is used only as the backend route target.
- No Overview Player IDs button, standalone credential manager, or separate inline identity panel is permitted.

In **Add Player**, Player ID / RFID card and Access Code are optional inputs. A blank field is generated with browser cryptographic randomness before the authenticated create request is sent. A successful create closes the editor and opens a v606-styled **Player created** confirmation showing the credentials once. The old inline-styled credential overlay is suppressed.

## Runtime rule

Use the authenticated `/api/admin` transport. Do not add additional fetch/XHR wrapper layers. Non-create requests must pass through the create-action adapter without consuming their `Request` bodies. Player creation UX may prepare form values, but it must not intercept or replace the network transport.