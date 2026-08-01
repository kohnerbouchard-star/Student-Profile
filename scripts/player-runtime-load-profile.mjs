#!/usr/bin/env node

import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const coreUrl = new URL("./player-runtime-load-profile-core.mjs", import.meta.url);
let source = await readFile(coreUrl, "utf8");

const replacements = [
  {
    label: "Player read resilience import",
    old: `import { performance } from "node:perf_hooks";`,
    next: `import { performance } from "node:perf_hooks";
import { createStudentProfileReadResilientFetch } from "../player-terminal/src/integrations/student-profile-read-resilience.js";`,
  },
  {
    label: "Player read resilience client",
    old: `const READ_SCHEDULING = "sequential-per-player";`,
    next: `const READ_SCHEDULING = "sequential-per-player";
const playerReadRetryEvents = [];
const resilientPlayerFetch = createStudentProfileReadResilientFetch(globalThis.fetch, {
  onEvent: (event) => playerReadRetryEvents.push({
    type: event.type,
    attempt: event.attempt,
    nextAttempt: event.nextAttempt,
    delayMs: event.delayMs,
    path: event.path,
    status: event.status,
    reason: event.reason,
    classification: event.classification,
    retryAfterMs: event.retryAfterMs,
    remainingBudgetMs: event.remainingBudgetMs,
    elapsedMs: event.elapsedMs,
  }),
});`,
  },
  {
    label: "Player request fetch",
    old: `    const response = await fetch(\`${"${BASE_URL}${path}"}\`, {`,
    next: `    const response = await resilientPlayerFetch(\`${"${BASE_URL}${path}"}\`, {`,
  },
  {
    label: "Player login transport",
    old: `async function loginPlayer(player, gameCode, publishableKey) {
  const deviceId = crypto.randomUUID();
  const response = await requestJson("/functions/v1/player-api/players/login", {
    method: "POST",
    headers: publicHeaders(publishableKey, deviceId, {
      "x-request-id": crypto.randomUUID(),
    }),
    body: {
      gameJoinCode: gameCode,
      playerIdentifier: player.playerIdentifier,
      accessCode: player.accessCode,
    },
  });
  return {
    ok: response.ok && response.payload?.ok === true && Boolean(response.payload?.session?.token),
    status: response.status,
    elapsedMs: response.elapsedMs,
    token: response.payload?.session?.token || "",
    deviceId,
    error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
  };
}`,
    next: `async function loginPlayer(player, gameCode, publishableKey) {
  const deviceId = crypto.randomUUID();
  const response = await requestJson("/functions/v1/player-web-session-api/login", {
    method: "POST",
    headers: publicHeaders(publishableKey, deviceId, {
      "x-request-id": crypto.randomUUID(),
    }),
    body: {
      gameJoinCode: gameCode,
      playerIdentifier: player.playerIdentifier,
      accessCode: player.accessCode,
    },
  });
  const cookie = cookieHeader(response.setCookies);
  const csrfToken = String(response.payload?.csrfToken || "");
  return {
    ok: response.ok &&
      response.payload?.ok === true &&
      response.payload?.session?.authenticated === true &&
      Boolean(cookie) &&
      Boolean(csrfToken),
    status: response.status,
    elapsedMs: response.elapsedMs,
    cookie,
    csrfToken,
    deviceId,
    error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
  };
}`,
  },
  {
    label: "Player read transport",
    old: `async function readWave(sessions, publishableKey) {
  const startedAt = performance.now();
  const perPlayerResults = await Promise.all(sessions.map(async (session, playerIndex) => {
    const results = [];
    for (const path of READ_PATHS) {
      const response = await requestJson(\`/functions/v1/player-api\${path}\`, {
        headers: publicHeaders(publishableKey, session.deviceId, {
          "x-player-session-token": session.token,
          "x-request-id": crypto.randomUUID(),
        }),
      });
      results.push({
        player: playerIndex + 1,
        path,
        ok: response.ok,
        status: response.status,
        elapsedMs: response.elapsedMs,
        error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
      });
    }
    return results;
  }));
  return {
    elapsedMs: performance.now() - startedAt,
    peakConcurrentRequests: sessions.length,
    results: perPlayerResults.flat(),
  };
}`,
    next: `async function readWave(sessions, publishableKey) {
  const startedAt = performance.now();
  const perPlayerResults = await Promise.all(sessions.map(async (session, playerIndex) => {
    const results = [];
    for (const path of READ_PATHS) {
      const response = await requestJson(\`/functions/v1/player-web-session-api/proxy\${path}\`, {
        headers: publicHeaders(publishableKey, session.deviceId, {
          Cookie: session.cookie,
          "x-request-id": crypto.randomUUID(),
        }),
      });
      results.push({
        player: playerIndex + 1,
        path,
        ok: response.ok,
        status: response.status,
        elapsedMs: response.elapsedMs,
        error: response.ok ? "" : sanitize(response.payload?.error?.message || response.networkError),
      });
    }
    return results;
  }));
  return {
    elapsedMs: performance.now() - startedAt,
    peakConcurrentRequests: sessions.length,
    results: perPlayerResults.flat(),
  };
}`,
  },
  {
    label: "baseline session projection",
    old: `const baselineSessions = baselineLogins.map(({ token, deviceId }) => ({ token, deviceId }));`,
    next: `const baselineSessions = baselineLogins.map(({ cookie, csrfToken, deviceId }) => ({ cookie, csrfToken, deviceId }));`,
  },
  {
    label: "maximum session projection",
    old: `...remainingLogins.map(({ token, deviceId }) => ({ token, deviceId })),`,
    next: `...remainingLogins.map(({ cookie, csrfToken, deviceId }) => ({ cookie, csrfToken, deviceId })),`,
  },
  {
    label: "evidence transport label",
    old: `playerTransport: "player-api",`,
    next: `playerTransport: "http-only-player-bff",
    readRetries: playerReadRetryEvents,`,
  },
];

for (const { label, old, next } of replacements) {
  const occurrences = source.split(old).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Player load adapter expected one ${label}, found ${occurrences}.`);
  }
  source = source.replace(old, next);
}

if (source.includes("/functions/v1/player-api/players/login") || source.includes('"x-player-session-token"')) {
  throw new Error("Player load adapter left a retired browser credential transport.");
}

const target = fileURLToPath(new URL("./.generated-player-runtime-load-profile.mjs", import.meta.url));
try {
  await writeFile(target, source, "utf8");
  await import(`${pathToFileURL(target).href}?source=${encodeURIComponent(fileURLToPath(coreUrl))}`);
} finally {
  await rm(target, { force: true });
}
