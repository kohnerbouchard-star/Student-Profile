#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function replaceAtLeastOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count < 1) {
    throw new Error(`${label} expected at least one canonical source match.`);
  }
  return source.replaceAll(before, after);
}

function preserveBffReplayHeaders(source, label) {
  let adapted = false;
  const result = source.replace(
    /const allowed = new Set\(\[([\s\S]*?)\]\);/gu,
    (match, body) => {
      if (!body.includes("x-player-session-token") || body.includes("x-econovaria-csrf-token")) {
        return match;
      }
      if (!body.includes('"x-request-id"')) {
        throw new Error(`${label} replay allowlist has no request-ID anchor.`);
      }
      adapted = true;
      return match.replace(
        '"x-request-id"',
        '"x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id"',
      );
    },
  );
  if (!adapted) {
    throw new Error(`${label} did not expose a Player replay header allowlist.`);
  }
  return result;
}

function adaptMarketplaceCountryFixture(source) {
  if (!source.includes("function seedMarketplace()")) return source;

  source = replaceExactlyOnce(
    source,
    "Marketplace country-currency selection",
    `    ), selected_currency as (
      select coalesce(
        (select balance.currency_code from public.account_balances balance, scope where balance.game_session_id = scope.game_id and balance.player_id = scope.seller_id and balance.account_type = 'cash' limit 1),
        'ECO'
      ) as currency_code
    )
    select scope.game_id, scope.seller_id, scope.buyer_id, selected_item.item_id, selected_item.item_key, selected_currency.currency_code
    from scope, selected_item, selected_currency;
  \`, true).split("|");
  if (row.length !== 6) throw new Error("Marketplace fixture could not resolve game, players, item, and currency.");
  const [gameId, sellerId, buyerId, itemId, itemKey, currency] = row;`,
    `    ), selected_country as (
      select assignment.country_profile_id, profile.currency_code
      from public.player_country_assignments assignment
      join public.country_profiles profile on profile.id = assignment.country_profile_id
      cross join scope
      where assignment.game_session_id = scope.game_id
        and assignment.player_id = scope.seller_id
        and assignment.status = 'active'
      order by assignment.assigned_at desc
      limit 1
    )
    select scope.game_id, scope.seller_id, scope.buyer_id, selected_item.item_id, selected_item.item_key,
      selected_country.country_profile_id, selected_country.currency_code
    from scope, selected_item, selected_country;
  \`, true).split("|");
  if (row.length !== 7) throw new Error("Marketplace fixture could not resolve game, players, item, country, and currency.");
  const [gameId, sellerId, buyerId, itemId, itemKey, countryProfileId, currency] = row;`,
  );

  source = replaceExactlyOnce(
    source,
    "Marketplace buyer-country alignment",
    `  psql(\`
    insert into public.inventory_holdings (game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved)`,
    `  psql(\`
    do $$
    begin
      update public.player_country_assignments
      set country_profile_id = '${countryProfileId}', assigned_at = statement_timestamp()
      where game_session_id = '${gameId}'
        and player_id = '${buyerId}'
        and status = 'active';
      if not found then
        raise exception 'MARKETPLACE_BUYER_COUNTRY_ASSIGNMENT_NOT_FOUND';
      end if;
    end
    $$;

    insert into public.inventory_holdings (game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved)`,
  );

  return source;
}

function adaptMarketplaceSellerPersistence(source) {
  if (!source.includes("async function activateListing(page, listing)")) return source;

  const before = `  await reloadMarketplace(page);
  const card = page.locator(\`[data-player-marketplace-select="\${listing.listingId}"]\`);
  await card.waitFor({ state: "visible", timeout: 30_000 });
  evidence.listing.persisted = true;`;
  const after = `  await reloadMarketplace(page);
  const activeListing = page.locator(
    \`form[data-endpoint="marketplaceCancel"] input[name="listingId"][value="\${listing.listingId}"]\`,
  ).locator("xpath=ancestor::article[1]");
  await activeListing.waitFor({ state: "visible", timeout: 30_000 });
  if (await activeListing.locator('form[data-endpoint="marketplaceActivate"]').count()) {
    throw new Error("Activated Marketplace listing remained in draft state.");
  }
  const activeListingText = String(await activeListing.innerText());
  if (!/\\bactive\\b/iu.test(activeListingText)) {
    throw new Error(\`Activated Marketplace listing did not render an active status: \${redact(activeListingText)}\`);
  }
  evidence.listing.persisted = true;`;

  return replaceExactlyOnce(
    source,
    "Marketplace seller persistence",
    before,
    after,
  );
}

export async function runPlayerBffAdaptedRunner(targetUrl, label = "Connected Player journey") {
  const targetPath = fileURLToPath(targetUrl);
  let source = await readFile(targetPath, "utf8");

  source = replaceExactlyOnce(
    source,
    `${label} Player BFF login`,
    "/functions/v1/classroom-api/players/login",
    "/functions/v1/player-web-session-api/login",
  );
  source = replaceExactlyOnce(
    source,
    `${label} BFF evidence capture`,
    '    if (!url.includes("/functions/v1/classroom-api/")) return;',
    '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
  );
  source = preserveBffReplayHeaders(source, label);
  source = replaceAtLeastOnce(
    source,
    `${label} cookie-bound replay`,
    'fetch(url, { method, headers, body, cache: "no-store" })',
    'fetch(url, { method, headers, body, cache: "no-store", credentials: "include" })',
  );
  source = adaptMarketplaceCountryFixture(source);
  source = adaptMarketplaceSellerPersistence(source);

  if (source.includes("/functions/v1/classroom-api/players/login")) {
    throw new Error(`${label} retained the retired Player login route.`);
  }

  const materializedDirectory = await mkdtemp(
    join(dirname(targetPath), `.${basename(targetPath, ".mjs")}-bff-materialized-`),
  );
  const materializedPath = join(materializedDirectory, basename(targetPath));
  try {
    await writeFile(materializedPath, source, "utf8");
    await import(pathToFileURL(materializedPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}
