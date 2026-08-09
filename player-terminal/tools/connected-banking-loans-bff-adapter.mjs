#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./connected-banking-loans-mutation-runner.mjs", import.meta.url);

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function preserveBffReplayHeaders(source) {
  return source.replace(
    /const allowed = new Set\(\[([\s\S]*?)\]\);/gu,
    (match, body) => {
      if (!body.includes("x-player-session-token") || body.includes("x-econovaria-csrf-token")) {
        return match;
      }
      if (!body.includes('"x-request-id"')) {
        throw new Error("Banking/Loans replay allowlist has no request-ID anchor.");
      }
      return match.replace(
        '"x-request-id"',
        '"x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id"',
      );
    },
  );
}

let source = await readFile(CORE_URL, "utf8");
source = replaceExactlyOnce(
  source,
  "Banking/Loans Player BFF login",
  "/functions/v1/classroom-api/players/login",
  "/functions/v1/player-web-session-api/login",
);
source = replaceExactlyOnce(
  source,
  "Banking/Loans BFF evidence capture",
  '    if (!url.includes("/functions/v1/classroom-api/")) return;',
  '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
);
source = preserveBffReplayHeaders(source);
source = replaceExactlyOnce(
  source,
  "Banking/Loans cookie-bound replay",
  'const response = await fetch(url, { method, headers, body, cache: "no-store" });',
  'const response = await fetch(url, { method, headers, body, cache: "no-store", credentials: "include" });',
);
source = replaceExactlyOnce(
  source,
  "Banking/Loans assigned-currency fixture",
  `      select ab.currency_code into v_currency
      from public.account_balances ab
      where ab.game_session_id = v_game_id
        and ab.player_id = v_player_id
        and ab.account_type = 'checking'
      limit 1;
      v_currency := coalesce(v_currency, 'ECO');`,
  `      select profile.currency_code into v_currency
      from public.player_country_assignments assignment
      join public.country_profiles profile on profile.id = assignment.country_profile_id
      where assignment.game_session_id = v_game_id
        and assignment.player_id = v_player_id
        and assignment.status = 'active'
        and profile.status = 'active'
      order by assignment.assigned_at desc
      limit 1;
      if coalesce(v_currency, '') = '' then raise exception 'PLAYER_ECONOMIC_CONTEXT_REQUIRED'; end if;`,
);
source = replaceExactlyOnce(
  source,
  "Banking/Loans matched currency balances",
  `async function bankingBalances(page) {
  const checking = page.locator('[data-player-banking-balance^="checking:"] h3').first();
  const savings = page.locator('[data-player-banking-balance^="savings:"] h3').first();
  await checking.waitFor({ state: "visible", timeout: 30_000 });
  await savings.waitFor({ state: "visible", timeout: 30_000 });
  return {
    checking: numberFromText(await checking.textContent()),
    savings: numberFromText(await savings.textContent()),
  };
}`,
  `async function bankingBalances(page) {
  const sessionResponse = await page.evaluate(async () => {
    const publishableKey = String(
      globalThis.EconovariaRuntimeConfig?.supabasePublishableKey || "",
    ).trim();
    if (!publishableKey) throw new Error("Player runtime publishable key was unavailable.");
    const response = await fetch("/functions/v1/player-web-session-api/proxy/players/me", {
      cache: "no-store",
      credentials: "include",
      headers: { apikey: publishableKey },
    });
    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  });
  if (sessionResponse.status !== 200 || sessionResponse.payload?.ok !== true) {
    throw new Error(\`Player session currency lookup returned \${sessionResponse.status}.\`);
  }
  const currencyCode = String(sessionResponse.payload?.player?.currencyCode || "")
    .trim()
    .toUpperCase();
  if (!currencyCode) throw new Error("Player session did not expose its assigned currency code.");
  const checkingCard = page.locator(
    \`[data-player-banking-balance="checking:\${currencyCode}"]\`,
  ).first();
  const savingsCard = page.locator(
    \`[data-player-banking-balance="savings:\${currencyCode}"]\`,
  ).first();
  await checkingCard.waitFor({ state: "visible", timeout: 30_000 });
  await savingsCard.waitFor({ state: "visible", timeout: 30_000 });
  return {
    currencyCode,
    checking: numberFromText(await checkingCard.locator("h3").textContent()),
    savings: numberFromText(await savingsCard.locator("h3").textContent()),
  };
}`,
);

if (source.includes("/functions/v1/classroom-api/players/login")) {
  throw new Error("Banking/Loans BFF adapter retained the retired Player login route.");
}

const entryPath = fileURLToPath(import.meta.url);
const materializedDirectory = await mkdtemp(
  join(dirname(entryPath), `.${basename(entryPath, ".mjs")}-materialized-`),
);
const materializedPath = join(materializedDirectory, "connected-banking-loans-mutation-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}
