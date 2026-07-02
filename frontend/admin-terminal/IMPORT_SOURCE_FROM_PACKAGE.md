# Admin Terminal Source Import

The admin terminal UI was developed outside the repo during package iteration. This branch adds the integration notes and Codex wiring prompt. Before wiring, place the accepted admin terminal source under this directory.

Use this baseline:

- keep Marketplace UI work through v527
- keep the v529 order-ticket options change
- do not use v528, v530, or v531 Settings work
- keep Settings out of scope

Expected directory shape:

```text
frontend/admin-terminal/
  index.html
  inspect_players.html
  package.json
  README.md
  css/
  src/admin-overview/fragments/
  tools/
```

After source is placed here, run:

```bash
cd frontend/admin-terminal
npm install --ignore-scripts
npm run build
npm run check
npm run smoke
```

Codex should add a backend adapter before wiring page renderers.
