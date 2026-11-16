import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { marketplaceInventoryFixtureSql } from "../player-terminal/tools/marketplace-inventory-fixture.mjs";

const ids = {
  gameId: "00000000-0000-4000-8000-000000000001",
  sellerId: "00000000-0000-4000-8000-000000000002",
  itemId: "00000000-0000-4000-8000-000000000003",
};
const sql = marketplaceInventoryFixtureSql(ids);
const runner = readFileSync(new URL("../player-terminal/tools/connected-marketplace-mutation-runner.mjs", import.meta.url), "utf8");

test("connected Marketplace uses the reservation-preserving fixture", () => {
  assert.match(runner, /import \{ marketplaceInventoryFixtureSql \} from "\.\/marketplace-inventory-fixture\.mjs"/);
  assert.match(runner, /\$\{marketplaceInventoryFixtureSql\(\{ gameId, sellerId, itemId \}\)\}/);
  assert.doesNotMatch(runner, /quantity_reserved\s*=\s*0/);
});

test("fixture locks, validates before and after stock top-up, and never repairs reservations", () => {
  assert.match(sql, /on conflict on constraint inventory_holdings_scope_unique do nothing/);
  assert.match(sql, /for update;/);
  const guards = [...sql.matchAll(/marketplace_reconcile_inventory_projection_v1\([\s\S]*?, false\s*\)/g)];
  assert.equal(guards.length, 2);
  const update = sql.indexOf("update public.inventory_holdings");
  assert.ok(sql.indexOf("for update;") < guards[0].index);
  assert.ok(guards[0].index < update && update < guards[1].index);
  assert.match(sql, /set quantity_owned = greatest\(quantity_owned, quantity_reserved \+ 10\)/);
  assert.doesNotMatch(sql, /(?:update|delete from|insert into) public.inventory_reservations|set quantity_reserved|, true\s*\)/);
});

test("fixture rejects malformed identifiers before generating SQL", () => {
  for (const field of Object.keys(ids)) {
    assert.throws(() => marketplaceInventoryFixtureSql({ ...ids, [field]: "'; drop table inventory_holdings; --" }), /database UUIDs/);
  }
});

test("hosted database proof is required before the unchanged connected journeys", () => {
  const workflow = readFileSync(new URL("../.github/workflows/player-multiplayer-load-e2e.yml", import.meta.url), "utf8");
  const proof = workflow.indexOf("      - name: Prove Marketplace fixture reservation isolation");
  const next = workflow.indexOf("      - name:", proof + 10);
  const step = workflow.slice(proof, next);
  assert.ok(proof > 0 && next > proof);
  assert.match(step, /MARKETPLACE_FIXTURE_DATABASE_PROOF: "1"/);
  assert.match(step, /run: node --test scripts\/marketplace-inventory-fixture.test.mjs/);
  assert.doesNotMatch(step, /continue-on-error|if:/);
  assert.ok(next < workflow.indexOf("      - name: Execute connected two-browser Player journey"));
});

// Opt in against the disposable CI database. Temporary tables/functions use the
// exact production guard definitions and generated fixture, all rolled back.
// No browser, seeded game, production table, credentials, or migration required.
test("PostgreSQL preserves mixed reservations, repeatability and fail-closed drift", {
  skip: process.env.MARKETPLACE_FIXTURE_DATABASE_PROOF !== "1",
}, () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required for the explicit disposable proof");
  const target = new URL(databaseUrl);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "proof requires a loopback disposable database");
  const migration = readFileSync(new URL("../backend/supabase/migrations/20260721142000_harden_marketplace_resolution_replay_v1.sql", import.meta.url), "utf8");
  const start = migration.indexOf("create or replace function public.marketplace_inventory_projection_v1(");
  const end = migration.indexOf("create or replace function public.marketplace_attach_listing_reservation_v1(");
  assert.ok(start >= 0 && end > start);
  const guards = migration.slice(start, end).replaceAll("public.", "pg_temp.");
  const redemptionMigration = readFileSync(new URL("../backend/supabase/migrations/20260806120400_add_marketplace_redemption_canonical_context_v2.sql", import.meta.url), "utf8");
  const mirrorStart = redemptionMigration.indexOf("create or replace function economy_private.mirror_redemption_reservation_v2()");
  const mirrorEnd = redemptionMigration.indexOf("create trigger assign_marketplace_listing_context_v2", mirrorStart);
  assert.ok(mirrorStart >= 0 && mirrorEnd > mirrorStart);
  const mirror = redemptionMigration.slice(mirrorStart, mirrorEnd)
    .replaceAll("public.", "pg_temp.").replaceAll("economy_private.", "pg_temp.");
  const fixture = sql.replaceAll("public.", "pg_temp.");
  const proof = `
    begin;
    create temporary table inventory_holdings (
      id uuid primary key default '00000000-0000-4000-8000-000000000004',
      game_session_id uuid, player_id uuid, store_item_id uuid,
      quantity_owned integer not null, quantity_reserved integer not null,
      updated_at timestamptz default now(),
      constraint inventory_holdings_scope_unique unique(game_session_id, player_id, store_item_id)
    );
    create temporary table inventory_reservations (
      id uuid default gen_random_uuid(),
      game_session_id uuid, player_id uuid, inventory_holding_id uuid,
      store_item_id uuid, inventory_account_id uuid, game_item_id uuid,
      item_key text, canonical_item_key text, source_id uuid,
      reason_type text, quantity integer, status text,
      released_at timestamptz, consumed_at timestamptz,
      unique(game_session_id, player_id, inventory_holding_id, reason_type, source_id)
    );
    create temporary table inventory_redemption_requests (
      id uuid default gen_random_uuid(),
      game_session_id uuid, player_id uuid, inventory_holding_id uuid,
      store_item_id uuid, inventory_account_id uuid, game_item_id uuid,
      item_key text, canonical_item_key text, quantity integer, status text,
      inventory_reservation_id uuid, fulfilled_at timestamptz, reviewed_at timestamptz
    );
    ${guards}
    ${mirror}
    create trigger mirror_redemption_reservation_v2
      after insert or update of status, quantity on inventory_redemption_requests
      for each row execute function pg_temp.mirror_redemption_reservation_v2();
    ${fixture}
    do $$ begin
      if not exists(select 1 from inventory_holdings where quantity_owned=10 and quantity_reserved=0) then
        raise exception 'fresh fixture failed'; end if;
    end $$;
    insert into inventory_redemption_requests
      (game_session_id,player_id,inventory_holding_id,store_item_id,quantity,status)
      select game_session_id,player_id,id,store_item_id,1,'pending' from inventory_holdings;
    insert into inventory_reservations
      (game_session_id,player_id,inventory_holding_id,reason_type,quantity,status)
      select game_session_id,player_id,id,'crafting_input',11,'active' from inventory_holdings
      union all select game_session_id,player_id,id,'marketplace_listing',2,'released' from inventory_holdings
      union all select game_session_id,'00000000-0000-4000-8000-000000000099',
        '00000000-0000-4000-8000-000000000098','redemption',3,'active' from inventory_holdings;
    update inventory_holdings set quantity_owned=12, quantity_reserved=12;
    create temporary table reservations_before as select * from inventory_reservations;
    create temporary table redemptions_before as select * from inventory_redemption_requests;
    ${fixture}
    ${fixture}
    do $$ begin
      if not exists(select 1 from inventory_holdings where quantity_owned=22 and quantity_reserved=12) then
        raise exception 'existing reservation or repeatability failed'; end if;
      if exists((select * from inventory_reservations except select * from reservations_before)
        union all (select * from reservations_before except select * from inventory_reservations)) then
        raise exception 'authoritative reservations changed'; end if;
      if exists((select * from inventory_redemption_requests except select * from redemptions_before)
        union all (select * from redemptions_before except select * from inventory_redemption_requests))
        or not exists(select 1 from inventory_redemption_requests where status='pending' and inventory_reservation_id is not null) then
        raise exception 'pending redemption changed'; end if;
    end $$;
    update inventory_holdings set quantity_owned=50;
    ${fixture}
    do $$ begin
      if (select quantity_owned from inventory_holdings) <> 50 then raise exception 'stock reduced'; end if;
    end $$;
    update inventory_holdings set quantity_reserved=0;
    do $negative$ begin
      begin
        ${fixture}
        raise exception 'expected drift rejection missing';
      exception when others then
        if sqlerrm <> 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' then raise; end if;
      end;
      if not exists(select 1 from inventory_holdings where quantity_owned=50 and quantity_reserved=0) then
        raise exception 'drift was silently repaired'; end if;
    end $negative$;
    update inventory_holdings set quantity_owned=11, quantity_reserved=0;
    do $negative$ begin
      begin
        ${fixture}
        raise exception 'expected over-reservation rejection missing';
      exception when others then
        if sqlerrm <> 'MARKETPLACE_RESERVATION_OVER_RESERVED' then raise; end if;
      end;
      if (select quantity_owned from inventory_holdings) <> 11 then raise exception 'over-reservation repaired'; end if;
    end $negative$;
    rollback;
  `;
  execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-q"], { input: proof, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
});
