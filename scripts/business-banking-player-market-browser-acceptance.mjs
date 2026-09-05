#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runConnectedPlayerBffAcceptance as runConnectedPlayerBffAcceptanceBase } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

function replaceExactOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`Market acceptance expected one ${label} source boundary, found ${count}.`);
  }
  return source.replace(before, after);
}

function replaceSection(source, startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start < 0 || end <= start) {
    throw new Error(`Market acceptance could not resolve the ${label} source boundary.`);
  }
  return `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`;
}

const deterministicSettlementFixture = `function installSettlementAccountFixture() {
  const fixture = psql(\`
    begin;
    create temporary table phase12_market_settlement_fixture on commit drop as
    with scoped_player as (
      select
        player_row.game_session_id,
        player_row.id as player_id
      from public.players as player_row
      join public.game_sessions as game_row
        on game_row.id = player_row.game_session_id
      where game_row.name = 'Player Multiplayer E2E'
        and game_row.status = 'active'
        and player_row.player_identifier_normalized = 'BROWSER-PLAYER-ALPHA'
        and player_row.status = 'active'
      order by player_row.created_at desc, player_row.id desc
      limit 1
    ), selected_asset as (
      select
        scoped_player.game_session_id,
        scoped_player.player_id,
        asset_row.listing_currency_code
      from scoped_player
      join lateral (
        select stock_asset.listing_currency_code
        from public.game_session_stock_assets as stock_asset
        join public.currencies as currency_row
          on currency_row.code = stock_asset.listing_currency_code
         and currency_row.status = 'active'
        where stock_asset.game_session_id = scoped_player.game_session_id
          and stock_asset.is_active = true
          and lower(stock_asset.ticker) <> 'cel-index'
          and stock_asset.current_price > 0
        order by stock_asset.ticker asc, stock_asset.id asc
        limit 1
      ) as asset_row on true
    ), seeded as (
      select
        selected_asset.game_session_id,
        selected_asset.player_id,
        selected_asset.listing_currency_code,
        ledger_result.account_balance_id
      from selected_asset
      cross join lateral public.record_player_ledger_entry(
        selected_asset.game_session_id,
        selected_asset.player_id,
        'checking',
        10000,
        selected_asset.listing_currency_code,
        'credit',
        'setup',
        'initial_balance_seed',
        null,
        'system',
        null,
        jsonb_build_object(
          'bankTransactionIdempotencyKey', 'phase12-player-market-listing-checking-v2',
          'fixture', 'player_multiplayer_market_acceptance',
          'isolated', true,
          'listingCurrencyCode', selected_asset.listing_currency_code
        )
      ) as ledger_result
    )
    select
      seeded.game_session_id,
      seeded.player_id,
      seeded.listing_currency_code,
      seeded.account_balance_id
    from seeded;

    select account_row.public_key || E'\\t' || seeded.listing_currency_code
    from phase12_market_settlement_fixture as seeded
    join public.account_balances as balance_row
      on balance_row.id = seeded.account_balance_id
     and balance_row.game_session_id = seeded.game_session_id
     and balance_row.balance >= 10000
    join public.bank_accounts as account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = seeded.game_session_id
     and account_row.account_kind = 'checking'
     and account_row.currency_code = seeded.listing_currency_code
     and account_row.status = 'active'
    limit 1;
    commit;
  \`);
  const [accountKey, listingCurrencyCode] = fixture.split(/\\s+/u);
  if (!ACCOUNT_KEY.test(String(accountKey || "")) || !/^[A-Z][A-Z0-9_]{1,15}$/u.test(String(listingCurrencyCode || ""))) {
    throw new Error("Could not install a Checking settlement fixture for an active non-index Stock listing currency.");
  }
  evidence.deterministicSettlementAccountFixtureInstalled = true;
  evidence.settlementCurrencyCode = listingCurrencyCode;
}`;

async function runConnectedPlayerBffAcceptance(entryUrl) {
  const entryPath = fileURLToPath(entryUrl);
  const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
  if (corePath === entryPath) throw new Error("Market acceptance entrypoint must use .mjs.");

  const source = await readFile(corePath, "utf8");
  const filledSelector = 'getByText("FILLED", { exact: false })';
  const filledSelectorCount = source.split(filledSelector).length - 1;
  if (filledSelectorCount !== 2) {
    throw new Error(`Market acceptance expected two FILLED status selectors, found ${filledSelectorCount}.`);
  }
  const exactStatusSource = source.replaceAll(
    filledSelector,
    'getByText("FILLED", { exact: true })',
  );
  const deterministicFixtureSource = replaceSection(
    exactStatusSource,
    "function installSettlementAccountFixture() {",
    "function installOpenCalendarFixture() {",
    deterministicSettlementFixture,
    "listing-currency settlement fixture",
  );
  const terminalReadySource = replaceExactOnce(
    deterministicFixtureSource,
    `async function openRoute(page, route, selector) {
  await page.locator(\`[data-route="\${route}"]:visible\`).first().click();`,
    `async function waitForConnectedPlayerTerminal(page) {
  await page.waitForFunction(() => {
    const terminal = globalThis.Econovaria?.playerTerminal;
    const state = terminal?.getState?.();
    const capabilities = state?.data?.capabilities;
    const endpointKeys = capabilities?.endpointKeys;
    return state?.status === "ready" &&
      capabilities?.routes?.market === true &&
      capabilities?.actions?.marketOrder === true &&
      (endpointKeys === null || endpointKeys === undefined || endpointKeys.marketOrder === true);
  }, null, { timeout: 120_000 });
}

async function openRoute(page, route, selector) {
  await waitForConnectedPlayerTerminal(page);
  await page.locator(\`[data-route="\${route}"]:visible\`).first().click();`,
    "connected Player terminal readiness",
  );
  const boundedSellReviewSource = replaceExactOnce(
    terminalReadySource,
    `    const reviewPromise = waitForAuthoritativeAssetReview(page, ticker);
    await reviewButton.click();
    const review = await reviewPromise;`,
    `    const reviewPromise = waitForAuthoritativeAssetReview(page, ticker).catch(() => null);
    const activation = await form.evaluate((candidate) => {
      const submitter = candidate.querySelector('button[type="submit"]');
      const invalidControls = [...candidate.elements]
        .filter((control) => typeof control.checkValidity === "function" && !control.checkValidity())
        .map((control) => ({
          name: String(control.name || control.tagName || "control"),
          value: String(control.value || ""),
          message: String(control.validationMessage || "invalid"),
        }));
      if (!(submitter instanceof HTMLButtonElement)) {
        return { submitted: false, submitObserved: false, reason: "missing_submitter", invalidControls };
      }
      if (submitter.disabled) {
        return { submitted: false, submitObserved: false, reason: "disabled_submitter", invalidControls };
      }
      if (invalidControls.length) {
        return { submitted: false, submitObserved: false, reason: "invalid_form", invalidControls };
      }
      let submitObserved = false;
      const observeSubmit = (event) => {
        if (event.target === candidate) submitObserved = true;
      };
      document.addEventListener("submit", observeSubmit, { capture: true, once: true });
      candidate.requestSubmit(submitter);
      document.removeEventListener("submit", observeSubmit, true);
      return { submitted: true, submitObserved, reason: "", invalidControls: [] };
    });
    if (!activation.submitted || !activation.submitObserved) {
      throw new Error(\`The sell review form could not be submitted through its native browser contract: \${JSON.stringify(activation)}\`);
    }
    const review = await Promise.race([
      reviewPromise,
      page.waitForTimeout(15_000).then(() => null),
    ]);
    if (!review) {
      if (attempt === 3) {
        const diagnostic = await page.evaluate(() => {
          const terminal = globalThis.Econovaria?.playerTerminal;
          const state = terminal?.getState?.();
          const form = document.querySelector('form[data-player-market-order-form="sell-review"]');
          return {
            route: String(location.hash || ""),
            terminalStatus: String(state?.status || ""),
            marketRouteEnabled: state?.data?.capabilities?.routes?.market === true,
            marketOrderEnabled: state?.data?.capabilities?.actions?.marketOrder === true,
            marketEndpointEnabled: state?.data?.capabilities?.endpointKeys?.marketOrder !== false,
            formConnected: form?.isConnected === true,
            ticker: String(form?.elements?.namedItem("ticker")?.value || ""),
            quantity: String(form?.elements?.namedItem("quantity")?.value || ""),
            destinationAccountKey: String(form?.elements?.namedItem("destinationAccountKey")?.value || ""),
            visibleMessages: [...document.querySelectorAll('[role="alert"], [role="status"], .player-terminal-toast')]
              .filter((node) => node.offsetParent !== null)
              .map((node) => String(node.textContent || "").trim())
              .filter(Boolean)
              .slice(-5),
          };
        });
        throw new Error(\`The sell review submitted but did not emit its authoritative Stock detail request after three fresh route attempts: \${JSON.stringify(diagnostic)}\`);
      }
      await reloadMarket(page);
      await selectTicker(page, ticker);
      continue;
    }`,
    "native authoritative sell-review submission",
  );

  const materializedDirectory = await mkdtemp(
    join(dirname(entryPath), ".business-banking-player-market-exact-status-"),
  );
  const materializedEntryPath = join(materializedDirectory, basename(entryPath));
  const materializedCorePath = materializedEntryPath.replace(/\.mjs$/u, ".core.mjs");
  try {
    await Promise.all([
      writeFile(materializedEntryPath, "// Exact-status connected Player market acceptance entry.\n", "utf8"),
      writeFile(materializedCorePath, boundedSellReviewSource, "utf8"),
    ]);
    await runConnectedPlayerBffAcceptanceBase(pathToFileURL(materializedEntryPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}

await restartLocalEdgeRuntime();
await runConnectedPlayerBffAcceptance(import.meta.url);
