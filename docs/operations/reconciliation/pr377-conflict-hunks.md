# PR 377 conflict hunks

- PR head: 091fcf8582f98fc8e249c65ea06701e2c81686e6
- Main head: 9af934f168e55159d3cac475540f30ee035685c2
- Merge status: 1

## .github/workflows/admin-browser-e2e.yml
```diff
diff --cc .github/workflows/admin-browser-e2e.yml
index adbbef50,0c487d72..00000000
--- a/.github/workflows/admin-browser-e2e.yml
+++ b/.github/workflows/admin-browser-e2e.yml
@@@ -20,15 -16,12 +20,21 @@@ on
        - "backend/supabase/functions/**"
        - "backend/supabase/migrations/**"
        - "scripts/admin-browser-reconnaissance.mjs"
 +      - "scripts/admin-connected-ledger-mutation-browser-acceptance.mjs"
 +      - "scripts/button-action-coverage-contract.mjs"
        - "scripts/econovaria-local-gateway.py"
+       - "scripts/local-auth-readiness.mjs"
        - "scripts/staff-service-role-access-contract.test.mjs"
        - "scripts/persisted-game-code-contract.test.mjs"
        - "scripts/game-creation-provisioning-local-acceptance.mjs"
        - "scripts/build-physical-economy-runtime-pack.mjs"
++<<<<<<< HEAD
 +      - "scripts/local-staging-gateway.py"
 +      - "docs/operations/contracts/button-action-coverage-v1.json"
++||||||| ebd6f080
++      - "scripts/local-staging-gateway.py"
++=======
++>>>>>>> origin/main
        - "docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json"
        - "docs/seed-content/executable/beta-pack-v1/**"
  
@@@ -69,17 -62,52 +75,59 @@@ jobs
            node-version: "22.23.1"
            cache: npm
  
-       - name: Install pinned tooling and Chromium
+       - name: Pin npm
+         shell: bash
+         run: |
+           set -euo pipefail
+           for ATTEMPT in 1 2 3; do
+             if npm install --global npm@10.9.8; then
+               exit 0
+             fi
+             sleep $((ATTEMPT * 5))
+           done
+           exit 1
+ 
+       - name: Install repository dependencies
+         shell: bash
+         run: |
+           set -euo pipefail
+           for ATTEMPT in 1 2 3; do
+             if npm ci; then
+               exit 0
+             fi
+             sleep $((ATTEMPT * 5))
+           done
+           exit 1
+ 
+       - name: Validate browser harness contracts
+         shell: bash
          run: |
            set -euo pipefail
-           npm install --global npm@10.9.8
-           npm ci
            node --check scripts/admin-browser-reconnaissance.mjs
++<<<<<<< HEAD
 +          node --check scripts/admin-connected-ledger-mutation-browser-acceptance.mjs
 +          python3 -m py_compile scripts/econovaria-local-gateway.py scripts/local-staging-gateway.py
++||||||| ebd6f080
++          python3 -m py_compile scripts/econovaria-local-gateway.py scripts/local-staging-gateway.py
++=======
+           node --check scripts/local-auth-readiness.mjs
+           python3 -m py_compile scripts/econovaria-local-gateway.py
+           node --test scripts/local-staging-gateway-contract.test.mjs
++>>>>>>> origin/main
            node --test scripts/staff-service-role-access-contract.test.mjs
            node --test scripts/persisted-game-code-contract.test.mjs
-           npx playwright install --with-deps chromium
+ 
+       - name: Install Chromium
+         shell: bash
+         run: |
+           set -euo pipefail
+           for ATTEMPT in 1 2 3; do
+             if npx playwright install --with-deps chromium; then
+               exit 0
+             fi
+             sleep $((ATTEMPT * 5))
+           done
+           exit 1
  
        - name: Build exact authorized Crafting pack
          shell: bash
```

## .github/workflows/beta-security-contract.yml
```diff
diff --cc .github/workflows/beta-security-contract.yml
index 1b6e52a3,33af872b..00000000
--- a/.github/workflows/beta-security-contract.yml
+++ b/.github/workflows/beta-security-contract.yml
@@@ -60,34 -102,130 +102,165 @@@ jobs
          working-directory: backend
          run: npm run test:player-security
  
++<<<<<<< HEAD
 +      - name: Typecheck all backend surfaces
 +        id: backend-typecheck
 +        working-directory: backend
 +        shell: bash
 +        run: |
 +          set +e
 +          npm run typecheck:all > "$RUNNER_TEMP/beta-security-backend-typecheck.log" 2>&1
 +          status=$?
 +          echo "status=$status" >> "$GITHUB_OUTPUT"
 +          tail -n 200 "$RUNNER_TEMP/beta-security-backend-typecheck.log"
 +          exit 0
 +
 +      - name: Upload backend typecheck diagnostics
 +        if: always()
 +        uses: actions/upload-artifact@v4
 +        with:
 +          name: beta-security-backend-typecheck-diagnostics
 +          path: ${{ runner.temp }}/beta-security-backend-typecheck.log
 +          if-no-files-found: error
 +          retention-days: 7
 +
 +      - name: Enforce backend typecheck
 +        shell: bash
 +        run: |
 +          if [ "${{ steps.backend-typecheck.outputs.status }}" != "0" ]; then
 +            echo "Beta Security backend typecheck failed. Download the diagnostics artifact."
 +            false
 +          fi
++||||||| ebd6f080
++      - name: Typecheck all backend surfaces
++        working-directory: backend
++        run: npm run typecheck:all
++=======
+       - name: Run authentication convergence contracts
+         env:
+           SUPABASE_URL: http://localhost:54321
+           SUPABASE_PUBLISHABLE_KEY: sb_publishable_security_contract
+           SUPABASE_SECRET_KEY: sb_secret_security_contract_0123456789abcdef
+           ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
+           ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY: BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
+           ECONOVARIA_PURCHASE_CODE_HMAC_SECRET: purchase_code_hmac_security_contract_0123456789abcdef
+         run: |
+           deno test \
+             --allow-env=SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SUPABASE_SECRET_KEY,ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY,ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY,ECONOVARIA_PURCHASE_CODE_HMAC_SECRET \
+             --config backend/supabase/functions/classroom-api/deno.json \
+             --lock=backend/supabase/functions/deno.lock \
+             --frozen \
+             backend/src/security/staffPasswordPolicy.test.ts \
+             backend/src/security/authenticationThrottle.test.ts \
+             backend/src/security/edgeRequestBoundary.test.ts \
+             backend/src/security/webAdminSession.test.ts \
+             backend/src/domains/auth/api/staffLoginHttpHandler.test.ts \
+             backend/src/domains/auth/api/staffSignupHttpHandlerTest.ts \
+             backend/src/domains/players/api/playerBrowserSessionPrivacyHttpHandlers.test.ts \
+             backend/supabase/functions/admin-api/adminSecurityGuard.test.ts
+ 
+       - name: Typecheck all security surfaces
+         id: security_typecheck
+         shell: bash
+         run: |
+           set +e
+           {
+             npm --prefix backend run typecheck:all
+             deno check \
+               --config backend/supabase/functions/classroom-api/deno.json \
+               --lock=backend/supabase/functions/deno.lock \
+               --frozen \
+               backend/supabase/functions/bootstrap-api/index.ts \
+               backend/supabase/functions/staff-api/index.ts \
+               backend/supabase/functions/staff-mfa-api/index.ts \
+               backend/supabase/functions/player-api/index.ts \
+               backend/supabase/functions/player-web-session-api/index.ts \
+               backend/supabase/functions/web-session-api/index.ts \
+               backend/supabase/functions/password-reset-api/index.ts
+             node --check api/_admin-bff-proxy.js
+             node --check api/_player-bff-proxy.js
+             node --check 'api/admin-session/[...path].js'
+             node --check 'api/admin/[...path].js'
+             node --check 'api/player-session/[...path].js'
+             node --check 'api/player/[...path].js'
+             node --check api/password-reset.js
+             node --check admin/auth-session-manager.js
+             node --check admin/admin-auth.js
+             node --check admin/session-timeout-safe-exit.js
+             node --check auth/reset-password.js
+             node --check frontend/src/core/api.js
+             node --check frontend/src/core/admin-mfa.js
+             node --check frontend/src/core/login.js
+           } 2>&1 | tee "$RUNNER_TEMP/beta-security-typecheck.log"
+           status=${PIPESTATUS[0]}
+           printf 'status=%s\n' "$status" >> "$GITHUB_OUTPUT"
+           exit 0
+ 
+       - name: Upload Beta Security typecheck diagnostics
+         if: always()
+         uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
+         with:
+           name: beta-security-typecheck-diagnostics
+           path: ${{ runner.temp }}/beta-security-typecheck.log
+           if-no-files-found: error
+           retention-days: 7
+ 
+       - name: Enforce security-surface typecheck
+         shell: bash
+         run: test "${{ steps.security_typecheck.outputs.status }}" = "0"
+ 
+       - name: Validate authentication boundary ratchet
+         run: node --test scripts/auth-boundary-contract.test.mjs
+ 
+       - name: Validate fail-closed password reset remediation
+         run: node --test --test-name-pattern="password reset fails closed" scripts/security-audit-remediation-contract.test.mjs
+ 
+       - name: Validate purchase-code HMAC remediation
+         run: node --test --test-name-pattern="purchase codes use keyed" scripts/security-audit-remediation-contract.test.mjs
+ 
+       - name: Validate Player browser credential privacy
+         run: node --test --test-name-pattern="Player browser runtime" scripts/security-audit-remediation-contract.test.mjs
+ 
+       - name: Validate Player HttpOnly BFF remediation
+         run: node --test --test-name-pattern="Player BFF seals" scripts/security-audit-remediation-contract.test.mjs
+ 
+       - name: Validate deployment browser policy
+         run: node --test --test-name-pattern="deployment policy" scripts/security-audit-remediation-contract.test.mjs
+ 
+       - name: Validate internal runner HMAC and replay denial
+         run: node --test --test-name-pattern="internal stock runners" scripts/security-audit-remediation-contract.test.mjs
+ 
+       - name: Validate Admin MFA BFF boundary
+         run: node --test scripts/admin-mfa-bff-contract.test.mjs
+ 
+       - name: Validate Admin session manager boundary
+         id: admin_session_manager
+         continue-on-error: true
+         shell: bash
+         run: |
+           set -o pipefail
+           node scripts/admin-session-manager-smoke.mjs 2>&1 | tee "$RUNNER_TEMP/admin-session-manager.log"
+ 
+       - name: Upload Admin session-manager diagnostics
+         if: always()
+         uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
+         with:
+           name: admin-session-manager-diagnostics
+           path: ${{ runner.temp }}/admin-session-manager.log
+           if-no-files-found: error
+           retention-days: 7
+ 
+       - name: Enforce Admin session-manager boundary
+         if: always()
+         shell: bash
+         run: test "${{ steps.admin_session_manager.outcome }}" = "success"
+ 
+       - name: Validate local gateway boundary
+         run: node --test scripts/local-staging-gateway-contract.test.mjs
+ 
+       - name: Validate Vercel proxy boundary
+         run: node --test scripts/vercel-auth-proxy-contract.test.mjs
++>>>>>>> origin/main
  
        - name: Validate connected probe contracts
          run: npm run test:security-probes
```

## admin/progression-review-client.js
```diff
diff --cc admin/progression-review-client.js
index 2ae631ca,a5f8692d..00000000
--- a/admin/progression-review-client.js
+++ b/admin/progression-review-client.js
@@@ -1,41 -1,59 +1,115 @@@
  const clean = (value) => String(value ?? "").trim();
++<<<<<<< HEAD
 +const ADMIN_SESSION_KEY = "econovaria.admin.auth.v1";
 +
++||||||| ebd6f080
++=======
+ const DEVICE_KEY = "econovaria.device.v1";
+ const DEVICE_HEADER = "x-econovaria-device-id";
+ const GAME_HEADER = "x-econovaria-game-id";
+ const CSRF_HEADER = "x-econovaria-csrf-token";
+ const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
+ 
+ function runtimeConfig() {
+   return window.EconovariaRuntimeConfig || {};
+ }
+ 
++>>>>>>> origin/main
  function apiBase() {
-   return clean(document.querySelector('meta[name="econovaria-admin-api-base"]')?.content).replace(/\/+$/, "");
+   return clean(
+     runtimeConfig().adminBffApiUrl ||
+       document.querySelector('meta[name="econovaria-admin-api-base"]')?.content,
+   ).replace(/\/+$/, "");
  }
++<<<<<<< HEAD
 +
 +function storedSession() {
 +  try {
 +    const value = JSON.parse(globalThis.sessionStorage?.getItem(ADMIN_SESSION_KEY) || "null");
 +    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
 +  } catch {
 +    return null;
 +  }
 +}
 +
 +function authHeaders() {
 +  const manager = window.AdminAuthSessionManager;
 +  const managed = manager?.getSession?.() || manager?.session || null;
 +  const session = managed || storedSession();
 +  const token = clean(
 +    session?.access_token ||
 +      session?.accessToken ||
 +      manager?.getAccessToken?.(),
 +  ).replace(/^Bearer\s+/i, "");
 +  return token ? { authorization: `Bearer ${token}` } : {};
++||||||| ebd6f080
++function authHeaders() {
++  const manager = window.AdminAuthSessionManager;
++  const session = manager?.getSession?.() || manager?.session || null;
++  const token = clean(session?.access_token || session?.accessToken || manager?.getAccessToken?.());
++  return token ? { authorization: `Bearer ${token}` } : {};
++=======
+ 
+ function deviceId() {
+   const existing = clean(window.localStorage.getItem(DEVICE_KEY)).toLowerCase();
+   if (DEVICE_PATTERN.test(existing)) return existing;
+   const generated = clean(window.crypto?.randomUUID?.()).toLowerCase();
+   if (!DEVICE_PATTERN.test(generated)) {
+     throw new Error("Secure device identifier generation is unavailable.");
+   }
+   window.localStorage.setItem(DEVICE_KEY, generated);
+   return generated;
++>>>>>>> origin/main
  }
++<<<<<<< HEAD
 +
 +async function request(path, { method = "GET", body, idempotencyKey } = {}) {
++||||||| ebd6f080
++async function request(path, { method = "GET", body, idempotencyKey } = {}) {
++=======
+ 
+ async function request(gameId, path, { method = "GET", body, idempotencyKey } = {}) {
++>>>>>>> origin/main
    const base = apiBase();
++<<<<<<< HEAD
 +  if (!base) throw new Error("Admin API base is not configured.");
 +  const authorization = authHeaders();
 +  if (!authorization.authorization) {
 +    const error = new Error("An authenticated Admin session is required for Progression requests.");
 +    error.status = 401;
 +    throw error;
 +  }
 +  const headers = { accept: "application/json", "content-type": "application/json", ...authorization };
++||||||| ebd6f080
++  if (!base) throw new Error("Admin API base is not configured.");
++  const headers = { accept: "application/json", "content-type": "application/json", ...authHeaders() };
++=======
+   const publishableKey = clean(runtimeConfig().supabasePublishableKey);
+   const scope = clean(gameId);
+   if (!base || !publishableKey || !scope) {
+     throw new Error("Admin progression BFF configuration is incomplete.");
+   }
+ 
+   const manager = window.EconovariaAdminAuthSession;
+   const session = await manager?.getUsableSession?.();
+   if (!session) throw new Error("Administrator sign-in is required.");
+ 
+   const normalizedMethod = clean(method || "GET").toUpperCase();
+   const headers = {
+     accept: "application/json",
+     apikey: publishableKey,
+     [DEVICE_HEADER]: deviceId(),
+     [GAME_HEADER]: scope,
+   };
+   if (!["GET", "HEAD"].includes(normalizedMethod)) {
+     const csrfToken = clean(session.csrfToken);
+     if (!/^[A-Za-z0-9_-]{43}$/.test(csrfToken)) {
+       throw new Error("Administrator request verification is unavailable.");
+     }
+     headers[CSRF_HEADER] = csrfToken;
+     headers["content-type"] = "application/json";
+   }
++>>>>>>> origin/main
    if (idempotencyKey) {
      headers["x-idempotency-key"] = idempotencyKey;
      headers["x-request-id"] = idempotencyKey;
```

## backend/src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts
```diff
diff --cc backend/src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts
index 5dce3dbe,46b6cbea..00000000
--- a/backend/src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts
+++ b/backend/src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts
@@@ -41,18 -40,3 +41,38 @@@ export function readPlayerContractAccep
      ? { kind: "accept", contractKey }
      : { kind: "malformed" };
  }
++<<<<<<< HEAD
 +
 +function readExactRouteSegments(
 +  segments: readonly string[],
 +): readonly string[] | null {
 +  if (segments[0] === "players") return segments;
 +  if (segments[0] === "classroom-api") return segments.slice(1);
 +  if (
 +    segments[0] === "functions" &&
 +    segments[1] === "v1" &&
 +    segments[2] === "classroom-api"
 +  ) {
 +    return segments.slice(3);
 +  }
 +  return null;
 +}
++||||||| ebd6f080
++
++function readExactRouteSegments(
++  segments: readonly string[],
++): readonly string[] | null {
++  if (segments[0] === "players") return segments;
++
++  if (
++    segments[0] === "functions" &&
++    segments[1] === "v1" &&
++    segments[2] === "classroom-api"
++  ) {
++    return segments.slice(3);
++  }
++
++  return null;
++}
++=======
++>>>>>>> origin/main
```

## backend/src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts
```diff
diff --cc backend/src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts
index 829d2b58,785b5ec4..00000000
--- a/backend/src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts
+++ b/backend/src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts
@@@ -48,18 -40,3 +48,38 @@@ export function readPlayerContractPubli
      ? { kind: "submit", contractKey }
      : { kind: "malformed" };
  }
++<<<<<<< HEAD
 +
 +function readExactRouteSegments(
 +  segments: readonly string[],
 +): readonly string[] | null {
 +  if (segments[0] === "players") return segments;
 +  if (segments[0] === "classroom-api") return segments.slice(1);
 +  if (
 +    segments[0] === "functions" &&
 +    segments[1] === "v1" &&
 +    segments[2] === "classroom-api"
 +  ) {
 +    return segments.slice(3);
 +  }
 +  return null;
 +}
++||||||| ebd6f080
++
++function readExactRouteSegments(
++  segments: readonly string[],
++): readonly string[] | null {
++  if (segments[0] === "players") return segments;
++
++  if (
++    segments[0] === "functions" &&
++    segments[1] === "v1" &&
++    segments[2] === "classroom-api"
++  ) {
++    return segments.slice(3);
++  }
++
++  return null;
++}
++=======
++>>>>>>> origin/main
```

## backend/src/domains/contracts/api/playerContractRoutePaths.ts
```diff
diff --cc backend/src/domains/contracts/api/playerContractRoutePaths.ts
index c34914bc,f8d806cd..00000000
--- a/backend/src/domains/contracts/api/playerContractRoutePaths.ts
+++ b/backend/src/domains/contracts/api/playerContractRoutePaths.ts
@@@ -1,3 -1,6 +1,12 @@@
++<<<<<<< HEAD
++||||||| ebd6f080
++import { isUuid } from "../../../platform/supabase/uuid.ts";
++
++=======
+ import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
+ import { isUuid } from "../../../platform/supabase/uuid.ts";
+ 
++>>>>>>> origin/main
  export type PlayerContractRoute =
    | {
      readonly kind: "contracts";
@@@ -7,17 -10,38 +16,85 @@@
      readonly contractId: string;
    };
  
 +/**
 + * Legacy Player Contract routes are retired.
 + *
 + * Current Player clients use the public-key routes resolved by
 + * playerContractPublicListRoutePaths, playerContractAcceptanceRoutePaths, and
 + * playerContractPublicSubmitRoutePaths before this compatibility parser is
 + * consulted. Keeping the UUID-scoped `/submit` route reachable would preserve
 + * an unnecessary browser path that accepts internal identifiers.
 + */
  export function readPlayerContractRoutePath(
 -  pathname: string,
 +  _pathname: string,
  ): PlayerContractRoute | null {
++<<<<<<< HEAD
++||||||| ebd6f080
++  const segments = pathname.split("/").filter(Boolean);
++  const playersIndex = segments.lastIndexOf("players");
++
++  if (playersIndex < 0) {
++    return null;
++  }
++
++  const meSegment = segments[playersIndex + 1];
++  const contractsSegment = segments[playersIndex + 2];
++  const contractId = segments[playersIndex + 3];
++  const submitSegment = segments[playersIndex + 4];
++
++  if (meSegment !== "me" || contractsSegment !== "contracts") {
++    return null;
++  }
++
++  if (playersIndex + 3 === segments.length) {
++    return {
++      kind: "contracts",
++    };
++  }
++
++  if (
++    contractId &&
++    isUuid(contractId) &&
++    submitSegment === "submit" &&
++    playersIndex + 5 === segments.length
++  ) {
++    return {
++      kind: "submit",
++      contractId,
++    };
++  }
++
++=======
+   const segments = readPlayerApiRouteSegments(pathname);
+ 
+   if (
+     !segments ||
+     segments[0] !== "players" ||
+     segments[1] !== "me" ||
+     segments[2] !== "contracts"
+   ) {
+     return null;
+   }
+ 
+   if (segments.length === 3) {
+     return {
+       kind: "contracts",
+     };
+   }
+ 
+   const contractId = segments[3];
+   if (
+     contractId &&
+     isUuid(contractId) &&
+     segments[4] === "submit" &&
+     segments.length === 5
+   ) {
+     return {
+       kind: "submit",
+       contractId,
+     };
+   }
+ 
++>>>>>>> origin/main
    return null;
  }
```

## player-terminal/src/api/player-api.js
```diff
diff --cc player-terminal/src/api/player-api.js
index 83a6b450,f666f002..00000000
--- a/player-terminal/src/api/player-api.js
+++ b/player-terminal/src/api/player-api.js
@@@ -1,41 -1,337 +1,646 @@@
 -import { PLAYER_ENDPOINTS, resolveEndpoint } from "./endpoints.js";
 -import { PreviewTransport } from "./preview-transport.js";
 -import { HttpTransport } from "./http-transport.js";
 -import { AdapterTransport } from "./adapter-transport.js";
 -import { ApiRequestError, normalizeApiError } from "./errors.js";
 -import { resourceFreshnessMs } from "./freshness.js";
 -import {
 -  clearAllResourceInvalidations,
 -  clearResourceInvalidation,
 -  isResourceInvalidated
 -} from "./invalidation-registry.js";
 -import { createIdempotencyKey, createRequestId, stableOperationKey, stableRequestKey } from "./request-context.js";
 -import { normalizeApiResponse } from "./response-normalizer.js";
 -import { resolveCapabilities } from "./capabilities.js";
 -import { createResourceSupport, isResourceSupported } from "./resource-support.js";
 -import { unsupportedReadModel } from "./unsupported-read-models.js";
 -import {
 -  IDEMPOTENT_WRITE_ENDPOINTS,
 -  SHELL_OPTIONAL_RESOURCES,
 -  WRITE_INVALIDATIONS,
 -  resourcesForRoute
 -} from "./resource-plan.js";
 -
 -function resolvedPath(endpointKey, params) {
 +import { PLAYER_ENDPOINTS } from "./endpoints.js";
 +import { PlayerApi as CorePlayerApi } from "./player-api-core.js";
 +
 +function actionPathParams(endpointKey, payload, params = {}) {
    const endpoint = PLAYER_ENDPOINTS[endpointKey];
 -  if (!endpoint) throw new ApiRequestError("The requested player resource is not registered.", { code: "UNKNOWN_ENDPOINT", endpointKey });
 -  const path = resolveEndpoint(endpoint, params);
 -  if (/:[A-Za-z][A-Za-z0-9_]*/.test(path)) {
 -    throw new ApiRequestError("The request is missing a required resource identifier.", { code: "INVALID_REQUEST", endpointKey, path });
 +  if (!endpoint || typeof endpoint.path !== "string") return { ...params };
 +
 +  const resolved = { ...params };
 +  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
 +  for (const match of endpoint.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)) {
 +    const key = match[1];
 +    if (resolved[key] !== undefined && resolved[key] !== null && String(resolved[key]).trim()) continue;
 +    const value = source[key];
 +    if (value === undefined || value === null || !String(value).trim()) continue;
 +    resolved[key] = value;
    }
 -  return { endpoint, path };
 +  return resolved;
  }
  
++<<<<<<< HEAD
 +function adapterPayload(payload, params) {
 +  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
 +  const resolved = { ...payload };
 +  for (const [key, value] of Object.entries(params || {})) {
 +    if (Object.hasOwn(resolved, key)) continue;
 +    if (value === undefined || value === null || !String(value).trim()) continue;
 +    resolved[key] = value;
 +  }
 +  return resolved;
++||||||| ebd6f080
++function sessionFingerprint(config) {
++  return [config.playerSessionToken, config.gameSessionId, config.playerSessionId, config.accessToken]
++    .map((value) => String(value || ""))
++    .join("|");
++=======
+ function sessionFingerprint(config) {
+   return [config.authenticated === true ? "authenticated" : "anonymous", config.csrfToken, config.gameSessionId, config.sessionExpiresAt]
+     .map((value) => String(value || ""))
+     .join("|");
++>>>>>>> origin/main
 +}
 +
++<<<<<<< HEAD
 +export class PlayerApi extends CorePlayerApi {
 +  execute(endpointKey, payload, params = {}, options = {}) {
 +    const resolvedParams = actionPathParams(endpointKey, payload, params);
 +    return super.execute(
 +      endpointKey,
 +      adapterPayload(payload, resolvedParams),
 +      resolvedParams,
 +      options,
 +    );
++||||||| ebd6f080
++function mergeAbortSignals(...signals) {
++  const activeSignals = signals.filter((signal) => signal && typeof signal.addEventListener === "function");
++  if (!activeSignals.length) return { signal: null, cleanup: () => {} };
++  if (activeSignals.length === 1) return { signal: activeSignals[0], cleanup: () => {} };
++
++  const controller = new AbortController();
++  const abort = () => controller.abort();
++  for (const signal of activeSignals) {
++    if (signal.aborted) {
++      controller.abort();
++      break;
++    }
++    signal.addEventListener("abort", abort, { once: true });
++  }
++  return {
++    signal: controller.signal,
++    cleanup: () => activeSignals.forEach((signal) => signal.removeEventListener("abort", abort))
++  };
++}
++
++function shouldReuseIdempotencyKey(error) {
++  const status = Number(error?.status || 0);
++  return ["NETWORK_ERROR", "OFFLINE", "REQUEST_TIMEOUT"].includes(error?.code) || status >= 500;
++}
++
++function readyResourceStatus() {
++  return Object.freeze({ state: "ready", status: 200, code: "", retryAfterMs: 0 });
++}
++
++function unavailableResourceStatus(error) {
++  const normalized = normalizeApiError(error);
++  return Object.freeze({
++    state: "unavailable",
++    status: Number(normalized.status || 0),
++    code: String(normalized.code || "REQUEST_FAILED"),
++    retryAfterMs: Number(normalized.retryAfterMs || 0)
++  });
+ }
+ 
++function unsupportedResourceStatus() {
++  return Object.freeze({
++    state: "unavailable",
++    status: 0,
++    code: "CAPABILITY_UNAVAILABLE",
++    retryAfterMs: 0
++  });
++}
++
++export class PlayerApi {
++  constructor(config) {
++    this.config = config;
++    this.transport = config.usePreviewData
++      ? new PreviewTransport({ simulateWrites: config.simulatePreviewWrites })
++      : config.apiCall || config.adapter
++        ? new AdapterTransport(config.apiCall || config.adapter, config)
++        : new HttpTransport(config);
++    this.readCache = new Map();
++    this.readCacheUpdatedAt = new Map();
++    this.inFlightReads = new Map();
++    this.inFlightWrites = new Map();
++    this.writeCompletedAt = new Map();
++    this.retryIdempotencyKeys = new Map();
++    this.sessionVersion = 0;
++    this.sessionFingerprint = sessionFingerprint(config);
++    this.sessionController = new AbortController();
++    this.resourceSupport = createResourceSupport({ preview: config.usePreviewData === true });
++  }
++
++  setSession(session) {
++    if (!session || typeof session !== "object") return;
++    if (session.playerSessionToken) this.config.playerSessionToken = session.playerSessionToken;
++    if (session.gameSessionId) this.config.gameSessionId = session.gameSessionId;
++    if (session.playerSessionId) this.config.playerSessionId = session.playerSessionId;
++    if (session.accessToken) this.config.accessToken = session.accessToken;
++    const nextFingerprint = sessionFingerprint(this.config);
++    if (nextFingerprint !== this.sessionFingerprint) {
++      this.sessionController.abort();
++      this.sessionController = new AbortController();
++      this.sessionFingerprint = nextFingerprint;
++      this.sessionVersion += 1;
++      this.readCache.clear();
++      this.readCacheUpdatedAt.clear();
++      this.inFlightReads.clear();
++      this.inFlightWrites.clear();
++      this.writeCompletedAt.clear();
++      this.retryIdempotencyKeys.clear();
++      this.resourceSupport = createResourceSupport({ preview: this.config.usePreviewData === true });
++      clearAllResourceInvalidations();
++    }
++  }
++
++  isCachedReadFresh(endpointKey, key, now = Date.now()) {
++    if (isResourceInvalidated(endpointKey)) return false;
++    if (!this.readCache.has(key)) return false;
++    const updatedAt = Number(this.readCacheUpdatedAt.get(key) || 0);
++    const freshnessMs = resourceFreshnessMs(endpointKey, this.config.resourceFreshnessMs);
++    return freshnessMs > 0 && updatedAt > 0 && now - updatedAt <= freshnessMs;
++  }
++
++  async request(endpointKey, { params = {}, payload, force = false, signal = null } = {}) {
++    const { endpoint, path } = resolvedPath(endpointKey, params);
++    const requestId = createRequestId();
++    const mergedSignal = mergeAbortSignals(signal, this.sessionController.signal);
++    const context = { endpointKey, method: endpoint.method, path, payload, requestId, signal: mergedSignal.signal };
++    const key = stableRequestKey(context);
++    const sessionVersion = this.sessionVersion;
++
++    if (endpoint.method === "GET" && !force && this.isCachedReadFresh(endpointKey, key)) return this.readCache.get(key);
++    if (endpoint.method === "GET" && this.inFlightReads.has(key)) return this.inFlightReads.get(key);
++
++    const operation = this.transport.request(context)
++      .then((raw) => normalizeApiResponse(endpointKey, raw, { config: this.config, path, requestId }))
++      .then((value) => {
++        if (sessionVersion !== this.sessionVersion) {
++          throw new ApiRequestError("The request was cancelled.", { code: "REQUEST_ABORTED", endpointKey, path, requestId });
++        }
++        if (endpoint.method === "GET") {
++          this.readCache.set(key, value);
++          this.readCacheUpdatedAt.set(key, Date.now());
++          clearResourceInvalidation(endpointKey);
++        }
++        return value;
++      })
++      .catch((error) => { throw normalizeApiError(error, context); })
++      .finally(() => {
++        mergedSignal.cleanup();
++        if (endpoint.method === "GET" && this.inFlightReads.get(key) === operation) this.inFlightReads.delete(key);
++      });
++
++    if (endpoint.method === "GET") this.inFlightReads.set(key, operation);
++    return operation;
++  }
++
++  async bootstrap({ force = false } = {}) {
++    const session = await this.request("session", { force });
++    this.resourceSupport = createResourceSupport({
++      preview: this.config.usePreviewData === true,
++      session
++    });
++
++    const data = { session };
++    const resourceStatus = { session: readyResourceStatus() };
++
++    if (isResourceSupported(this.resourceSupport, "dashboard")) {
++      data.dashboard = await this.request("dashboard", { force });
++      resourceStatus.dashboard = readyResourceStatus();
++    } else {
++      data.dashboard = unsupportedReadModel("dashboard");
++      resourceStatus.dashboard = unsupportedResourceStatus();
++    }
++
++    const optional = SHELL_OPTIONAL_RESOURCES.map(async (key) => {
++      if (!isResourceSupported(this.resourceSupport, key)) {
++        return { key, supported: false, value: unsupportedReadModel(key) };
++      }
++      try {
++        return { key, supported: true, value: await this.request(key, { force }) };
++      } catch (error) {
++        return { key, supported: true, error };
++      }
++    });
++
++    for (const result of await Promise.all(optional)) {
++      if (!result.supported) {
++        data[result.key] = result.value;
++        resourceStatus[result.key] = unsupportedResourceStatus();
++      } else if (result.error) {
++        data[result.key] = unsupportedReadModel(result.key);
++        resourceStatus[result.key] = unavailableResourceStatus(result.error);
++      } else {
++        data[result.key] = result.value;
++        resourceStatus[result.key] = readyResourceStatus();
++      }
++    }
++
++    data.capabilities = resolveCapabilities({ config: this.config, session, dashboard: data.dashboard });
++    data.resourceStatus = Object.freeze(resourceStatus);
++    return data;
++  }
++
++  async loadResources(keys, { force = false } = {}) {
++    const uniqueKeys = [...new Set(keys)];
++    const supportedKeys = uniqueKeys.filter((key) => isResourceSupported(this.resourceSupport, key));
++    const settled = await Promise.allSettled(supportedKeys.map((key) => this.request(key, { force })));
++    const data = {};
++    const errors = {};
++    const resourceStatus = {};
++
++    uniqueKeys.forEach((key) => {
++      if (isResourceSupported(this.resourceSupport, key)) return;
++      data[key] = unsupportedReadModel(key);
++      resourceStatus[key] = unsupportedResourceStatus();
++    });
++
++    settled.forEach((result, index) => {
++      const key = supportedKeys[index];
++      if (result.status === "fulfilled") {
++        data[key] = result.value;
++        resourceStatus[key] = readyResourceStatus();
++      } else {
++        const error = normalizeApiError(result.reason, { endpointKey: key });
++        errors[key] = error;
++        resourceStatus[key] = unavailableResourceStatus(error);
++      }
++    });
++    data.resourceStatus = Object.freeze(resourceStatus);
++    return { data, errors, resourceStatus: data.resourceStatus };
++  }
++
++  async loadRoute(route, { force = false } = {}) {
++    const plan = resourcesForRoute(route);
++    const keys = [...plan.required, ...plan.optional];
++    const result = await this.loadResources(keys, { force });
++    const sessionError = Object.values(result.errors).find((error) => Number(error?.status) === 401);
++    if (sessionError) throw sessionError;
++    const missingRequired = plan.required.find((key) => result.errors[key]);
++    if (missingRequired) {
++      throw new ApiRequestError("This section could not be loaded. Other terminal sections remain available.", {
++        code: "ROUTE_DATA_UNAVAILABLE",
++        endpointKey: missingRequired,
++        cause: result.errors[missingRequired]
++      });
++    }
++    return result;
++  }
++
++  invalidateResources(keys) {
++    const targets = new Set(keys);
++    for (const key of this.readCache.keys()) {
++      const endpointKey = key.split(":")[1];
++      if (!targets.has(endpointKey)) continue;
++      this.readCache.delete(key);
++      this.readCacheUpdatedAt.delete(key);
++    }
++  }
++
++  refreshResources(keys) {
++    this.invalidateResources(keys);
++    return this.loadResources(keys, { force: true });
++  }
++
++  execute(endpointKey, payload, params = {}, { signal = null } = {}) {
++    const { endpoint, path } = resolvedPath(endpointKey, params);
++    if (endpoint.method === "GET") {
++      throw new ApiRequestError("A read endpoint cannot be submitted as an action.", { code: "INVALID_REQUEST", endpointKey, path });
++    }
++
++    const writeKey = stableOperationKey({ endpointKey, method: endpoint.method, path, payload });
++    if (this.inFlightWrites.has(writeKey)) return this.inFlightWrites.get(writeKey);
++    const completedAt = this.writeCompletedAt.get(writeKey) || 0;
++    if (Date.now() - completedAt < this.config.writeCooldownMs) {
++      return Promise.reject(new ApiRequestError("That action was just submitted. Wait a moment before trying again.", {
++        code: "ACTION_COOLDOWN",
++        endpointKey,
++        path
++      }));
++    }
++
++    const requestId = createRequestId();
++    const idempotencyKey = IDEMPOTENT_WRITE_ENDPOINTS.has(endpointKey)
++      ? this.retryIdempotencyKeys.get(writeKey) || createIdempotencyKey(endpointKey)
++      : "";
++    const mergedSignal = mergeAbortSignals(signal, this.sessionController.signal);
++    const context = { endpointKey, method: endpoint.method, path, payload, requestId, idempotencyKey, signal: mergedSignal.signal };
++    const invalidatedResources = WRITE_INVALIDATIONS[endpointKey] || [];
++    const sessionVersion = this.sessionVersion;
++
++    const operation = this.transport.request(context)
++      .then((raw) => normalizeApiResponse(endpointKey, raw, { config: this.config, path, requestId }))
++      .then((result) => {
++        if (sessionVersion !== this.sessionVersion) {
++          throw new ApiRequestError("The request was cancelled.", { code: "REQUEST_ABORTED", endpointKey, path, requestId });
++        }
++        this.retryIdempotencyKeys.delete(writeKey);
++        this.writeCompletedAt.set(writeKey, Date.now());
++        this.invalidateResources(invalidatedResources);
++        return { result, invalidatedResources: [...invalidatedResources], requestId, idempotencyKey };
++      })
++      .catch((error) => {
++        const normalized = normalizeApiError(error, context);
++        if (sessionVersion === this.sessionVersion && idempotencyKey) {
++          if (shouldReuseIdempotencyKey(normalized)) this.retryIdempotencyKeys.set(writeKey, idempotencyKey);
++          else this.retryIdempotencyKeys.delete(writeKey);
++        }
++        throw normalized;
++      })
++      .finally(() => {
++        mergedSignal.cleanup();
++        if (this.inFlightWrites.get(writeKey) === operation) this.inFlightWrites.delete(writeKey);
++      });
++
++    this.inFlightWrites.set(writeKey, operation);
++    return operation;
++=======
+ function mergeAbortSignals(...signals) {
+   const activeSignals = signals.filter((signal) => signal && typeof signal.addEventListener === "function");
+   if (!activeSignals.length) return { signal: null, cleanup: () => {} };
+   if (activeSignals.length === 1) return { signal: activeSignals[0], cleanup: () => {} };
+ 
+   const controller = new AbortController();
+   const abort = () => controller.abort();
+   for (const signal of activeSignals) {
+     if (signal.aborted) {
+       controller.abort();
+       break;
+     }
+     signal.addEventListener("abort", abort, { once: true });
+   }
+   return {
+     signal: controller.signal,
+     cleanup: () => activeSignals.forEach((signal) => signal.removeEventListener("abort", abort))
+   };
+ }
+ 
+ function shouldReuseIdempotencyKey(error) {
+   const status = Number(error?.status || 0);
+   return ["NETWORK_ERROR", "OFFLINE", "REQUEST_TIMEOUT"].includes(error?.code) || status >= 500;
+ }
+ 
+ function readyResourceStatus() {
+   return Object.freeze({ state: "ready", status: 200, code: "", retryAfterMs: 0 });
+ }
+ 
+ function unavailableResourceStatus(error) {
+   const normalized = normalizeApiError(error);
+   return Object.freeze({
+     state: "unavailable",
+     status: Number(normalized.status || 0),
+     code: String(normalized.code || "REQUEST_FAILED"),
+     retryAfterMs: Number(normalized.retryAfterMs || 0)
+   });
+ }
+ 
+ function unsupportedResourceStatus() {
+   return Object.freeze({
+     state: "unavailable",
+     status: 0,
+     code: "CAPABILITY_UNAVAILABLE",
+     retryAfterMs: 0
+   });
+ }
+ 
+ export class PlayerApi {
+   constructor(config) {
+     this.config = config;
+     this.transport = config.usePreviewData
+       ? new PreviewTransport({ simulateWrites: config.simulatePreviewWrites })
+       : config.apiCall || config.adapter
+         ? new AdapterTransport(config.apiCall || config.adapter, config)
+         : new HttpTransport(config);
+     this.readCache = new Map();
+     this.readCacheUpdatedAt = new Map();
+     this.inFlightReads = new Map();
+     this.inFlightWrites = new Map();
+     this.writeCompletedAt = new Map();
+     this.retryIdempotencyKeys = new Map();
+     this.sessionVersion = 0;
+     this.sessionFingerprint = sessionFingerprint(config);
+     this.sessionController = new AbortController();
+     this.resourceSupport = createResourceSupport({ preview: config.usePreviewData === true });
+   }
+ 
+   setSession(session) {
+     if (!session || typeof session !== "object") return;
+     if (session.authenticated === true) this.config.authenticated = true;
+     if (session.csrfToken) this.config.csrfToken = session.csrfToken;
+     if (session.expiresAt) this.config.sessionExpiresAt = session.expiresAt;
+     if (session.gameSessionId) this.config.gameSessionId = session.gameSessionId;
+     delete this.config.playerSessionToken;
+     delete this.config.playerSessionId;
+     delete this.config.accessToken;
+     const nextFingerprint = sessionFingerprint(this.config);
+     if (nextFingerprint !== this.sessionFingerprint) {
+       this.sessionController.abort();
+       this.sessionController = new AbortController();
+       this.sessionFingerprint = nextFingerprint;
+       this.sessionVersion += 1;
+       this.readCache.clear();
+       this.readCacheUpdatedAt.clear();
+       this.inFlightReads.clear();
+       this.inFlightWrites.clear();
+       this.writeCompletedAt.clear();
+       this.retryIdempotencyKeys.clear();
+       this.resourceSupport = createResourceSupport({ preview: this.config.usePreviewData === true });
+       clearAllResourceInvalidations();
+     }
+   }
+ 
+   isCachedReadFresh(endpointKey, key, now = Date.now()) {
+     if (isResourceInvalidated(endpointKey)) return false;
+     if (!this.readCache.has(key)) return false;
+     const updatedAt = Number(this.readCacheUpdatedAt.get(key) || 0);
+     const freshnessMs = resourceFreshnessMs(endpointKey, this.config.resourceFreshnessMs);
+     return freshnessMs > 0 && updatedAt > 0 && now - updatedAt <= freshnessMs;
+   }
+ 
+   async request(endpointKey, { params = {}, payload, force = false, signal = null } = {}) {
+     const { endpoint, path } = resolvedPath(endpointKey, params);
+     const requestId = createRequestId();
+     const mergedSignal = mergeAbortSignals(signal, this.sessionController.signal);
+     const context = { endpointKey, method: endpoint.method, path, payload, requestId, signal: mergedSignal.signal };
+     const key = stableRequestKey(context);
+     const sessionVersion = this.sessionVersion;
+ 
+     if (endpoint.method === "GET" && !force && this.isCachedReadFresh(endpointKey, key)) return this.readCache.get(key);
+     if (endpoint.method === "GET" && this.inFlightReads.has(key)) return this.inFlightReads.get(key);
+ 
+     const operation = this.transport.request(context)
+       .then((raw) => normalizeApiResponse(endpointKey, raw, { config: this.config, path, requestId }))
+       .then((value) => {
+         if (sessionVersion !== this.sessionVersion) {
+           throw new ApiRequestError("The request was cancelled.", { code: "REQUEST_ABORTED", endpointKey, path, requestId });
+         }
+         if (endpoint.method === "GET") {
+           this.readCache.set(key, value);
+           this.readCacheUpdatedAt.set(key, Date.now());
+           clearResourceInvalidation(endpointKey);
+         }
+         return value;
+       })
+       .catch((error) => { throw normalizeApiError(error, context); })
+       .finally(() => {
+         mergedSignal.cleanup();
+         if (endpoint.method === "GET" && this.inFlightReads.get(key) === operation) this.inFlightReads.delete(key);
+       });
+ 
+     if (endpoint.method === "GET") this.inFlightReads.set(key, operation);
+     return operation;
+   }
+ 
+   async bootstrap({ force = false } = {}) {
+     const session = await this.request("session", { force });
+     this.resourceSupport = createResourceSupport({
+       preview: this.config.usePreviewData === true,
+       session
+     });
+ 
+     const data = { session };
+     const resourceStatus = { session: readyResourceStatus() };
+ 
+     if (isResourceSupported(this.resourceSupport, "dashboard")) {
+       data.dashboard = await this.request("dashboard", { force });
+       resourceStatus.dashboard = readyResourceStatus();
+     } else {
+       data.dashboard = unsupportedReadModel("dashboard");
+       resourceStatus.dashboard = unsupportedResourceStatus();
+     }
+ 
+     const optional = SHELL_OPTIONAL_RESOURCES.map(async (key) => {
+       if (!isResourceSupported(this.resourceSupport, key)) {
+         return { key, supported: false, value: unsupportedReadModel(key) };
+       }
+       try {
+         return { key, supported: true, value: await this.request(key, { force }) };
+       } catch (error) {
+         return { key, supported: true, error };
+       }
+     });
+ 
+     for (const result of await Promise.all(optional)) {
+       if (!result.supported) {
+         data[result.key] = result.value;
+         resourceStatus[result.key] = unsupportedResourceStatus();
+       } else if (result.error) {
+         data[result.key] = unsupportedReadModel(result.key);
+         resourceStatus[result.key] = unavailableResourceStatus(result.error);
+       } else {
+         data[result.key] = result.value;
+         resourceStatus[result.key] = readyResourceStatus();
+       }
+     }
+ 
+     data.capabilities = resolveCapabilities({ config: this.config, session, dashboard: data.dashboard });
+     data.resourceStatus = Object.freeze(resourceStatus);
+     return data;
+   }
+ 
+   async loadResources(keys, { force = false } = {}) {
+     const uniqueKeys = [...new Set(keys)];
+     const supportedKeys = uniqueKeys.filter((key) => isResourceSupported(this.resourceSupport, key));
+     const settled = await Promise.allSettled(supportedKeys.map((key) => this.request(key, { force })));
+     const data = {};
+     const errors = {};
+     const resourceStatus = {};
+ 
+     uniqueKeys.forEach((key) => {
+       if (isResourceSupported(this.resourceSupport, key)) return;
+       data[key] = unsupportedReadModel(key);
+       resourceStatus[key] = unsupportedResourceStatus();
+     });
+ 
+     settled.forEach((result, index) => {
+       const key = supportedKeys[index];
+       if (result.status === "fulfilled") {
+         data[key] = result.value;
+         resourceStatus[key] = readyResourceStatus();
+       } else {
+         const error = normalizeApiError(result.reason, { endpointKey: key });
+         errors[key] = error;
+         resourceStatus[key] = unavailableResourceStatus(error);
+       }
+     });
+     data.resourceStatus = Object.freeze(resourceStatus);
+     return { data, errors, resourceStatus: data.resourceStatus };
+   }
+ 
+   async loadRoute(route, { force = false } = {}) {
+     const plan = resourcesForRoute(route);
+     const keys = [...plan.required, ...plan.optional];
+     const result = await this.loadResources(keys, { force });
+     const sessionError = Object.values(result.errors).find((error) => Number(error?.status) === 401);
+     if (sessionError) throw sessionError;
+     const missingRequired = plan.required.find((key) => result.errors[key]);
+     if (missingRequired) {
+       throw new ApiRequestError("This section could not be loaded. Other terminal sections remain available.", {
+         code: "ROUTE_DATA_UNAVAILABLE",
+         endpointKey: missingRequired,
+         cause: result.errors[missingRequired]
+       });
+     }
+     return result;
+   }
+ 
+   invalidateResources(keys) {
+     const targets = new Set(keys);
+     for (const key of this.readCache.keys()) {
+       const endpointKey = key.split(":")[1];
+       if (!targets.has(endpointKey)) continue;
+       this.readCache.delete(key);
+       this.readCacheUpdatedAt.delete(key);
+     }
+   }
+ 
+   refreshResources(keys) {
+     this.invalidateResources(keys);
+     return this.loadResources(keys, { force: true });
+   }
+ 
+   execute(endpointKey, payload, params = {}, { signal = null } = {}) {
+     const { endpoint, path } = resolvedPath(endpointKey, params);
+     if (endpoint.method === "GET") {
+       throw new ApiRequestError("A read endpoint cannot be submitted as an action.", { code: "INVALID_REQUEST", endpointKey, path });
+     }
+ 
+     const writeKey = stableOperationKey({ endpointKey, method: endpoint.method, path, payload });
+     if (this.inFlightWrites.has(writeKey)) return this.inFlightWrites.get(writeKey);
+     const completedAt = this.writeCompletedAt.get(writeKey) || 0;
+     if (Date.now() - completedAt < this.config.writeCooldownMs) {
+       return Promise.reject(new ApiRequestError("That action was just submitted. Wait a moment before trying again.", {
+         code: "ACTION_COOLDOWN",
+         endpointKey,
+         path
+       }));
+     }
+ 
+     const requestId = createRequestId();
+     const idempotencyKey = IDEMPOTENT_WRITE_ENDPOINTS.has(endpointKey)
+       ? this.retryIdempotencyKeys.get(writeKey) || createIdempotencyKey(endpointKey)
+       : "";
+     const mergedSignal = mergeAbortSignals(signal, this.sessionController.signal);
+     const context = { endpointKey, method: endpoint.method, path, payload, requestId, idempotencyKey, signal: mergedSignal.signal };
+     const invalidatedResources = WRITE_INVALIDATIONS[endpointKey] || [];
+     const sessionVersion = this.sessionVersion;
+ 
+     const operation = this.transport.request(context)
+       .then((raw) => normalizeApiResponse(endpointKey, raw, { config: this.config, path, requestId }))
+       .then((result) => {
+         if (sessionVersion !== this.sessionVersion) {
+           throw new ApiRequestError("The request was cancelled.", { code: "REQUEST_ABORTED", endpointKey, path, requestId });
+         }
+         this.retryIdempotencyKeys.delete(writeKey);
+         this.writeCompletedAt.set(writeKey, Date.now());
+         this.invalidateResources(invalidatedResources);
+         return { result, invalidatedResources: [...invalidatedResources], requestId, idempotencyKey };
+       })
+       .catch((error) => {
+         const normalized = normalizeApiError(error, context);
+         if (sessionVersion === this.sessionVersion && idempotencyKey) {
+           if (shouldReuseIdempotencyKey(normalized)) this.retryIdempotencyKeys.set(writeKey, idempotencyKey);
+           else this.retryIdempotencyKeys.delete(writeKey);
+         }
+         throw normalized;
+       })
+       .finally(() => {
+         mergedSignal.cleanup();
+         if (this.inFlightWrites.get(writeKey) === operation) this.inFlightWrites.delete(writeKey);
+       });
+ 
+     this.inFlightWrites.set(writeKey, operation);
+     return operation;
++>>>>>>> origin/main
    }
  }
```

## player-terminal/tests/messaging-connected-lifecycle.mjs
```diff
diff --cc player-terminal/tests/messaging-connected-lifecycle.mjs
index bbb8fbcd,9645b6f6..00000000
--- a/player-terminal/tests/messaging-connected-lifecycle.mjs
+++ b/player-terminal/tests/messaging-connected-lifecycle.mjs
@@@ -5,9 -5,11 +5,12 @@@ import { normalizeWritePayload } from "
  import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";
  import { renderMessagesPage } from "../src/pages/messages-page.js";
  
+ const CSRF_TOKEN = "C".repeat(43);
+ const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
+ const PUBLISHABLE_KEY = "sb_publishable_messaging_fixture";
  const THREAD = `thr_${"a".repeat(32)}`;
  const MESSAGE = `msg_${"b".repeat(32)}`;
 +const REPLY = `msg_${"c".repeat(32)}`;
  const requests = [];
  const apiCall = createStudentProfileApiCall({
    request: async (request) => {
@@@ -144,4 -124,4 +155,10 @@@ assert.match(html, /&lt;SCRIPT&gt;Trade
  assert.match(html, /&lt;IMG src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  
++<<<<<<< HEAD
 +console.log("Connected Messaging lifecycle, route-parameter propagation, and committed-success boundary passed.");
++||||||| ebd6f080
++console.log("Connected Messaging lifecycle and committed-success boundary passed.");
++=======
+ console.log("Connected Messaging cookie-session lifecycle and committed-success boundary passed.");
++>>>>>>> origin/main
```

## scripts/admin-messaging-moderation-contract.mjs
```diff
diff --cc scripts/admin-messaging-moderation-contract.mjs
index 116c5333,42bba1a1..00000000
--- a/scripts/admin-messaging-moderation-contract.mjs
+++ b/scripts/admin-messaging-moderation-contract.mjs
@@@ -91,4 -101,4 +103,10 @@@ assert.match(capabilityManifest, /messa
  assert.match(capabilityManifest, /messageSend/);
  assert.match(capabilityManifest, /messageRead/);
  
++<<<<<<< HEAD
 +console.log("Admin and Player Messaging source, automatic read-on-open, privacy, capability, hardened bootstrap, and attachment-disablement contracts passed.");
++||||||| ebd6f080
++console.log("Admin and Player Messaging source, privacy, capability, hardened bootstrap, and attachment-disablement contracts passed.");
++=======
+ console.log("Admin and Player Messaging source, privacy, capability, secure BFF, hardened bootstrap, and attachment-disablement contracts passed.");
++>>>>>>> origin/main
```

## scripts/admin-mounted-modal-focus-reconciled-smoke.mjs
```diff
diff --cc scripts/admin-mounted-modal-focus-reconciled-smoke.mjs
index 73e56545,d3fd9da6..00000000
--- a/scripts/admin-mounted-modal-focus-reconciled-smoke.mjs
+++ b/scripts/admin-mounted-modal-focus-reconciled-smoke.mjs
@@@ -1,150 -1,2 +1,280 @@@
++<<<<<<< HEAD
 +import { spawnSync } from "node:child_process";
 +import { readFileSync, rmSync, writeFileSync } from "node:fs";
 +import { basename, dirname, join } from "node:path";
 +import { fileURLToPath } from "node:url";
 +
 +const scriptDirectory = dirname(fileURLToPath(import.meta.url));
 +const sourcePath = join(scriptDirectory, "admin-mounted-modal-focus-smoke.mjs");
 +const modalSourcePath = join(
 +  scriptDirectory,
 +  "admin-modal-drawer-accessibility-smoke.mjs",
 +);
 +const runtimePath = join(
 +  scriptDirectory,
 +  `.admin-mounted-modal-focus-reconciled-${process.pid}.mjs`,
 +);
 +const modalRuntimePath = join(
 +  scriptDirectory,
 +  `.admin-modal-drawer-accessibility-reconciled-${process.pid}.mjs`,
 +);
 +
 +const source = readFileSync(sourcePath, "utf8");
 +const modalSource = readFileSync(modalSourcePath, "utf8");
 +const deterministicModalSource = modalSource.replace(
 +  `  await page.waitForTimeout(100);\n  assert(await opener.evaluate((node) => document.activeElement === node), \`${"${label}"} did not restore focus to its opener.\`);`,
 +  `  const openerHandle = await opener.elementHandle();\n  assert(openerHandle, \`${"${label}"} opener detached before focus restoration.\`);\n  await page.waitForFunction((node) => document.activeElement === node, openerHandle, { timeout: 5000 });\n  assert(await opener.evaluate((node) => document.activeElement === node), \`${"${label}"} did not restore focus to its opener.\`);`,
 +);
 +if (deterministicModalSource === modalSource) {
 +  throw new Error("Mounted modal focus restoration fixture contract changed.");
 +}
 +
 +const redirectedSource = source.replace(
 +  "./admin-modal-drawer-accessibility-smoke.mjs",
 +  `./${basename(modalRuntimePath)}`,
 +);
 +if (redirectedSource === source) {
 +  throw new Error("Mounted modal inherited fixture path changed.");
 +}
 +
 +const reconciledFocusTrap = `const stabilizedFocusTrap = String.raw\`async function assertFocusTrap(page, container, label) {
 +  await container.evaluate(async (root, currentLabel) => {
 +    for (let attempt = 0; attempt < 30; attempt += 1) {
 +      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
 +      if (controller?.dialog === root) return;
 +      await new Promise((resolve) => requestAnimationFrame(resolve));
 +    }
 +    throw new Error(currentLabel + " did not become the active modal controller.");
 +  }, label);
 +
 +  const activeInside = await container.evaluate((root) => root.contains(document.activeElement));
 +  assert(activeInside, label + " did not move initial focus inside the surface.");
 +  const boundary = await markBoundary(page, container, label);
 +
 +  async function traceBoundary(edge) {
 +    await container.evaluate((root, expectedEdge) => {
 +      const target = root.querySelector('[data-admin-a11y-boundary="' + expectedEdge + '"]');
 +      const datasetKey = expectedEdge === "first"
 +        ? "adminForwardBoundaryReached"
 +        : "adminReverseBoundaryReached";
 +      root.dataset[datasetKey] = "false";
 +      const onFocus = (event) => {
 +        if (event.target !== target) return;
 +        root.dataset[datasetKey] = "true";
 +        root.removeEventListener("focusin", onFocus, true);
 +      };
 +      root.addEventListener("focusin", onFocus, true);
 +    }, edge);
 +  }
 +
 +  if (label === "Attendance scanner modal") {
 +    await boundary.first.focus();
 +    await page.keyboard.press("Shift+Tab");
 +    await page.waitForTimeout(150);
 +    const reverseContained = await container.evaluate((root) => root.contains(document.activeElement));
 +    assert(reverseContained, label + " allowed Shift+Tab to escape while scanner auto-refocus was active.");
 +
 +    await boundary.last.focus();
 +    await page.keyboard.press("Tab");
 +    await page.waitForTimeout(150);
 +    const forwardContained = await container.evaluate((root) => root.contains(document.activeElement));
 +    assert(forwardContained, label + " allowed Tab to escape while scanner auto-refocus was active.");
 +  } else {
 +    await boundary.first.focus();
 +    await traceBoundary("last");
 +    await page.keyboard.press("Shift+Tab");
 +    const reverseWrapped = await container.evaluate((root) => {
 +      const target = root.querySelector('[data-admin-a11y-boundary="last"]');
 +      return document.activeElement === target || root.dataset.adminReverseBoundaryReached === "true";
 +    });
 +    assert(reverseWrapped, label + " did not wrap Shift+Tab from first to last.");
 +
 +    await boundary.last.focus();
 +    await traceBoundary("first");
 +    await page.keyboard.press("Tab");
 +    const forwardWrapped = await container.evaluate((root) => {
 +      const target = root.querySelector('[data-admin-a11y-boundary="first"]');
 +      return document.activeElement === target || root.dataset.adminForwardBoundaryReached === "true";
 +    });
 +    assert(forwardWrapped, label + " did not wrap Tab from last to first.");
 +  }
 +  return boundary.count;
 +}\`;`;
 +
 +const reconciledSource = redirectedSource.replace(
 +  /const stabilizedFocusTrap = String[.]raw`async function assertFocusTrap\(page, container, label\) \{[\s\S]*?return boundary[.]count;\n\}`;/,
 +  reconciledFocusTrap,
 +);
 +if (reconciledSource === redirectedSource) {
 +  throw new Error("Mounted modal focus reconciliation contract changed.");
 +}
 +
 +const controllerOwnershipNeedle = `async function controllerDialogForSurface(page, surface, markerName, label) {
 +  await surface.waitFor({ state: "visible", timeout: 5000 });
 +`;
 +const controllerOwnershipReplacement = `async function controllerDialogForSurface(page, surface, markerName, label) {
 +  await surface.waitFor({ state: "visible", timeout: 5000 });
 +  await surface.evaluate(async (root, currentLabel) => {
 +    for (let attempt = 0; attempt < 60; attempt += 1) {
 +      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
 +      const dialog = controller?.dialog;
 +      const related = dialog instanceof HTMLElement && (
 +        dialog === root || root.contains(dialog) || dialog.contains(root)
 +      );
 +      if (related) return;
 +      await new Promise((resolve) => requestAnimationFrame(resolve));
 +    }
 +    throw new Error(currentLabel + " did not become owned by the shared modal controller.");
 +  }, label);
 +`;
 +const controllerReconciledSource = reconciledSource.replace(
 +  controllerOwnershipNeedle,
 +  controllerOwnershipReplacement,
 +);
 +if (controllerReconciledSource === reconciledSource) {
 +  throw new Error("Mounted modal controller ownership fixture contract changed.");
 +}
 +
 +try {
 +  writeFileSync(modalRuntimePath, deterministicModalSource);
 +  writeFileSync(runtimePath, controllerReconciledSource);
 +  const result = spawnSync(process.execPath, [runtimePath], {
 +    cwd: process.cwd(),
 +    env: process.env,
 +    stdio: "inherit",
 +  });
 +  if (result.error) throw result.error;
 +  if (result.status !== 0) process.exitCode = result.status || 1;
 +} finally {
 +  rmSync(runtimePath, { force: true });
 +  rmSync(modalRuntimePath, { force: true });
 +}
++||||||| ebd6f080
++import { spawnSync } from "node:child_process";
++import { readFileSync, rmSync, writeFileSync } from "node:fs";
++import { basename, dirname, join } from "node:path";
++import { fileURLToPath } from "node:url";
++
++const scriptDirectory = dirname(fileURLToPath(import.meta.url));
++const sourcePath = join(scriptDirectory, "admin-mounted-modal-focus-smoke.mjs");
++const modalSourcePath = join(
++  scriptDirectory,
++  "admin-modal-drawer-accessibility-smoke.mjs",
++);
++const runtimePath = join(
++  scriptDirectory,
++  `.admin-mounted-modal-focus-reconciled-${process.pid}.mjs`,
++);
++const modalRuntimePath = join(
++  scriptDirectory,
++  `.admin-modal-drawer-accessibility-reconciled-${process.pid}.mjs`,
++);
++
++const source = readFileSync(sourcePath, "utf8");
++const modalSource = readFileSync(modalSourcePath, "utf8");
++const deterministicModalSource = modalSource.replace(
++  `  await page.waitForTimeout(100);\n  assert(await opener.evaluate((node) => document.activeElement === node), \`${"${label}"} did not restore focus to its opener.\`);`,
++  `  const openerHandle = await opener.elementHandle();\n  assert(openerHandle, \`${"${label}"} opener detached before focus restoration.\`);\n  await page.waitForFunction((node) => document.activeElement === node, openerHandle, { timeout: 5000 });\n  assert(await opener.evaluate((node) => document.activeElement === node), \`${"${label}"} did not restore focus to its opener.\`);`,
++);
++if (deterministicModalSource === modalSource) {
++  throw new Error("Mounted modal focus restoration fixture contract changed.");
++}
++
++const redirectedSource = source.replace(
++  "./admin-modal-drawer-accessibility-smoke.mjs",
++  `./${basename(modalRuntimePath)}`,
++);
++if (redirectedSource === source) {
++  throw new Error("Mounted modal inherited fixture path changed.");
++}
++
++const reconciledFocusTrap = `const stabilizedFocusTrap = String.raw\`async function assertFocusTrap(page, container, label) {
++  await container.evaluate(async (root, currentLabel) => {
++    for (let attempt = 0; attempt < 30; attempt += 1) {
++      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
++      if (controller?.dialog === root) return;
++      await new Promise((resolve) => requestAnimationFrame(resolve));
++    }
++    throw new Error(currentLabel + " did not become the active modal controller.");
++  }, label);
++
++  const activeInside = await container.evaluate((root) => root.contains(document.activeElement));
++  assert(activeInside, label + " did not move initial focus inside the surface.");
++  const boundary = await markBoundary(page, container, label);
++
++  async function traceBoundary(edge) {
++    await container.evaluate((root, expectedEdge) => {
++      const target = root.querySelector('[data-admin-a11y-boundary="' + expectedEdge + '"]');
++      const datasetKey = expectedEdge === "first"
++        ? "adminForwardBoundaryReached"
++        : "adminReverseBoundaryReached";
++      root.dataset[datasetKey] = "false";
++      const onFocus = (event) => {
++        if (event.target !== target) return;
++        root.dataset[datasetKey] = "true";
++        root.removeEventListener("focusin", onFocus, true);
++      };
++      root.addEventListener("focusin", onFocus, true);
++    }, edge);
++  }
++
++  if (label === "Attendance scanner modal") {
++    await boundary.first.focus();
++    await page.keyboard.press("Shift+Tab");
++    await page.waitForTimeout(150);
++    const reverseContained = await container.evaluate((root) => root.contains(document.activeElement));
++    assert(reverseContained, label + " allowed Shift+Tab to escape while scanner auto-refocus was active.");
++
++    await boundary.last.focus();
++    await page.keyboard.press("Tab");
++    await page.waitForTimeout(150);
++    const forwardContained = await container.evaluate((root) => root.contains(document.activeElement));
++    assert(forwardContained, label + " allowed Tab to escape while scanner auto-refocus was active.");
++  } else {
++    await boundary.first.focus();
++    await traceBoundary("last");
++    await page.keyboard.press("Shift+Tab");
++    const reverseWrapped = await container.evaluate((root) => {
++      const target = root.querySelector('[data-admin-a11y-boundary="last"]');
++      return document.activeElement === target || root.dataset.adminReverseBoundaryReached === "true";
++    });
++    assert(reverseWrapped, label + " did not wrap Shift+Tab from first to last.");
++
++    await boundary.last.focus();
++    await traceBoundary("first");
++    await page.keyboard.press("Tab");
++    const forwardWrapped = await container.evaluate((root) => {
++      const target = root.querySelector('[data-admin-a11y-boundary="first"]');
++      return document.activeElement === target || root.dataset.adminForwardBoundaryReached === "true";
++    });
++    assert(forwardWrapped, label + " did not wrap Tab from last to first.");
++  }
++  return boundary.count;
++}\`;`;
++
++const reconciledSource = redirectedSource.replace(
++  /const stabilizedFocusTrap = String[.]raw`async function assertFocusTrap\(page, container, label\) \{[\s\S]*?return boundary[.]count;\n\}`;/,
++  reconciledFocusTrap,
++);
++if (reconciledSource === redirectedSource) {
++  throw new Error("Mounted modal focus reconciliation contract changed.");
++}
++
++try {
++  writeFileSync(modalRuntimePath, deterministicModalSource);
++  writeFileSync(runtimePath, reconciledSource);
++  const result = spawnSync(process.execPath, [runtimePath], {
++    cwd: process.cwd(),
++    env: process.env,
++    stdio: "inherit",
++  });
++  if (result.error) throw result.error;
++  if (result.status !== 0) process.exitCode = result.status || 1;
++} finally {
++  rmSync(runtimePath, { force: true });
++  rmSync(modalRuntimePath, { force: true });
++}
++=======
+ import "./admin-mounted-operational-modal-focus-smoke.mjs";
+ import "./admin-terminal-permission-source-diagnostic.mjs";
++>>>>>>> origin/main
```

## scripts/admin-mounted-operational-modal-focus-smoke.mjs
```diff
diff --cc scripts/admin-mounted-operational-modal-focus-smoke.mjs
index aeee2edc,b5b281d5..00000000
--- a/scripts/admin-mounted-operational-modal-focus-smoke.mjs
+++ b/scripts/admin-mounted-operational-modal-focus-smoke.mjs
@@@ -1,11 -1,11 +1,24 @@@
- import { chromium } from "playwright";
  import { mkdirSync, writeFileSync } from "node:fs";
+ import {
+   BASE_URL,
+   createQualityHarness,
+ } from "./admin-quality-smoke-fixture.mjs";
  
++<<<<<<< HEAD
 +const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
 +const OUT = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/mounted-modal-focus";
 +const GAME_ID = "00000000-0000-4000-8000-000000000001";
 +const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
 +const BOUNDARY_FOCUS_TIMEOUT_MS = 5000;
++||||||| ebd6f080
++const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
++const OUT = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/mounted-modal-focus";
++const GAME_ID = "00000000-0000-4000-8000-000000000001";
++const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
++=======
+ const OUT = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
+   "admin-browser-smoke-artifacts/mounted-modal-focus";
++>>>>>>> origin/main
  const SURFACES = [
    ["add-player", "Overview", "Enter"],
    ["add-contract", "Overview", "Space"],
```

## scripts/econovaria-local-gateway.py
```diff
diff --cc scripts/econovaria-local-gateway.py
index 45b0d090,ffc37f92..00000000
--- a/scripts/econovaria-local-gateway.py
+++ b/scripts/econovaria-local-gateway.py
@@@ -1,175 -1,126 +1,376 @@@
  #!/usr/bin/env python3
++<<<<<<< HEAD
 +"""Run the repository local/staging gateway with bounded secure defaults.
 +
 +Cold local Supabase stacks can require more than 30 seconds to atomically create,
 +provision, verify, and activate a new multiplayer game. The underlying gateway is
 +kept as the single routing/configuration implementation; this launcher raises its
 +upstream socket timeout to the bounded value configured by
 +ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS (default: 180 seconds).
 +
 +The launcher also strips browser-supplied forwarding headers and writes one
 +loopback-only ``x-real-ip`` value before proxying requests. Local Edge Functions
 +therefore receive the same proxy-overwritten client-IP contract required by the
 +fail-closed rate limiter. The server binds only to 127.0.0.1, so the authoritative
 +client for this development gateway is always the loopback host.
 +
 +Loopback-only idempotent reads receive one bounded retry after an upstream
 +500/502/503. This recovers a Supabase CLI Edge worker that retires after its local
 +CPU soft limit without retrying writes or masking a persistent application error.
 +"""
++||||||| ebd6f080
++"""Run the repository local/staging gateway with bounded secure defaults.
++
++Cold local Supabase stacks can require more than 30 seconds to atomically create,
++provision, verify, and activate a new multiplayer game. The underlying gateway is
++kept as the single routing/configuration implementation; this launcher raises its
++upstream socket timeout to the bounded value configured by
++ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS (default: 180 seconds).
++
++The launcher also strips browser-supplied forwarding headers and writes one
++loopback-only ``x-real-ip`` value before proxying requests. Local Edge Functions
++therefore receive the same proxy-overwritten client-IP contract required by the
++fail-closed rate limiter. The server binds only to 127.0.0.1, so the authoritative
++client for this development gateway is always the loopback host.
++"""
++=======
+ """Exact-checked Player web-session extension for the local Econovaria gateway."""
++>>>>>>> origin/main
  
  from __future__ import annotations
  
- import importlib.util
- import os
  from pathlib import Path
- from types import ModuleType
  
++<<<<<<< HEAD
 +DEFAULT_REQUEST_TIMEOUT_SECONDS = 180.0
 +MINIMUM_REQUEST_TIMEOUT_SECONDS = 30.0
 +MAXIMUM_REQUEST_TIMEOUT_SECONDS = 300.0
 +LOCAL_TRUSTED_CLIENT_IP_HEADER = "x-real-ip"
 +LOCAL_TRUSTED_CLIENT_IP = "127.0.0.1"
 +LOCAL_UPSTREAM_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
 +LOCAL_RETRYABLE_METHODS = frozenset({"GET", "HEAD"})
 +LOCAL_RETRYABLE_STATUSES = frozenset({500, 502, 503})
 +FORWARDED_IP_HEADERS = (
 +    "cf-connecting-ip",
 +    "x-real-ip",
 +    "x-forwarded-for",
 +    "client-ip",
 +    "forwarded",
 +    "true-client-ip",
 +    "x-client-ip",
- )
++||||||| ebd6f080
++DEFAULT_REQUEST_TIMEOUT_SECONDS = 180.0
++MINIMUM_REQUEST_TIMEOUT_SECONDS = 30.0
++MAXIMUM_REQUEST_TIMEOUT_SECONDS = 300.0
++LOCAL_TRUSTED_CLIENT_IP_HEADER = "x-real-ip"
++LOCAL_TRUSTED_CLIENT_IP = "127.0.0.1"
++FORWARDED_IP_HEADERS = (
++    "cf-connecting-ip",
++    "x-real-ip",
++    "x-forwarded-for",
++    "client-ip",
++    "forwarded",
++    "true-client-ip",
++    "x-client-ip",
++=======
+ CORE_PATH = Path(__file__).with_name("econovaria-local-gateway-core.py")
+ source = CORE_PATH.read_text(encoding="utf-8")
  
+ replacements = (
+     (
+         'WEB_SESSION_PREFIX: Final[str] = "/functions/v1/web-session-api"\n'
+         'LOCAL_SESSION_COOKIE: Final[str] = "econovaria_admin_session"\n'
+         'REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_admin_session"',
+         'WEB_SESSION_PREFIX: Final[str] = "/functions/v1/web-session-api"\n'
+         'PLAYER_WEB_SESSION_PREFIX: Final[str] = "/functions/v1/player-web-session-api"\n'
+         'LOCAL_SESSION_COOKIE: Final[str] = "econovaria_admin_session"\n'
+         'REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_admin_session"\n'
+         'PLAYER_LOCAL_SESSION_COOKIE: Final[str] = "econovaria_player_session"\n'
+         'PLAYER_REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_player_session"',
+         "session constants",
+     ),
+     (
+         'def is_web_session_path(path: str) -> bool:\n'
+         '    return clean_path(path).startswith(WEB_SESSION_PREFIX)',
+         'def is_admin_web_session_path(path: str) -> bool:\n'
+         '    return clean_path(path).startswith(WEB_SESSION_PREFIX)\n\n\n'
+         'def is_player_web_session_path(path: str) -> bool:\n'
+         '    return clean_path(path).startswith(PLAYER_WEB_SESSION_PREFIX)\n\n\n'
+         'def is_web_session_path(path: str) -> bool:\n'
+         '    return is_admin_web_session_path(path) or is_player_web_session_path(path)',
+         "session path classification",
+     ),
+     (
+         'def normalized_session_request_cookie(value: object) -> str | None:\n'
+         '    for segment in str(value).split(";"):\n'
+         '        name, separator, raw_value = segment.strip().partition("=")\n'
+         '        if not separator or name not in {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}:\n'
+         '            continue\n'
+         '        envelope = normalized_session_envelope(raw_value)\n'
+         '        if envelope:\n'
+         '            return f"{LOCAL_SESSION_COOKIE}={envelope}"\n'
+         '    return None',
+         'def normalized_session_request_cookie(\n'
+         '    value: object,\n'
+         '    request_path: str,\n'
+         ') -> str | None:\n'
+         '    if is_player_web_session_path(request_path):\n'
+         '        accepted_names = {PLAYER_LOCAL_SESSION_COOKIE, PLAYER_REMOTE_SESSION_COOKIE}\n'
+         '        local_name = PLAYER_LOCAL_SESSION_COOKIE\n'
+         '    elif is_admin_web_session_path(request_path):\n'
+         '        accepted_names = {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}\n'
+         '        local_name = LOCAL_SESSION_COOKIE\n'
+         '    else:\n'
+         '        return None\n'
+         '    for segment in str(value).split(";"):\n'
+         '        name, separator, raw_value = segment.strip().partition("=")\n'
+         '        if not separator or name not in accepted_names:\n'
+         '            continue\n'
+         '        envelope = normalized_session_envelope(raw_value)\n'
+         '        if envelope:\n'
+         '            return f"{local_name}={envelope}"\n'
+         '    return None',
+         "request cookie normalization",
+     ),
+     (
+         'def normalized_session_response_cookie(value: object) -> str | None:\n'
+         '    first, *_attributes = str(value).split(";")\n'
+         '    name, separator, raw_value = first.strip().partition("=")\n'
+         '    if not separator or name not in {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}:\n'
+         '        return None\n'
+         '    if raw_value == "":\n'
+         '        return f"{LOCAL_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"\n'
+         '    envelope = normalized_session_envelope(raw_value)\n'
+         '    if not envelope:\n'
+         '        return None\n'
+         '    return (\n'
+         '        f"{LOCAL_SESSION_COOKIE}={envelope}; Path=/; Max-Age=28800; "\n'
+         '        "HttpOnly; SameSite=Strict"\n'
+         '    )',
+         'def normalized_session_response_cookie(value: object) -> str | None:\n'
+         '    first, *_attributes = str(value).split(";")\n'
+         '    name, separator, raw_value = first.strip().partition("=")\n'
+         '    if not separator:\n'
+         '        return None\n'
+         '    if name in {PLAYER_LOCAL_SESSION_COOKIE, PLAYER_REMOTE_SESSION_COOKIE}:\n'
+         '        local_name = PLAYER_LOCAL_SESSION_COOKIE\n'
+         '        maximum_age = 14400\n'
+         '    elif name in {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}:\n'
+         '        local_name = LOCAL_SESSION_COOKIE\n'
+         '        maximum_age = 28800\n'
+         '    else:\n'
+         '        return None\n'
+         '    if raw_value == "":\n'
+         '        return f"{local_name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"\n'
+         '    envelope = normalized_session_envelope(raw_value)\n'
+         '    if not envelope:\n'
+         '        return None\n'
+         '    return (\n'
+         '        f"{local_name}={envelope}; Path=/; Max-Age={maximum_age}; "\n'
+         '        "HttpOnly; SameSite=Strict"\n'
+         '    )',
+         "response cookie normalization",
+     ),
+     (
+         'session_cookie = normalized_session_request_cookie(safe_value)',
+         'session_cookie = normalized_session_request_cookie(safe_value, request_path)',
+         "request cookie call",
+     ),
+     (
+         '    "x-player-session-token": "x-player-session-token",\n',
+         '',
+         "legacy Player token allowlist entry",
+     ),
++>>>>>>> origin/main
+ )
  
- def configured_timeout() -> float:
-     raw = os.environ.get(
-         "ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS",
-         str(DEFAULT_REQUEST_TIMEOUT_SECONDS),
-     )
-     try:
-         value = float(raw)
-     except ValueError as error:
-         raise SystemExit(
-             "ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS must be numeric"
-         ) from error
-     if not MINIMUM_REQUEST_TIMEOUT_SECONDS <= value <= MAXIMUM_REQUEST_TIMEOUT_SECONDS:
-         raise SystemExit(
-             "ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS must be between "
-             f"{int(MINIMUM_REQUEST_TIMEOUT_SECONDS)} and "
-             f"{int(MAXIMUM_REQUEST_TIMEOUT_SECONDS)} seconds"
+ for old, new, label in replacements:
+     occurrences = source.count(old)
+     if occurrences != 1:
+         raise RuntimeError(
+             f"Econovaria gateway adapter expected one {label}, found {occurrences}."
          )
-     return value
+     source = source.replace(old, new, 1)
  
++<<<<<<< HEAD
 +
 +def load_gateway() -> ModuleType:
 +    path = Path(__file__).with_name("local-staging-gateway.py")
 +    spec = importlib.util.spec_from_file_location("econovaria_local_staging_gateway", path)
 +    if spec is None or spec.loader is None:
 +        raise SystemExit(f"Could not load local gateway implementation: {path}")
 +    module = importlib.util.module_from_spec(spec)
 +    spec.loader.exec_module(module)
 +    return module
 +
 +
 +def install_timeout(module: ModuleType, timeout_seconds: float) -> None:
 +    base_http = module.http.client.HTTPConnection
 +    base_https = module.http.client.HTTPSConnection
 +
 +    def connection_class(base_connection):
 +        class BoundedRetryingConnection(base_connection):
 +            def __init__(self, *args, **kwargs):
 +                requested = kwargs.get("timeout")
 +                if requested is None or isinstance(requested, (int, float)):
 +                    kwargs["timeout"] = max(float(requested or 0), timeout_seconds)
 +                self._econovaria_request = None
 +                super().__init__(*args, **kwargs)
 +
 +            def request(
 +                self,
 +                method,
 +                url,
 +                body=None,
 +                headers=None,
 +                *,
 +                encode_chunked=False,
 +            ):
 +                request_headers = dict(headers or {})
 +                self._econovaria_request = (
 +                    str(method).upper(),
 +                    url,
 +                    body,
 +                    request_headers,
 +                    encode_chunked,
 +                )
 +                return super().request(
 +                    method,
 +                    url,
 +                    body=body,
 +                    headers=request_headers,
 +                    encode_chunked=encode_chunked,
 +                )
 +
 +            def getresponse(self):
 +                response = super().getresponse()
 +                request = self._econovaria_request
 +                if (
 +                    request is not None
 +                    and self.host in LOCAL_UPSTREAM_HOSTS
 +                    and request[0] in LOCAL_RETRYABLE_METHODS
 +                    and response.status in LOCAL_RETRYABLE_STATUSES
 +                ):
 +                    response.read()
 +                    method, url, body, headers, encode_chunked = request
 +                    super().request(
 +                        method,
 +                        url,
 +                        body=body,
 +                        headers=headers,
 +                        encode_chunked=encode_chunked,
 +                    )
 +                    return super().getresponse()
 +                return response
 +
 +        return BoundedRetryingConnection
 +
 +    module.http.client.HTTPConnection = connection_class(base_http)
 +    module.http.client.HTTPSConnection = connection_class(base_https)
 +
 +
 +def install_trusted_client_ip(module: ModuleType) -> None:
 +    base_filter = module.filtered_request_headers
 +
 +    def filtered_request_headers(headers, upstream_host: str) -> dict[str, str]:
 +        result = base_filter(headers, upstream_host)
 +        forwarded = {name.lower() for name in FORWARDED_IP_HEADERS}
 +        for name in list(result):
 +            if name.lower() in forwarded:
 +                del result[name]
 +        result[LOCAL_TRUSTED_CLIENT_IP_HEADER] = LOCAL_TRUSTED_CLIENT_IP
 +        return result
 +
 +    module.filtered_request_headers = filtered_request_headers
 +
 +
 +def main() -> int:
 +    timeout_seconds = configured_timeout()
 +    module = load_gateway()
 +    install_timeout(module, timeout_seconds)
 +    install_trusted_client_ip(module)
 +    print(
 +        "Econovaria gateway upstream request timeout: "
 +        f"{timeout_seconds:g} seconds",
 +        flush=True,
 +    )
 +    print(
 +        "Econovaria gateway trusted client IP: loopback proxy overwrite",
 +        flush=True,
 +    )
 +    return int(module.main())
 +
 +
 +if __name__ == "__main__":
 +    raise SystemExit(main())
++||||||| ebd6f080
++
++def load_gateway() -> ModuleType:
++    path = Path(__file__).with_name("local-staging-gateway.py")
++    spec = importlib.util.spec_from_file_location("econovaria_local_staging_gateway", path)
++    if spec is None or spec.loader is None:
++        raise SystemExit(f"Could not load local gateway implementation: {path}")
++    module = importlib.util.module_from_spec(spec)
++    spec.loader.exec_module(module)
++    return module
++
++
++def install_timeout(module: ModuleType, timeout_seconds: float) -> None:
++    base_http = module.http.client.HTTPConnection
++    base_https = module.http.client.HTTPSConnection
++
++    class BoundedHTTPConnection(base_http):
++        def __init__(self, *args, **kwargs):
++            requested = kwargs.get("timeout")
++            if requested is None or isinstance(requested, (int, float)):
++                kwargs["timeout"] = max(float(requested or 0), timeout_seconds)
++            super().__init__(*args, **kwargs)
++
++    class BoundedHTTPSConnection(base_https):
++        def __init__(self, *args, **kwargs):
++            requested = kwargs.get("timeout")
++            if requested is None or isinstance(requested, (int, float)):
++                kwargs["timeout"] = max(float(requested or 0), timeout_seconds)
++            super().__init__(*args, **kwargs)
++
++    module.http.client.HTTPConnection = BoundedHTTPConnection
++    module.http.client.HTTPSConnection = BoundedHTTPSConnection
++
++
++def install_trusted_client_ip(module: ModuleType) -> None:
++    base_filter = module.filtered_request_headers
++
++    def filtered_request_headers(headers, upstream_host: str) -> dict[str, str]:
++        result = base_filter(headers, upstream_host)
++        forwarded = {name.lower() for name in FORWARDED_IP_HEADERS}
++        for name in list(result):
++            if name.lower() in forwarded:
++                del result[name]
++        result[LOCAL_TRUSTED_CLIENT_IP_HEADER] = LOCAL_TRUSTED_CLIENT_IP
++        return result
++
++    module.filtered_request_headers = filtered_request_headers
++
++
++def main() -> int:
++    timeout_seconds = configured_timeout()
++    module = load_gateway()
++    install_timeout(module, timeout_seconds)
++    install_trusted_client_ip(module)
++    print(
++        "Econovaria gateway upstream request timeout: "
++        f"{timeout_seconds:g} seconds",
++        flush=True,
++    )
++    print(
++        "Econovaria gateway trusted client IP: loopback proxy overwrite",
++        flush=True,
++    )
++    return int(module.main())
++
++
++if __name__ == "__main__":
++    raise SystemExit(main())
++=======
+ exec(compile(source, str(CORE_PATH), "exec"), globals(), globals())
++>>>>>>> origin/main
```

