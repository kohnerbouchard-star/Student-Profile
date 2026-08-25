#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const rawDatabaseUrl = process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(rawDatabaseUrl);
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
if (
  parsedDatabaseUrl.protocol !== "postgresql:" ||
  !allowedHosts.has(parsedDatabaseUrl.hostname) ||
  parsedDatabaseUrl.port !== "54322" ||
  parsedDatabaseUrl.pathname !== "/postgres"
) {
  throw new Error(
    "Phase 10A.3 database verification is restricted to localhost:54322/postgres.",
  );
}

export const DATABASE_URL = rawDatabaseUrl;
export const PSQL_ARGS = [
  "-X",
  "--no-psqlrc",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  DATABASE_URL,
];

export const FIXTURE = Object.freeze({
  staffId: "10000000-0000-0000-0000-000000000001",
  countryId: "40000000-0000-0000-0000-000000000001",
  games: Object.freeze({
    one: Object.freeze({
      id: "20000000-0000-0000-0000-000000000001",
      businessId: "50000000-0000-0000-0000-000000000001",
      businessKey: `biz_${"1".repeat(32)}`,
      ownerId: "30000000-0000-0000-0000-000000000011",
      buyerOneId: "30000000-0000-0000-0000-000000000012",
      buyerTwoId: "30000000-0000-0000-0000-000000000013",
      gameItemId: "60000000-0000-0000-0000-000000000001",
      storeItemId: "90000000-0000-0000-0000-000000000001",
      offerId: "a0000000-0000-0000-0000-000000000001",
      offerKey: `sof_${"5".repeat(32)}`,
      expectedOfferVersion: 2,
    }),
    two: Object.freeze({
      id: "20000000-0000-0000-0000-000000000002",
      businessId: "50000000-0000-0000-0000-000000000002",
      businessKey: `biz_${"2".repeat(32)}`,
      ownerId: "30000000-0000-0000-0000-000000000021",
      buyerOneId: "30000000-0000-0000-0000-000000000022",
      buyerTwoId: "30000000-0000-0000-0000-000000000023",
      gameItemId: "60000000-0000-0000-0000-000000000002",
      storeItemId: "90000000-0000-0000-0000-000000000002",
      offerId: "a0000000-0000-0000-0000-000000000002",
      offerKey: `sof_${"6".repeat(32)}`,
      expectedOfferVersion: 2,
    }),
  }),
});

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function redact(text) {
  const databaseRedacted = String(text).replaceAll(
    DATABASE_URL,
    "postgresql://***@127.0.0.1:54322/postgres",
  );
  return parsedDatabaseUrl.password
    ? databaseRedacted.replaceAll(parsedDatabaseUrl.password, "***")
    : databaseRedacted;
}

export function runSql(sql, { allowError = false, timeoutMs = 45_000 } = {}) {
  const input = String.raw`\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on
set statement_timeout = '30s';
set lock_timeout = '5s';
${sql}
`;
  const result = spawnSync("psql", PSQL_ARGS, {
    input,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = result.stdout.trim();
  const error = redact(result.stderr.trim());
  if (!allowError && (result.status !== 0 || result.error)) {
    throw new Error(
      `psql failed (${result.status ?? "spawn"}): ${
        error || result.error?.message
      }`,
    );
  }
  return { status: result.status, output, error };
}

export function runJson(sql) {
  const { output } = runSql(sql);
  const lines = output.split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(
      `Expected one JSON row, received ${lines.length}: ${output}`,
    );
  }
  return JSON.parse(lines[0]);
}

export function expectSqlError(sql, pattern) {
  const result = runSql(sql, { allowError: true });
  if (result.status === 0 || !pattern.test(result.error)) {
    throw new Error(
      `Expected psql error ${pattern}, received status ${result.status}: ${result.error}`,
    );
  }
  return result.error;
}

export const seedFixtureSql = String.raw`
insert into public.staff_users (
  id, supabase_auth_user_id, email, display_name, status, role
) values (
  ${sqlLiteral(FIXTURE.staffId)},
  '10000000-0000-0000-0000-000000000002',
  'phase10a3-db@example.invalid', 'Phase 10A3 DB', 'active', 'game_admin'
);

insert into public.game_sessions (
  id, owner_staff_user_id, name, lifecycle_state, provisioning_status
) values
  (${sqlLiteral(FIXTURE.games.one.id)}, ${sqlLiteral(FIXTURE.staffId)},
    'Phase 10A3 Game One', 'draft', 'pending'),
  (${sqlLiteral(FIXTURE.games.two.id)}, ${sqlLiteral(FIXTURE.staffId)},
    'Phase 10A3 Game Two', 'draft', 'pending');

insert into public.country_profiles (
  id, country_code, country_name, capital_name, currency_code, status
) values (
  ${
  sqlLiteral(FIXTURE.countryId)
}, 'TST', 'Test Republic', 'Test City', 'ECO', 'active'
);

insert into public.players (id, game_session_id, display_name, status, country_id)
values
  (${sqlLiteral(FIXTURE.games.one.ownerId)}, ${
  sqlLiteral(FIXTURE.games.one.id)
},
    'Owner One', 'active', ${sqlLiteral(FIXTURE.countryId)}),
  (${sqlLiteral(FIXTURE.games.one.buyerOneId)}, ${
  sqlLiteral(FIXTURE.games.one.id)
},
    'Buyer One A', 'active', ${sqlLiteral(FIXTURE.countryId)}),
  (${sqlLiteral(FIXTURE.games.one.buyerTwoId)}, ${
  sqlLiteral(FIXTURE.games.one.id)
},
    'Buyer One B', 'active', ${sqlLiteral(FIXTURE.countryId)}),
  (${sqlLiteral(FIXTURE.games.two.ownerId)}, ${
  sqlLiteral(FIXTURE.games.two.id)
},
    'Owner Two', 'active', ${sqlLiteral(FIXTURE.countryId)}),
  (${sqlLiteral(FIXTURE.games.two.buyerOneId)}, ${
  sqlLiteral(FIXTURE.games.two.id)
},
    'Buyer Two A', 'active', ${sqlLiteral(FIXTURE.countryId)}),
  (${sqlLiteral(FIXTURE.games.two.buyerTwoId)}, ${
  sqlLiteral(FIXTURE.games.two.id)
},
    'Buyer Two B', 'active', ${sqlLiteral(FIXTURE.countryId)});

insert into public.player_country_assignments (
  id, game_session_id, player_id, country_profile_id, status, assignment_reason
) values
  ('41000000-0000-0000-0000-000000000011', ${sqlLiteral(FIXTURE.games.one.id)},
    ${sqlLiteral(FIXTURE.games.one.ownerId)}, ${
  sqlLiteral(FIXTURE.countryId)
}, 'active', 'phase10a3'),
  ('41000000-0000-0000-0000-000000000012', ${sqlLiteral(FIXTURE.games.one.id)},
    ${sqlLiteral(FIXTURE.games.one.buyerOneId)}, ${
  sqlLiteral(FIXTURE.countryId)
}, 'active', 'phase10a3'),
  ('41000000-0000-0000-0000-000000000013', ${sqlLiteral(FIXTURE.games.one.id)},
    ${sqlLiteral(FIXTURE.games.one.buyerTwoId)}, ${
  sqlLiteral(FIXTURE.countryId)
}, 'active', 'phase10a3'),
  ('41000000-0000-0000-0000-000000000021', ${sqlLiteral(FIXTURE.games.two.id)},
    ${sqlLiteral(FIXTURE.games.two.ownerId)}, ${
  sqlLiteral(FIXTURE.countryId)
}, 'active', 'phase10a3'),
  ('41000000-0000-0000-0000-000000000022', ${sqlLiteral(FIXTURE.games.two.id)},
    ${sqlLiteral(FIXTURE.games.two.buyerOneId)}, ${
  sqlLiteral(FIXTURE.countryId)
}, 'active', 'phase10a3'),
  ('41000000-0000-0000-0000-000000000023', ${sqlLiteral(FIXTURE.games.two.id)},
    ${sqlLiteral(FIXTURE.games.two.buyerTwoId)}, ${
  sqlLiteral(FIXTURE.countryId)
}, 'active', 'phase10a3');

insert into public.business_entities (
  id, public_key, game_session_id, owner_player_id, legal_name, entity_type,
  industry_code, country_code, currency_code, status, capitalization, valuation,
  tax_classification, formation_state, ownership_model_version
) values
  (${sqlLiteral(FIXTURE.games.one.businessId)}, ${
  sqlLiteral(FIXTURE.games.one.businessKey)
},
    ${sqlLiteral(FIXTURE.games.one.id)}, ${
  sqlLiteral(FIXTURE.games.one.ownerId)
},
    'Fixture Goods One LLC', 'llc', 'manufacturing', 'TST', 'ECO', 'active',
    100, 100, 'disregarded', 'operational', 2),
  (${sqlLiteral(FIXTURE.games.two.businessId)}, ${
  sqlLiteral(FIXTURE.games.two.businessKey)
},
    ${sqlLiteral(FIXTURE.games.two.id)}, ${
  sqlLiteral(FIXTURE.games.two.ownerId)
},
    'Fixture Goods Two LLC', 'llc', 'manufacturing', 'TST', 'ECO', 'active',
    100, 100, 'disregarded', 'operational', 2);

insert into public.game_items (
  id, public_key, game_session_id, canonical_key, source_kind, name,
  item_class, subtype, stackable, serialized, transferable, status
) values
  (${
  sqlLiteral(FIXTURE.games.one.gameItemId)
}, 'itm_11111111111111111111111111111111',
    ${
  sqlLiteral(FIXTURE.games.one.id)
}, 'fixture.widget.one', 'business_product',
    'Fixture Widget One', 'finished_good', 'widget', true, false, true, 'active'),
  (${
  sqlLiteral(FIXTURE.games.two.gameItemId)
}, 'itm_22222222222222222222222222222222',
    ${
  sqlLiteral(FIXTURE.games.two.id)
}, 'fixture.widget.two', 'business_product',
    'Fixture Widget Two', 'finished_good', 'widget', true, false, true, 'active');

insert into public.store_items (
  id, game_session_id, item_key, name, category, price, currency_code,
  stock_quantity, status, visibility, game_item_id
) values
  (${sqlLiteral(FIXTURE.games.one.storeItemId)}, ${
  sqlLiteral(FIXTURE.games.one.id)
},
    'fixture_widget_one', 'Fixture Widget One', 'goods', 7.50, 'ECO', 0,
    'active', 'visible', ${sqlLiteral(FIXTURE.games.one.gameItemId)}),
  (${sqlLiteral(FIXTURE.games.two.storeItemId)}, ${
  sqlLiteral(FIXTURE.games.two.id)
},
    'fixture_widget_two', 'Fixture Widget Two', 'goods', 7.50, 'ECO', 0,
    'active', 'visible', ${sqlLiteral(FIXTURE.games.two.gameItemId)});

insert into public.store_seller_offers (
  id, public_key, game_session_id, store_item_id, game_item_id, seller_party_id,
  inventory_account_id, seller_kind, unit_price, currency_code, status,
  replenishment_policy, creation_idempotency_key, creation_request_hash,
  version, metadata
)
select fixture_row.offer_id, fixture_row.offer_key, fixture_row.game_id,
  fixture_row.store_item_id, fixture_row.game_item_id, party_row.id, null,
  'business', 7.50, 'ECO', 'draft', 'none', fixture_row.idempotency_key,
  repeat(fixture_row.hash_char, 64), 1, jsonb_build_object('fixture', 'phase10a3')
from (values
  (${sqlLiteral(FIXTURE.games.one.offerId)}::uuid, ${
  sqlLiteral(FIXTURE.games.one.offerKey)
},
    ${sqlLiteral(FIXTURE.games.one.id)}::uuid, ${
  sqlLiteral(FIXTURE.games.one.businessId)
}::uuid,
    ${sqlLiteral(FIXTURE.games.one.storeItemId)}::uuid, ${
  sqlLiteral(FIXTURE.games.one.gameItemId)
}::uuid,
    'phase10a3-offer-one', 'a'),
  (${sqlLiteral(FIXTURE.games.two.offerId)}::uuid, ${
  sqlLiteral(FIXTURE.games.two.offerKey)
},
    ${sqlLiteral(FIXTURE.games.two.id)}::uuid, ${
  sqlLiteral(FIXTURE.games.two.businessId)
}::uuid,
    ${sqlLiteral(FIXTURE.games.two.storeItemId)}::uuid, ${
  sqlLiteral(FIXTURE.games.two.gameItemId)
}::uuid,
    'phase10a3-offer-two', 'b')
) as fixture_row(offer_id, offer_key, game_id, business_id, store_item_id,
  game_item_id, idempotency_key, hash_char)
join public.economic_parties as party_row
  on party_row.game_session_id = fixture_row.game_id
  and party_row.business_id = fixture_row.business_id
  and party_row.party_kind = 'business';

do $fixture$
declare
  v_listing uuid;
  v_cash uuid;
begin
  v_listing := economy_private.ensure_business_store_listing_account_v2(
    ${sqlLiteral(FIXTURE.games.one.id)}, ${
  sqlLiteral(FIXTURE.games.one.businessId)
},
    ${sqlLiteral(FIXTURE.games.one.offerId)});
  update public.store_seller_offers set inventory_account_id = v_listing,
    status = 'active', version = 2 where id = ${
  sqlLiteral(FIXTURE.games.one.offerId)
};
  insert into public.inventory_holdings(game_session_id, inventory_account_id,
    game_item_id, quantity_owned, quantity_reserved, average_unit_cost,
    cost_currency_code, version)
  values (${sqlLiteral(FIXTURE.games.one.id)}, v_listing,
    ${sqlLiteral(FIXTURE.games.one.gameItemId)}, 10, 0, 2.5000, 'ECO', 1);
  v_cash := public.ensure_business_bank_account_v2(
    ${sqlLiteral(FIXTURE.games.one.id)}, ${
  sqlLiteral(FIXTURE.games.one.businessId)
});
  update public.account_balances set balance = 20 where id = v_cash;

  v_listing := economy_private.ensure_business_store_listing_account_v2(
    ${sqlLiteral(FIXTURE.games.two.id)}, ${
  sqlLiteral(FIXTURE.games.two.businessId)
},
    ${sqlLiteral(FIXTURE.games.two.offerId)});
  update public.store_seller_offers set inventory_account_id = v_listing,
    status = 'active', version = 2 where id = ${
  sqlLiteral(FIXTURE.games.two.offerId)
};
  insert into public.inventory_holdings(game_session_id, inventory_account_id,
    game_item_id, quantity_owned, quantity_reserved, average_unit_cost,
    cost_currency_code, version)
  values (${sqlLiteral(FIXTURE.games.two.id)}, v_listing,
    ${sqlLiteral(FIXTURE.games.two.gameItemId)}, 10, 0, 2.5000, 'ECO', 1);
  v_cash := public.ensure_business_bank_account_v2(
    ${sqlLiteral(FIXTURE.games.two.id)}, ${
  sqlLiteral(FIXTURE.games.two.businessId)
});
  update public.account_balances set balance = 20 where id = v_cash;
end
$fixture$;

update public.account_balances set balance = 100
where player_id in (
  ${sqlLiteral(FIXTURE.games.one.buyerOneId)}, ${
  sqlLiteral(FIXTURE.games.one.buyerTwoId)
},
  ${sqlLiteral(FIXTURE.games.two.buyerOneId)}, ${
  sqlLiteral(FIXTURE.games.two.buyerTwoId)
}
) and business_id is null and account_type = 'checking' and currency_code = 'ECO';
`;

export function resetFixture() {
  const existing = runJson(`select jsonb_build_object('count', count(*))::text
    from public.game_sessions
    where id in (${sqlLiteral(FIXTURE.games.one.id)}, ${sqlLiteral(FIXTURE.games.two.id)});`);
  if (existing.count !== 0) {
    throw new Error(
      "Phase 10A.3 fixture already exists; rebuild the disposable local database before rerunning.",
    );
  }
  runSql(`begin;\n${seedFixtureSql}\ncommit;`);
}

export function removeFixture() {
  throw new Error(
    "Fixture cleanup requires a disposable local database rebuild so immutable evidence is never bypassed.",
  );
}

export function createQuoteSql(
  game,
  buyerId = game.buyerOneId,
  idempotencyKey = `phase10a3-quote-${game.offerKey.slice(-4)}-${
    buyerId.slice(-2)
  }`,
  quantity = 2,
  expectedVersion = game.expectedOfferVersion,
) {
  return `begin; set local role service_role; select public.create_business_store_offer_quote_v2(` +
    `${sqlLiteral(game.id)}::uuid, ${sqlLiteral(buyerId)}::uuid, ` +
    `${sqlLiteral(game.offerKey)}, ${quantity}, ${expectedVersion}, ` +
    `${sqlLiteral(idempotencyKey)})::text; commit;`;
}

export function createQuote(game, options = {}) {
  return runJson(createQuoteSql(
    game,
    options.buyerId,
    options.idempotencyKey,
    options.quantity,
    options.expectedVersion,
  ));
}

export function settlementSql({
  game,
  quoteKey,
  buyerId = game.buyerOneId,
  quantity = 2,
  expectedVersion = game.expectedOfferVersion,
  idempotencyKey = `phase10a3-settle-${game.offerKey.slice(-4)}-${
    buyerId.slice(-2)
  }`,
}) {
  return `begin; set local role service_role; select public.settle_business_store_offer_v2(` +
    `${sqlLiteral(game.id)}::uuid, ${sqlLiteral(buyerId)}::uuid, ` +
    `${sqlLiteral(game.offerKey)}, ${sqlLiteral(quoteKey)}, ${quantity}, ` +
    `${expectedVersion}, ${sqlLiteral(idempotencyKey)})::text; commit;`;
}

export function settle(options) {
  return runJson(settlementSql(options));
}

function fullScopedRows(tableName, gameId, scopeColumn = "game_session_id") {
  return `(select coalesce(
    jsonb_agg(to_jsonb(row_data) order by row_data.id), '[]'::jsonb)
    from (select * from public.${tableName}
      where ${scopeColumn} = ${sqlLiteral(gameId)}::uuid) row_data)`;
}

export function snapshotSql(gameId) {
  const scopedTables = [
    "players",
    "player_country_assignments",
    "business_entities",
    "business_ownership_positions",
    "economic_parties",
    "inventory_accounts",
    "game_items",
    "store_items",
    "account_balances",
    "ledger_entries",
    "audit_log",
    "inventory_holdings",
    "inventory_transactions",
    "inventory_transaction_lines",
    "inventory_events",
    "business_activity_events",
    "store_offer_purchase_receipts",
    "store_offer_purchase_quotes",
    "store_seller_offers",
    "store_offer_withdrawal_requests",
    "store_purchase_quotes",
    "store_purchases",
    "mutation_idempotency_keys",
    "business_store_purchase_quotes",
    "business_store_purchases",
    "business_inventory",
    "business_sales",
  ];
  const entries = [
    `'game_sessions', ${fullScopedRows("game_sessions", gameId, "id")}`,
    ...scopedTables.map((tableName) =>
      `${sqlLiteral(tableName)}, ${fullScopedRows(tableName, gameId)}`
    ),
  ];
  return `select jsonb_build_object(\n    ${entries.join(",\n    ")}\n  )::text;`;
}

export function snapshot(gameId) {
  return runJson(snapshotSql(gameId));
}

export function openPsqlSession(applicationName) {
  const child = spawn("psql", PSQL_ARGS, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let errors = "";
  const waiters = new Set();
  const notify = () => {
    for (const waiter of waiters) {
      if (output.includes(waiter.marker) || errors.includes(waiter.marker)) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve({ output, errors });
      }
    }
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdin.on("error", (error) => {
    if (error?.code !== "EPIPE") {
      errors += redact(error?.message ?? error);
      notify();
    }
  });
  child.stdout.on("data", (chunk) => {
    output += chunk;
    notify();
  });
  child.stderr.on("data", (chunk) => {
    errors += redact(chunk);
    notify();
  });
  child.once("exit", (code, signal) => {
    notify();
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new Error(
          `psql exited before ${waiter.marker} (code ${code ?? "null"}, signal ${signal ?? "none"}): ${errors}`,
        ),
      );
    }
    waiters.clear();
  });
  const waitFor = (marker, timeoutMs = 15_000) =>
    new Promise((resolve, reject) => {
      if (output.includes(marker) || errors.includes(marker)) {
        resolve({ output, errors });
        return;
      }
      const waiter = { marker, resolve, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error(`Timed out waiting for ${marker}: ${errors}`));
      }, timeoutMs);
      waiters.add(waiter);
    });
  const write = (sql) => {
    if (child.exitCode !== null || child.killed || !child.stdin.writable) {
      throw new Error(
        `Cannot write to exited psql session ${applicationName}: ${errors}`,
      );
    }
    return child.stdin.write(`${sql}\n`);
  };
  write(String.raw`\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on
set application_name = ${sqlLiteral(applicationName)};
set statement_timeout = '30s';
set lock_timeout = '15s';
select 'SESSION_READY:' || pg_backend_pid();`);
  return {
    child,
    write,
    waitFor,
    get output() {
      return output;
    },
    get errors() {
      return errors;
    },
    close() {
      if (child.exitCode === null && !child.killed) {
        if (!child.stdin.destroyed && child.stdin.writable) {
          child.stdin.end("\\q\n");
        }
        setTimeout(() => child.kill("SIGTERM"), 1_000).unref();
      }
    },
  };
}

export async function pollForDatabaseWait(applicationName, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = runJson(`select jsonb_build_object(
      'pid', pid, 'state', state, 'waitEventType', wait_event_type,
      'waitEvent', wait_event
    )::text from pg_stat_activity
    where application_name = ${
      sqlLiteral(applicationName)
    } order by pid desc limit 1;`);
    if (state.waitEventType === "Lock") return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Session ${applicationName} did not enter a database Lock wait.`,
  );
}
