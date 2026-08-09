#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runConnectedPlayerBffAcceptance } from "./connected-player-bff-acceptance-loader.mjs";
import { restartLocalEdgeRuntime } from "./local-edge-runtime-isolation.mjs";

const execFileAsync = promisify(execFile);
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const PLAYER_ID = "BROWSER-PLAYER-ALPHA";

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function provisionUsableInventoryFixture() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the connected Inventory fixture.");
  }

  const query = `with candidate as (
  select gi.id as game_item_id
  from public.inventory_holdings ih
  join public.players p
    on p.id = ih.player_id
   and p.game_session_id = ih.game_session_id
  join public.game_sessions g
    on g.id = ih.game_session_id
  join public.game_items gi
    on gi.id = ih.game_item_id
   and gi.game_session_id = ih.game_session_id
  left join public.store_items si
    on si.id = ih.store_item_id
   and si.game_session_id = ih.game_session_id
  where g.name = ${sqlLiteral(GAME_NAME)}
    and p.player_identifier = ${sqlLiteral(PLAYER_ID)}
    and p.status = 'active'
    and ih.quantity_owned > ih.quantity_reserved
    and gi.status = 'active'
    and (
      ih.store_item_id is null
      or (si.status = 'active' and si.visibility = 'visible')
    )
  order by ih.updated_at desc, ih.id asc
  limit 1
)
update public.game_items gi
set metadata = coalesce(gi.metadata, '{}'::jsonb) || '{"effectEnabled":true}'::jsonb
from candidate c
where gi.id = c.game_item_id
returning gi.canonical_key;`;

  const { stdout } = await execFileAsync("psql", [
    DATABASE_URL,
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ], { timeout: 30_000, maxBuffer: 1_048_576 });

  const canonicalKey = String(stdout || "").trim().split(/\r?\n/u).filter(Boolean)[0] || "";
  if (!canonicalKey) {
    throw new Error("Connected Inventory fixture could not resolve an owned active item with available quantity.");
  }
}

await restartLocalEdgeRuntime();
await provisionUsableInventoryFixture();
await runConnectedPlayerBffAcceptance(import.meta.url);
