// Default-deny exclusions: every other tracked path is a runtime/qualification
// input, including runtime-read docs/contracts, seeds, config, assets and helpers.
export const METADATA_PATHS = Object.freeze([
  'docs/architecture/inventories/econovaria-architecture-inventory-v2.json',
  'docs/roadmaps/econovaria-beta-completion-roadmap-v1.md',
  'docs/operations/contracts/player-cross-cutting/pr-938.json',
  'docs/operations/contracts/player-cross-cutting/pr-933.json',
  'docs/operations/evidence/player-roster-import-v1/backend-scope.md',
  'docs/operations/evidence/classroom-roster-csv-review-v1/scope.md',
]);
export const HARNESS_PATHS = Object.freeze([
  '.github/workflows/roster-connected-e2e.yml',
  ...['README.md','auth-fixture.mjs','auth-fixture.test.mjs','browser.mjs',
    'database.mjs','evidence.mjs','gate.test.mjs','prepare.mjs','provisioning.mjs',
    'run.mjs','sources.json','runtime-inputs.mjs','runtime-equivalence.mjs',
    'runtime-equivalence.test.mjs','mode-fixtures.mjs','student-access.mjs',
    'student-access.test.mjs'].map(name => `scripts/roster-connected/${name}`),
]);
// Installed tools are generated only by locked npm ci in CI. These exact roots
// are not application inputs; ignored .env/config/fixtures elsewhere are checked.
export const GENERATED_DEPENDENCY_ROOTS = Object.freeze([
  'node_modules', 'backend/node_modules', 'player-terminal/node_modules',
]);
export const OVERLAY_PATHS = Object.freeze([
  'admin/v2/src/api/admin-api-client.js',
  'admin/v2/src/api/player-roster-import.js',
  ...['PlayersController','PlayersRoute','RosterCsvReview','RosterImportController','roster-csv']
    .map(name => `admin/v2/src/routes/players/${name}.js`),
]);
export const API_PATH = OVERLAY_PATHS[0];
export const API_ROSTER_LINES = Object.freeze([
  'import { createRosterImportRequest } from "./player-roster-import.js";\n',
  '    importPlayerRoster: createRosterImportRequest({ mutate: playerMutation, collectionPath: playersCollectionPath }),\n',
]);
export const API_EXPORT_SEAM = '    createPlayer,\n    updatePlayerSettings,\n';
export const MODE_API_RELATION = Object.freeze({
  'backend-owned':'roster-two-line-inverse',
  'integrated-composite':'exact-equality',
});
export const MODES = Object.freeze(Object.keys(MODE_API_RELATION));
export function classifyPath(path) {
  if (METADATA_PATHS.includes(path)) return 'metadata';
  if (HARNESS_PATHS.includes(path)) return 'harness';
  return 'runtime';
}
// Broad-by-default coverage also schedules newly introduced roots. Only these
// exact metadata paths are excluded; both owner authority paths explicitly wake
// the gate. Harness and pin edits always schedule it, including README changes.
export const WORKFLOW_PATHS = Object.freeze([
  '**', ...METADATA_PATHS.map(path => `!${path}`),
  ...METADATA_PATHS.filter(path => /\/pr-(?:933|938)\.json$/.test(path)),
]);
export function workflowEvents() {
  return `on:\n  workflow_dispatch:\n  pull_request:\n    branches: [main]\n    paths:\n${WORKFLOW_PATHS.map(path => `      - '${path}'\n`).join('')}`;
}
export function workflowSelects(path) {
  let selected = false;
  for (const pattern of WORKFLOW_PATHS) {
    if (pattern === '**' || pattern.replace(/^!/, '') === path) selected = !pattern.startsWith('!');
  }
  return selected;
}
