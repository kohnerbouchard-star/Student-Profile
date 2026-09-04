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
  const normalizedPlayerSource = replaceExactOnce(
    exactStatusSource,
    "        and lower(player_row.player_identifier) = lower('BROWSER-PLAYER-ALPHA')",
    "        and player_row.player_identifier_normalized = 'BROWSER-PLAYER-ALPHA'",
    "normalized Player identifier",
  );
  const listingAssetSource = replaceExactOnce(
    normalizedPlayerSource,
    `    ), seeded as (
      select
        scoped_player.game_session_id,
        scoped_player.player_id,
        ledger_result.account_balance_id
      from scoped_player
      cross join lateral public.record_player_ledger_entry(`,
    `    ), listing_asset as (
      select
        asset_row.ticker,
        asset_row.listing_currency_code
      from public.game_session_stock_assets as asset_row
      join scoped_player
        on scoped_player.game_session_id = asset_row.game_session_id
      join public.currencies as currency_row
        on currency_row.code = asset_row.listing_currency_code
       and currency_row.status = 'active'
      where asset_row.is_active = true
        and asset_row.current_price > 0
      order by asset_row.current_price asc, asset_row.ticker asc, asset_row.id asc
      limit 1
    ), seeded as (
      select
        scoped_player.game_session_id,
        scoped_player.player_id,
        listing_asset.ticker,
        listing_asset.listing_currency_code,
        ledger_result.account_balance_id
      from scoped_player
      cross join listing_asset
      cross join lateral public.record_player_ledger_entry(`,
    "listing-currency Stock fixture selection",
  );
  const listingCurrencySource = replaceExactOnce(
    listingAssetSource,
    `        10000,
        'ECO',
        'credit',`,
    `        10000,
        listing_asset.listing_currency_code,
        'credit',`,
    "listing-currency Checking seed",
  );
  const idempotencySource = replaceExactOnce(
    listingCurrencySource,
    "'bankTransactionIdempotencyKey', 'phase12-player-market-eco-checking-v1'",
    "'bankTransactionIdempotencyKey', 'phase12-player-market-listing-checking-v2'",
    "listing-currency fixture idempotency",
  );
  const statementBoundarySource = replaceExactOnce(
    idempotencySource,
    "    with scoped_player as (",
    `    begin;
    create temporary table phase12_market_settlement_fixture on commit drop as
    with scoped_player as (`,
    "settlement fixture statement boundary",
  );
  const canonicalBalanceSource = replaceExactOnce(
    statementBoundarySource,
    `    select account_row.public_key
    from seeded
    join public.economic_parties as party_row
      on party_row.game_session_id = seeded.game_session_id
     and party_row.party_kind = 'player'
     and party_row.player_id = seeded.player_id
     and party_row.status = 'active'
    join public.bank_accounts as account_row
      on account_row.game_session_id = seeded.game_session_id
     and account_row.party_id = party_row.id
     and account_row.account_kind = 'checking'
     and account_row.currency_code = 'ECO'
     and account_row.status = 'active'
    join public.account_balances as balance_row
      on balance_row.game_session_id = account_row.game_session_id
     and balance_row.bank_account_id = account_row.id
     and balance_row.balance >= 10000
    limit 1;`,
    `    select
      seeded.game_session_id,
      seeded.player_id,
      seeded.ticker,
      seeded.listing_currency_code,
      seeded.account_balance_id
    from seeded;

    select account_row.public_key
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
    commit;`,
    "canonical listing-currency settlement account fixture",
  );
  const fixtureMessageSource = replaceExactOnce(
    canonicalBalanceSource,
    "Could not install the isolated ECO Checking settlement fixture.",
    "Could not install the isolated listing-currency Checking settlement fixture.",
    "listing-currency fixture failure",
  );

  const materializedDirectory = await mkdtemp(
    join(dirname(entryPath), ".business-banking-player-market-exact-status-"),
  );
  const materializedEntryPath = join(materializedDirectory, basename(entryPath));
  const materializedCorePath = materializedEntryPath.replace(/\.mjs$/u, ".core.mjs");
  try {
    await Promise.all([
      writeFile(materializedEntryPath, "// Exact-status connected Player market acceptance entry.\n", "utf8"),
      writeFile(materializedCorePath, fixtureMessageSource, "utf8"),
    ]);
    await runConnectedPlayerBffAcceptanceBase(pathToFileURL(materializedEntryPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}

await restartLocalEdgeRuntime();
await runConnectedPlayerBffAcceptance(import.meta.url);
