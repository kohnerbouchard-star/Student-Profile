#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  scope: "docs/roadmaps/multicurrency-stock-funding-scope-v1.md",
  audit: "docs/roadmaps/multicurrency-stock-funding-authority-audit-v1.md",
  inventory: "docs/roadmaps/multicurrency-stock-funding-schema-inventory-v1.md",
  executionInventory:
    "docs/roadmaps/multicurrency-stock-funding-execution-inventory-v1.md",
  databaseInventory:
    "docs/roadmaps/multicurrency-stock-funding-database-inventory-v1.md",
  plan: "docs/roadmaps/multicurrency-stock-funding-implementation-plan-v1.md",
  handoff: "docs/roadmaps/multicurrency-stock-funding-scope-handoff-v1.md",
  authority: "docs/operations/contracts/player-cross-cutting/pr-676.json",
  handler:
    "backend/src/domains/stocks/api/playerStockMarketTradingHttpHandler.ts",
  repository:
    "backend/src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.ts",
  contracts:
    "backend/src/domains/stocks/contracts/stockMarketTradingContracts.ts",
  schema:
    "backend/supabase/migrations/20260829100000_multicurrency_stock_funding_schema_v1.sql",
  assertions:
    "backend/supabase/migrations/20260829100500_multicurrency_stock_funding_assertions_v1.sql",
  workflow: ".github/workflows/multicurrency-stock-funding-v1.yml",
};

function read(relativePath, required = true) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    if (!required) return null;
    throw new Error(`Missing C3 artifact: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireTokens(text, label, tokens) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      throw new Error(`${label} is missing required token: ${token}`);
    }
  }
}

function forbidTokens(text, label, tokens) {
  for (const token of tokens) {
    if (text.includes(token)) {
      throw new Error(`${label} contains prohibited token: ${token}`);
    }
  }
}

const source = {
  scope: read(files.scope),
  audit: read(files.audit),
  inventory: read(files.inventory),
  executionInventory: read(files.executionInventory),
  databaseInventory: read(files.databaseInventory),
  plan: read(files.plan),
  handoff: read(files.handoff),
  authority: read(files.authority),
  handler: read(files.handler),
  repository: read(files.repository),
  contracts: read(files.contracts),
  schema: read(files.schema, false),
  assertions: read(files.assertions, false),
  workflow: read(files.workflow),
};

requireTokens(source.scope, "C3 controlling scope", [
  "BUSINESS-V2-10A4C3",
  "feat/multicurrency-stock-funding-v1",
  "9b95009dd7e73ed70987a0a99716d3ee32f2662d",
  "ba033ac4a7759d068233513431891fc9de3ae95a",
  "Financial Markets owns",
  "C0 owns",
  "B1 and B2 own",
  "listing currency",
  "one, two, or three",
  "C3A",
  "C3E",
  "IMPLEMENTED_NOT_MERGED",
]);
requireTokens(source.audit, "C3 authority audit", [
  "AUDIT_COMPLETE",
  "playerStockMarketTradingHttpHandler.ts",
  "supabaseStockMarketTradingRepository.ts",
  "execute_stock_market_order_calendar_gated",
  "record_player_ledger_entry",
  "account_balances",
  "one ECO Checking",
  "Financial Markets authority to preserve",
]);
requireTokens(source.inventory, "C3 schema/runtime inventory", [
  "INTAKE_COMPLETE",
  "stock_orders",
  "stock_trades",
  "stock_holdings",
  "game_session_stock_assets",
  "purchase quote",
  "funding receipt",
]);
requireTokens(source.executionInventory, "C3 exact execution inventory", [
  "C3A_DISCOVERY_COMPLETE",
  "execute_stock_market_order_calendar_gated",
  "execute_stock_market_order",
  "C3A implementation consequences",
]);
requireTokens(source.databaseInventory, "C3 rebuilt database inventory", [
  "C3A_DATABASE_DISCOVERY_COMPLETE",
  "public.game_session_stock_assets",
  "public.stock_orders",
  "public.stock_trades",
  "public.stock_holdings",
  "Current execution markers",
]);
requireTokens(source.plan, "C3 implementation plan", [
  "C3A — Exact execution inventory and compatibility-safe schema",
  "C3B — Financial Markets buy quote and C0 funding binding",
  "C3C — Atomic buy settlement and sell-proceeds cutover",
  "C3D — Player API, read models, and Stock Market UI",
  "C3E — Exact-head certification and handoff",
]);
requireTokens(source.handoff, "C3 scope handoff", [
  "INTAKE_COMPLETE — IMPLEMENTATION_NOT_STARTED",
  "Draft PR:** #676",
  "C3A only",
  "Merge or deployment authorized:** No",
]);

const authority = JSON.parse(source.authority);
if (authority.pullRequestNumber !== 676) {
  throw new Error("C3 authority is not bound to PR #676.");
}
if (authority.baseRef !== "feat/multicurrency-marketplace-funding-v1") {
  throw new Error("C3 authority has the wrong stacked base.");
}
for (const field of [
  "productionDeploymentAllowed",
  "productionMutationAllowed",
  "secretValuesAllowed",
]) {
  if (authority[field] !== false) {
    throw new Error(`C3 authority must keep ${field}=false.`);
  }
}
for (const allowedPath of Object.values(files)) {
  if (
    [files.contracts, files.handler, files.repository].includes(allowedPath)
  ) {
    continue;
  }
  if (
    !authority.allowedPaths.includes(allowedPath) &&
    ![files.executionInventory, files.databaseInventory].includes(allowedPath)
  ) {
    throw new Error(`C3 authority does not allow required path: ${allowedPath}`);
  }
}

requireTokens(source.handler, "Retained Player Stock handler", [
  "handlePlayerStockMarketTradingRequest",
  "ticker",
  "expectedPrice",
  "idempotencyKey",
  "rejectPrivateScopeFields",
  "resolveStockAssetByTicker",
]);
requireTokens(source.repository, "Retained Stock repository", [
  "SupabaseStockMarketTradingRepository",
  "execute_stock_market_order_calendar_gated",
  "insufficient_cash",
  "insufficient_shares",
  "STOCK_TRADING_MARKET_CLOSED",
]);

const permanentBoundary = `${source.scope}\n${source.audit}\n${source.inventory}\n${source.plan}\n${source.workflow}`;
forbidTokens(permanentBoundary, "C3 permanent boundary", [
  "productionDeploymentAllowed\": true",
  "productionMutationAllowed\": true",
  "secretValuesAllowed\": true",
  "deploy to production",
  "run staging SQL",
  "run production SQL",
]);

const schemaPresent = source.schema !== null || source.assertions !== null;
if ((source.schema === null) !== (source.assertions === null)) {
  throw new Error("C3A schema and assertions migrations must appear together.");
}

if (schemaPresent) {
  requireTokens(source.schema, "C3A schema migration", [
    "multicurrency_stock_funding",
    "listing_currency",
    "stock",
    "funding",
    "legacy",
    "revoke",
  ]);
  requireTokens(source.assertions, "C3A assertion migration", [
    "STOCK_FUNDING",
    "listing_currency",
    "execute_stock_market_order_calendar_gated",
  ]);
  forbidTokens(
    `${source.schema}\n${source.assertions}`,
    "C3A migrations",
    [
      "convert_currency_amount(",
      "create table public.stock_wallet",
      "create table public.stock_balances",
      "grant execute on function" + " public.create_stock",
    ],
  );
}

requireTokens(source.workflow, "Permanent C3 workflow", [
  "multicurrency-stock-funding-v1",
  "verify-player-cross-cutting-authority.mjs",
  "multicurrency-stock-funding-contract.mjs",
  "validate-supabase-migrations.mjs",
  "Database Replay",
  "Player Terminal",
]);

console.log(
  `Multi-currency Stock funding contract: PASS (${schemaPresent ? "C3A schema present" : "scope/static foundation"})`,
);
