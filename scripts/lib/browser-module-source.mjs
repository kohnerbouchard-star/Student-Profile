// Source-contract fixtures follow the explicit extraction graph. Runtime fixtures execute
// these same classic scripts in dependency order; no source or assertion is rewritten.
import { readFileSync as readRawSync } from "node:fs";
import { readFile as readRaw } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
export const browserModuleDependencies = Object.freeze({
  "admin/player-identity-wiring.js": [
    "admin/player-identity-reset-scope.js",
    "admin/player-identity-roster.js",
    "admin/player-identity-profile.js"
  ],
  "admin/world-runtime-console.js": [
    "admin/world-runtime-presentation.js"
  ],
  "frontend/src/core/login.js": [
    "frontend/src/core/login-game-selection.js",
    "frontend/src/core/login-account-enrollment.js"
  ],
  "admin/admin-auth.js": [
    "admin/admin-request-normalization.js"
  ],
  "admin/settings-simplified.js": [
    "admin/settings-copy.js",
    "admin/settings-presentation.js"
  ],
  "admin/game-session-controls.js": [
    "admin/game-session-context.js",
    "admin/game-session-share-surface.js"
  ],
  "frontend/src/core/admin-mfa.js": [
    "frontend/src/core/admin-mfa-create-wizard.js"
  ],
  "admin/interaction-quality.js": [
    "admin/interaction-form-validation.js"
  ],
  "admin/inventory-redemption-queue-surface.js": [
    "admin/inventory-redemption-presentation.js"
  ],
  "admin/game-code-wiring.js": [
    "admin/game-code-share-presentation.js"
  ],
  "admin/v2/src/api/admin-api-client.js": [
    "admin/v2/src/api/admin-api-diagnostics.js",
    "admin/v2/src/api/admin-api-protocol.js",
    "admin/v2/src/api/admin-api-request.js"
  ],
  "admin/v2/src/app.js": [
    "admin/v2/src/app-presentation.js",
    "admin/v2/src/app-controllers.js"
  ],
  "admin/v2/src/routes/world-management/WorldManagementApi.js": [
    "admin/v2/src/routes/world-management/WorldManagementProtocol.js"
  ],
  "admin/v2/src/routes/players/PlayersRoute.js": [
    "admin/v2/src/routes/players/PlayerRoutePresentation.js"
  ],
  "admin/v2/src/routes/marketplace/MarketplaceRoute.js": [
    "admin/v2/src/routes/marketplace/MarketplaceRoutePresentation.js"
  ],
  "player-terminal/src/recovery/player-recovery-controller.js": [
    "player-terminal/src/recovery/player-operation-instrumentation.js"
  ]
});

function sourcePaths(file) {
  if (typeof file !== "string" && !(file instanceof URL)) return null;
  const absolute = file instanceof URL ? fileURLToPath(file) : path.resolve(file);
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  const dependencies = browserModuleDependencies[relative];
  return dependencies ? [...dependencies.map(name => path.join(root, name)), absolute] : null;
}

export function readBrowserSourceSync(file, options) {
  const files = sourcePaths(file);
  if (!files) return readRawSync(file, options);
  const value = files.map(name => readRawSync(name, "utf8")).join("\n");
  return typeof options === "string" || options?.encoding ? value : Buffer.from(value);
}

export async function readBrowserSource(file, options) {
  const files = sourcePaths(file);
  if (!files) return readRaw(file, options);
  const value = (await Promise.all(files.map(name => readRaw(name, "utf8")))).join("\n");
  return typeof options === "string" || options?.encoding ? value : Buffer.from(value);
}
