import { staticValueImports } from "../../backend/src/security/staticValueImports.test.support.ts";
import { readBrowserSourceSync } from "../lib/browser-module-source.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Source contracts inspect only the explicit modules extracted from each root.
// Unknown files retain ordinary readFileSync behavior. Assertions remain unchanged.
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const extractedModules = {
  "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts": [
    "backend/src/domains/players/contracts/playerWorldBankingCapabilityEndpoints.ts",
    "backend/src/domains/players/contracts/playerBusinessCapabilityEndpoints.ts",
    "backend/src/domains/players/contracts/playerGameplayCapabilityEndpoints.ts",
    "backend/src/domains/players/contracts/playerSocialCapabilityEndpoints.ts"
  ],
  "backend/supabase/functions/classroom-api/index.ts": [
    "backend/supabase/functions/classroom-api/dispatchPlayerWorldRoutes.ts",
    "backend/supabase/functions/classroom-api/classroomClients.ts",
    "backend/supabase/functions/classroom-api/dispatchPlayerEconomyRoutes.ts",
    "backend/supabase/functions/classroom-api/dispatchStaffRoutes.ts"
  ],
  "backend/supabase/functions/admin-api/readModels.ts": [
    "backend/supabase/functions/admin-api/playerReadModel.ts",
    "backend/supabase/functions/admin-api/playerReadSupport.ts",
    "backend/supabase/functions/admin-api/attendanceReadModels.ts",
    "backend/supabase/functions/admin-api/gameResourceReadModels.ts"
  ],
  "backend/supabase/functions/admin-api/worldRuntimeOperations.ts": [
    "backend/supabase/functions/admin-api/worldRuntimeContracts.ts",
    "backend/supabase/functions/admin-api/worldRuntimeValidation.ts",
    "backend/supabase/functions/admin-api/campaignOperations.ts",
    "backend/supabase/functions/admin-api/worldTravelOperations.ts"
  ],
  "backend/supabase/functions/admin-api/gameRoutes.ts": [
    "backend/supabase/functions/admin-api/gameReadSupport.ts",
    "backend/supabase/functions/admin-api/gameWriteRoutes.ts"
  ],
  "backend/supabase/functions/admin-api/messagingOperationsCore.ts": [
    "backend/supabase/functions/admin-api/messagingOperationContracts.ts",
    "backend/supabase/functions/admin-api/messagingOperationValidation.ts"
  ],
  "backend/supabase/functions/admin-api/mutationAdapters.ts": [
    "backend/supabase/functions/admin-api/mutationValues.ts",
    "backend/supabase/functions/admin-api/storeMutationNormalization.ts",
    "backend/supabase/functions/admin-api/settingsMutationNormalization.ts"
  ],
  "backend/supabase/functions/admin-api/index.ts": [
    "backend/supabase/functions/admin-api/adminGlobalRoutes.ts"
  ],
  "backend/supabase/functions/admin-api/readExtensions.ts": [
    "backend/supabase/functions/admin-api/attendanceWealthReadSupport.ts"
  ],
  "backend/supabase/functions/admin-api/playerOperations.ts": [
    "backend/supabase/functions/admin-api/playerLedgerCurrency.ts",
    "backend/supabase/functions/admin-api/playerOperationSupport.ts",
    "backend/supabase/functions/admin-api/playerHistoryAudit.ts",
    "backend/src/domains/players/application/readAdminPlayerHistory.ts",
    "backend/src/domains/players/infrastructure/supabaseAdminPlayerHistoryReadRepository.ts"
  ],
  "backend/supabase/functions/web-session-api/index.ts": [
    "backend/supabase/functions/web-session-api/sessionHttp.ts",
    "backend/supabase/functions/web-session-api/sessionContracts.ts",
    "backend/supabase/functions/web-session-api/sessionActions.ts",
    "backend/supabase/functions/web-session-api/sessionUpstream.ts"
  ],
  "backend/supabase/functions/player-web-session-api/runtime.ts": [
    "backend/supabase/functions/player-web-session-api/playerSessionHttp.ts",
    "backend/supabase/functions/player-web-session-api/playerSessionContracts.ts",
    "backend/supabase/functions/player-web-session-api/playerSessionActions.ts",
    "backend/supabase/functions/player-web-session-api/playerSessionUpstream.ts"
  ],
  "backend/supabase/functions/license-email-worker/index.ts": [
    "backend/supabase/functions/license-email-worker/emailWorkerValidation.ts",
    "backend/supabase/functions/license-email-worker/emailWorkerContracts.ts",
    "backend/supabase/functions/license-email-worker/emailWorkerAuthorization.ts",
    "backend/supabase/functions/license-email-worker/emailDelivery.ts",
    "backend/supabase/functions/license-email-worker/emailTemplate.ts"
  ],
  "backend/supabase/functions/player-api/runtime.ts": [
    "backend/supabase/functions/player-api/dispatchPlayerWorldRoutes.ts",
    "backend/supabase/functions/player-api/dispatchPlayerEconomyRoutes.ts"
  ],
  "backend/supabase/functions/stripe-license-webhook/index.ts": [
    "backend/supabase/functions/stripe-license-webhook/stripeCheckoutValidation.ts",
    "backend/supabase/functions/stripe-license-webhook/stripeWebhookContracts.ts"
  ],
  "backend/supabase/functions/license-payment-webhook/index.ts": [
    "backend/supabase/functions/license-payment-webhook/paymentWebhookValidation.ts",
    "backend/supabase/functions/license-payment-webhook/paymentWebhookContracts.ts"
  ],
};

export function readEdgeRuntimeSource(input, encoding = "utf8") {
  const absolute = input instanceof URL ? fileURLToPath(input) : path.resolve(input);
  const relative = path.relative(repositoryRoot, absolute).split(path.sep).join("/");
  const source = readFileSync(absolute, encoding);
  const modules = extractedModules[relative];
  if (!modules) return readBrowserSourceSync(input, encoding);
  const sources = new Map([[relative, source], ...modules.map((module) =>
    [module, readFileSync(path.join(repositoryRoot, module), encoding)])]);
  assertExtractedModulesReachable(relative, modules, sources);
  return [source, ...modules.map((module) => sources.get(module))].join("\n");
}

/** Traverse only the explicit extraction whitelist, never unrelated dependencies. */
export function assertExtractedModulesReachable(root, modules, sources) {
  const allowed = new Set([root, ...modules]);
  const reached = new Set();
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    if (reached.has(current)) continue;
    reached.add(current);
    const source = sources.get(current);
    if (typeof source !== "string") throw new Error(`Missing composition source: ${current}`);
    for (const specifier of staticValueImports(source)) {
      if (!specifier.startsWith(".")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(current), specifier));
      if (allowed.has(target)) pending.push(target);
    }
  }
  for (const module of modules) {
    if (!reached.has(module)) throw new Error(`Extracted module is disconnected from ${root}: ${module}`);
  }
}
