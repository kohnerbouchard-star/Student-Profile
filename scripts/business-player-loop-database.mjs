import assert from "node:assert/strict";
import { FIXTURE, runJson, runSql, sqlLiteral as lit } from "./business-phase10-atomic-settlement-database-support.mjs";

// Runs against the existing disposable two-game fixture. Every check rolls back,
// preserving its exact initial state for the permanent settlement acceptance.
export function verifyBusinessPlayerLoop() {
  const game = FIXTURE.games.one;
  const setup = `begin;
    update public.game_sessions set lifecycle_state = 'active', status = 'active' where id = ${lit(game.id)};
    insert into public.business_ownership_positions(game_session_id,business_id,player_id,ownership_kind,units,voting_units)
      values (${lit(game.id)},${lit(game.businessId)},${lit(game.ownerId)},'membership_interest',10000,10000)
      on conflict do nothing;
    update public.store_seller_offers set status = 'paused', version = version + 1 where id = ${lit(game.offerId)};`;
  const publish = (overrides = {}) => {
    const { gameId = game.id, playerId = game.ownerId, businessKey = game.businessKey, offerKey = game.offerKey,
      version = `(select version from public.store_seller_offers where id = ${lit(game.offerId)})`, key = "player-loop-publish-001" } = overrides;
    return `public.publish_owned_business_store_offer_v1(${lit(gameId)}::uuid,${lit(playerId)}::uuid,${lit(businessKey)},${lit(offerKey)},${version},${lit(key)})`;
  };
  const fail = (label, mutation, expression, expected) => {
    runSql(`${setup}${mutation}
      do $test$ begin
        begin
          perform ${expression};
          raise exception 'EXPECTED_REJECTION_MISSING';
        exception when others then
          if sqlerrm <> ${lit(expected)} then raise; end if;
        end;
      end $test$; rollback;`);
    console.log(`ok - player loop ${label}`);
  };
  const proof = runJson(`${setup}
    do $test$ declare first jsonb; replay jsonb; v bigint; begin
      select version into v from public.store_seller_offers where id = ${lit(game.offerId)};
      first := ${publish({ version: "v" })};
      replay := ${publish({ version: "v" })};
      if first->>'status' <> 'active' or (first->>'replayed')::boolean or not (replay->>'replayed')::boolean
        or first->>'version' <> replay->>'version' then raise exception 'PUBLICATION_REPLAY_FAILED'; end if;
      begin
        perform ${publish({ version: "v + 1" })};
        raise exception 'EXPECTED_REJECTION_MISSING';
      exception when others then if sqlerrm <> 'IDEMPOTENCY_KEY_CONFLICT' then raise; end if; end;
    end $test$;
    select public.read_owned_business_player_loop_options_v1(${lit(game.id)},${lit(game.ownerId)})::text;
    rollback;`);
  assert.ok(Array.isArray(proof.availableEquipment));
  assert.ok(Array.isArray(proof.saleableStoreItems));
  assert.equal(JSON.stringify(proof).includes(game.businessId), false);
  console.log("ok - player loop publication commits once, replays and rejects conflicting intent; scoped options execute");
  fail("wrong owner rejected", "", publish({ playerId: game.buyerOneId }), "BUSINESS_NOT_FOUND");
  fail("cross-game actor rejected", "", publish({ playerId: FIXTURE.games.two.ownerId }), "PLAYER_NOT_FOUND");
  fail("cross-business rejected", "", publish({ businessKey: FIXTURE.games.two.businessKey }), "BUSINESS_NOT_FOUND");
  fail("cross-game offer rejected", "", publish({ offerKey: FIXTURE.games.two.offerKey }), "STORE_SELLER_OFFER_NOT_FOUND");
  fail("stale version rejected", "", publish({ version: "999999" }), "STORE_SELLER_OFFER_VERSION_CONFLICT");
  fail("empty listing rejected", `update public.inventory_holdings set quantity_owned = 0 where game_session_id = ${lit(game.id)} and inventory_account_id = (select inventory_account_id from public.store_seller_offers where id = ${lit(game.offerId)});`, publish(), "BUSINESS_OFFER_PUBLISH_STOCK_UNAVAILABLE");
  fail("inactive player rejected", `update public.players set status = 'archived' where id = ${lit(game.ownerId)};`, publish(), "PLAYER_NOT_FOUND");
  fail("inactive game rejected", `update public.game_sessions set lifecycle_state = 'paused', status = 'disabled' where id = ${lit(game.id)};`, publish(), "GAME_SESSION_NOT_ACTIVE");
  fail("pending withdrawal rejected", `select public.request_business_store_offer_withdrawal_v2(${lit(game.id)},${lit(game.businessKey)},${lit(game.offerKey)},'full',null,(select version from public.store_seller_offers where id = ${lit(game.offerId)}),'player-loop-withdraw-001');`, publish(), "BUSINESS_OFFER_PUBLISH_STATUS_INVALID");
  const privileges = runJson(`select jsonb_build_object('anon',has_function_privilege('anon','public.publish_owned_business_store_offer_v1(uuid,uuid,text,text,bigint,text)','execute'),'authenticated',has_function_privilege('authenticated','public.read_owned_business_player_loop_options_v1(uuid,uuid)','execute'),'service',has_function_privilege('service_role','public.publish_owned_business_store_offer_v1(uuid,uuid,text,text,bigint,text)','execute'))::text;`);
  assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });
  verifyOwnedCommands(game, setup, fail);
}

function verifyOwnedCommands(game, setup, fail) {
  const actor = (player = game.ownerId) => `${lit(game.id)}::uuid,${lit(player)}::uuid,${lit(game.businessKey)}`;
  const equipmentKey = `eqp_${"8".repeat(32)}`;
  const commands = {
    install: (player) => `public.install_owned_business_equipment_v3(${actor(player)},${lit(equipmentKey)},'loop-install-001')`,
    create: (player) => `public.create_owned_business_store_offer_draft_v1(${actor(player)},'loop_fixture_widget',12.50,'loop-create-001')`,
    stock: (player) => `public.stock_owned_business_store_offer_v1(${actor(player)},${lit(game.offerKey)},1,2,'loop-stock-001')`,
  };
  for (const [name, command] of Object.entries(commands)) {
    fail(`${name} wrong owner`, "", command(game.buyerOneId), "BUSINESS_NOT_FOUND");
    fail(`${name} inactive actor`, `update public.players set status='archived' where id=${lit(game.ownerId)};`, command(), "PLAYER_NOT_FOUND");
    fail(`${name} inactive game`, `update public.game_sessions set lifecycle_state='paused',status='disabled' where id=${lit(game.id)};`, command(), "GAME_SESSION_NOT_ACTIVE");
    fail(`${name} cross-game actor`, "", command(FIXTURE.games.two.ownerId), "PLAYER_NOT_FOUND");
  }
  for (const signature of [
    "public.install_owned_business_equipment_v3(uuid,uuid,text,text,text)",
    "public.create_owned_business_store_offer_draft_v1(uuid,uuid,text,text,numeric,text)",
    "public.stock_owned_business_store_offer_v1(uuid,uuid,text,text,integer,bigint,text)",
  ]) {
    assert.deepEqual(runJson(`select jsonb_build_object(
      'anon',has_function_privilege('anon',${lit(signature)},'execute'),
      'authenticated',has_function_privilege('authenticated',${lit(signature)},'execute'),
      'service',has_function_privilege('service_role',${lit(signature)},'execute'))::text;`),
    { anon: false, authenticated: false, service: true });
  }

  // Seed additional canonical assets only inside this rolled-back fixture. The
  // business_inventory trigger creates the matching canonical holding; commands
  // below must preserve that projection and transfer its exact cost basis.
  const result = runJson(`${setup}
    do $test$
    declare item uuid; machine uuid; pack uuid; definition public.physical_economy_item_definitions%rowtype;
      warehouse uuid; equipment text; installed jsonb; installed_again jsonb;
      options jsonb; draft jsonb; replay jsonb; stocked jsonb; published jsonb;
      offer text; draft_version bigint; stock_version bigint;
    begin
      insert into public.game_items(game_session_id,canonical_key,source_kind,name,item_class,subtype,stackable,serialized,transferable,status)
        values(${lit(game.id)},'loop.fixture.widget','business_product','Loop Fixture Widget','finished_good','widget',true,false,true,'active') returning id into item;
      insert into public.store_items(game_session_id,item_key,name,category,price,currency_code,stock_quantity,status,visibility,game_item_id)
        values(${lit(game.id)},'loop_fixture_widget','Loop Fixture Widget','goods',12.50,'ECO',0,'active','visible',item);
      insert into public.business_products(game_session_id,business_id,name,category,status,unit_price,reference_price,unit_input_cost,unit_labor_cost,product_kind,output_game_item_id)
        values(${lit(game.id)},${lit(game.businessId)},'Loop Fixture Widget','finished_goods','active',12.50,12.50,2.50,0,'physical_good',item);
      insert into public.business_inventory(game_session_id,business_id,item_key,inventory_kind,quantity,unit_cost,game_item_id)
        values(${lit(game.id)},${lit(game.businessId)},'loop.fixture.widget','finished_good',6,2.50,item);

      insert into public.physical_economy_content_packs(pack_key,schema_version,content_version,content_digest,source_commit,status)
        values('loop_pr926_fixture','1.0','fixture',repeat('a',64),repeat('b',40),'active') returning id into pack;
      insert into public.physical_economy_item_definitions(pack_id,item_key,name,item_class,currency_code,stackable,equipment_slot,tool_tags,status)
        values(pack,'loop_fixture_machine','Loop Fixture Machine','equipment','ECO',false,'operations',array['manufacture'],'active') returning * into definition;
      insert into public.game_items(game_session_id,canonical_key,source_kind,physical_item_definition_id,name,item_class,subtype,stackable,serialized,transferable,status)
        values(${lit(game.id)},'loop.fixture.machine','physical_pack',definition.id,'Loop Fixture Machine','equipment','machine',false,true,true,'active') returning id into machine;
      warehouse := economy_private.ensure_business_inventory_account_v2(${lit(game.id)},${lit(game.businessId)},'warehouse');
      insert into public.inventory_holdings(game_session_id,inventory_account_id,game_item_id,quantity_owned,quantity_reserved,average_unit_cost,cost_currency_code)
        values(${lit(game.id)},warehouse,machine,1,0,10,'ECO');
      insert into public.equipment_instances(public_id,game_session_id,player_id,store_item_id,item_key,inventory_account_id,game_item_id,status)
        values(${lit(equipmentKey)},${lit(game.id)},null,null,'loop.fixture.machine',warehouse,machine,'active') returning public_id into equipment;
      options := public.read_owned_business_player_loop_options_v1(${lit(game.id)},${lit(game.ownerId)});
      if not exists(select 1 from jsonb_array_elements(options->'availableEquipment') e where e->>'equipmentKey'=equipment)
        or not exists(select 1 from jsonb_array_elements(options->'saleableStoreItems') s
          where s->>'itemKey'='loop_fixture_widget' and s->>'catalogItemKey'=(select public_key from public.game_items where id=item))
      then raise exception 'LOOP_OPTIONS_CANONICAL_ROWS_MISSING'; end if;
      installed := public.install_owned_business_equipment_v3(${actor()},equipment,'loop-install-001');
      installed_again := public.install_owned_business_equipment_v3(${actor()},equipment,'loop-install-001');
      if installed->>'replayed' is distinct from 'false' or installed_again->>'replayed' is distinct from 'true'
        then raise exception 'LOOP_INSTALL_REPLAY_FAILED'; end if;
      options := public.read_owned_business_player_loop_options_v1(${lit(game.id)},${lit(game.ownerId)});
      if exists(select 1 from jsonb_array_elements(options->'availableEquipment') e where e->>'equipmentKey'=equipment)
        then raise exception 'LOOP_INSTALLED_EQUIPMENT_STILL_OFFERED'; end if;

      draft := ${commands.create()};
      replay := ${commands.create()};
      if draft->>'status' is distinct from 'draft' or draft->>'alreadyCreated' is distinct from 'false'
        or replay->>'alreadyCreated' is distinct from 'true' or draft->>'offerKey' is distinct from replay->>'offerKey'
        then raise exception 'LOOP_DRAFT_REPLAY_FAILED'; end if;
      offer := draft->>'offerKey'; draft_version := (draft->>'version')::bigint;
      stocked := public.stock_owned_business_store_offer_v1(${actor()},offer,4,draft_version,'loop-stock-001');
      replay := public.stock_owned_business_store_offer_v1(${actor()},offer,4,draft_version,'loop-stock-001');
      if stocked->>'replayed' is distinct from 'false' or replay->>'replayed' is distinct from 'true'
        or (stocked->>'listedQuantity')::numeric <> 4 or stocked->>'offerVersion' is distinct from replay->>'offerVersion'
        then raise exception 'LOOP_STOCK_REPLAY_FAILED'; end if;
      stock_version := (stocked->>'offerVersion')::bigint;
      published := public.publish_owned_business_store_offer_v1(${actor()},offer,stock_version,'loop-publish-001');
      replay := public.publish_owned_business_store_offer_v1(${actor()},offer,stock_version,'loop-publish-001');
      if published->>'status' is distinct from 'active' or published->>'replayed' is distinct from 'false'
        or replay->>'replayed' is distinct from 'true' or published->>'version' is distinct from replay->>'version'
        then raise exception 'LOOP_PUBLISH_REPLAY_FAILED'; end if;
      if not exists(select 1 from public.business_inventory i join public.inventory_holdings h
        on h.game_session_id=i.game_session_id and h.inventory_account_id=i.inventory_account_id and h.game_item_id=i.game_item_id
        where i.game_session_id=${lit(game.id)} and i.business_id=${lit(game.businessId)} and i.game_item_id=item
          and i.quantity=2 and h.quantity_owned=2 and i.total_cost_basis=5 and h.average_unit_cost=2.50)
        or not exists(select 1 from public.store_seller_offers o join public.inventory_holdings h
          on h.game_session_id=o.game_session_id and h.inventory_account_id=o.inventory_account_id and h.game_item_id=o.game_item_id
          where o.public_key=offer and o.status='active' and h.quantity_owned=4 and h.quantity_reserved=0 and h.average_unit_cost=2.50)
        or (select count(*) from public.inventory_transactions where game_session_id=${lit(game.id)}
          and source_domain='business_store' and source_action='stock_offer' and idempotency_key='loop-stock-001') <> 1
        then raise exception 'LOOP_CANONICAL_STOCK_OR_COST_NOT_CONSERVED'; end if;
    end $test$;
    select jsonb_build_object('canonicalLoop',true)::text;
    rollback;`);
  assert.deepEqual(result, { canonicalLoop: true });
  console.log("ok - player loop canonical options, equipment install, draft, stock, publish and exact replays preserve stock/cost");
}
