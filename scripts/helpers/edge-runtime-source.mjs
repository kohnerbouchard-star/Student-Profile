import { staticValueImports } from "../../backend/src/security/staticValueImports.test.support.ts";
import { readBrowserSourceSync } from "../lib/browser-module-source.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Source contracts inspect only the explicit modules extracted from each root.
// Unknown files retain ordinary readFileSync behavior. Assertions remain unchanged.
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const extractedModules = {
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
  "backend/supabase/functions/player-web-session-api/staging-compat-entrypoint.ts": [
    "backend/supabase/functions/player-web-session-api/stagingCompatHttp.ts",
    "backend/supabase/functions/player-web-session-api/stagingCompatContracts.ts",
    "backend/supabase/functions/player-web-session-api/stagingCompatUpstream.ts",
    "backend/supabase/functions/player-web-session-api/stagingCompatSession.ts"
  ],
  "backend/supabase/functions/player-web-session-api/staging-compat-entrypoint-v2.ts": [
    "backend/supabase/functions/player-web-session-api/stagingCompatV2Http.ts",
    "backend/supabase/functions/player-web-session-api/stagingCompatV2Contracts.ts",
    "backend/supabase/functions/player-web-session-api/stagingCompatV2Upstream.ts",
    "backend/supabase/functions/player-web-session-api/stagingCompatV2Session.ts"
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
