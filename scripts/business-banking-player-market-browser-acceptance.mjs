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
  const statementBoundarySource = replaceExactOnce(
    normalizedPlayerSource,
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
     and account_row.currency_code = 'ECO'
     and account_row.status = 'active'
    limit 1;
    commit;`,
    "canonical settlement account fixture",
  );

  const materializedDirectory = await mkdtemp(
    join(dirname(entryPath), ".business-banking-player-market-exact-status-"),
  );
  const materializedEntryPath = join(materializedDirectory, basename(entryPath));
  const materializedCorePath = materializedEntryPath.replace(/\.mjs$/u, ".core.mjs");
  try {
    await Promise.all([
      writeFile(materializedEntryPath, "// Exact-status connected Player market acceptance entry.\n", "utf8"),
      writeFile(materializedCorePath, canonicalBalanceSource, "utf8"),
    ]);
    await runConnectedPlayerBffAcceptanceBase(pathToFileURL(materializedEntryPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}

await restartLocalEdgeRuntime();
await runConnectedPlayerBffAcceptance(import.meta.url);
