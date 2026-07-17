# V7 Visual and Icon Lock

The approved v7 visual files and icon component remain byte-for-byte unchanged.

| File | SHA-256 |
|---|---|
| `css/player-terminal-base.css` | `8da4902d9851b579704bf71d37c3e2e5b49f27c1f6c621746ffd0c77879fdd0e` |
| `css/player-terminal.css` | `004ffcf7265ebf0f72de2064cf9ed7e554aecd08568be54413f92a3833f3892a` |
| `css/player-terminal-ux.css` | `4f960ad2e878500569ed0863e43350c9b662f5de99de67bc20d6656cae642356` |
| `css/player-terminal-polish.css` | `09ea86afa5e977b628f2b65c394b0428437b4917c8e176e2a1a1988c0da1bbf8` |
| `src/components/icons.js` | `1cabd37bbcc4c98f73d12a64b6e95316d3b2cf18c304defd6612fc2dba8ef751` |

v7.4 adds one final stylesheet:

- `css/player-terminal-normalization.css`
- SHA-256: `980abdaa806a4247be1370143bcb1d5becb03385356500157a52062d80f14ded`

The normalization layer changes only typography roles, spacing, wrapping, grid shrink behavior, safe padding, and mobile containment. It does not replace the locked visual stack.

The dashboard map geometry, session adapter, provisional API connection map, and route renderers remain intact except for the CSS-driven fit corrections documented in `VISUAL_NORMALIZATION.md`.
