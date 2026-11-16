// Uses the permanent disposable Business fixture; every change is rolled back.
// The caller supplies the existing guarded local psql runner, never a new connection.
export function businessPlayerManufacturingSql(game) {
  const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const g = lit(game.id), b = lit(game.businessId), p = lit(game.ownerId), key = lit(game.businessKey);
  return `begin;
    update public.game_sessions set lifecycle_state='active',status='active' where id=${g};
    insert into public.business_ownership_positions(game_session_id,business_id,player_id,ownership_kind,units,voting_units)
      values(${g},${b},${p},'membership_interest',10000,10000) on conflict do nothing;
    create temporary table manufacturing_loop_proof(job_id uuid, job_key text, product_key text, output_id uuid, input_id uuid, employee_id uuid, workforce_role uuid, warehouse_id uuid) on commit drop;
    do $fixture$
    declare pack uuid; recipe uuid; input_item uuid; output_item uuid; product text; role_id uuid; candidate uuid; employee uuid; warehouse uuid; job jsonb; replay jsonb; before_replay jsonb;
    begin
      insert into public.physical_economy_content_packs(pack_key,schema_version,content_version,content_digest,source_commit,status)
        values('loop_manufacturing_fixture','1.0','fixture',repeat('c',64),repeat('d',40),'active') returning id into pack;
      insert into public.physical_economy_recipe_definitions(pack_id,recipe_key,name,category,tier,workshop_tier,base_duration_seconds,difficulty_profile,status)
        values(pack,'recipe.loop_manufacturing_fixture','Loop Manufacturing','manufacturing',1,1,1,'standard','active') returning id into recipe;
      insert into public.physical_economy_recipe_inputs(recipe_id,line_key,item_key,base_quantity,scaling_class)
        values(recipe,'material','loop_manufacturing_material',3,'fixed');
      insert into public.physical_economy_recipe_outputs(recipe_id,line_key,item_key,quantity,output_kind)
        values(recipe,'output','loop_manufacturing_output',3,'stackable');
      insert into public.game_session_recipe_availability(game_session_id,recipe_id,enabled) values(${g},recipe,true);
      insert into public.business_recipe_access(game_session_id,business_id,recipe_id,source_type) values(${g},${b},recipe,'staff');
      insert into public.game_items(game_session_id,canonical_key,source_kind,name,item_class,subtype,stackable,serialized,transferable,status)
        values(${g},'loop_manufacturing_material','business_product','Loop Material','material','material',true,false,true,'active') returning id into input_item;
      insert into public.game_items(game_session_id,canonical_key,source_kind,name,item_class,subtype,stackable,serialized,transferable,status)
        values(${g},'loop_manufacturing_output','business_product','Loop Output','finished_good','widget',true,false,true,'active') returning id into output_item;
      insert into public.game_session_physical_economy_packs(game_session_id,pack_id,status) values(${g},pack,'active');
      insert into public.business_products(game_session_id,business_id,name,category,status,unit_price,reference_price,unit_input_cost,unit_labor_cost,product_kind,output_game_item_id)
        values(${g},${b},'Loop Manufactured Output','finished_goods','active',12,12,6,0,'physical_good',output_item) returning public_key into product;
      insert into public.business_inventory(game_session_id,business_id,item_key,inventory_kind,quantity,unit_cost,game_item_id)
        values(${g},${b},'loop_manufacturing_material','input',9,2,input_item);
      warehouse := economy_private.ensure_business_inventory_account_v2(${g},${b},'warehouse');
      update public.inventory_holdings set quantity_reserved=2 where game_session_id=${g} and inventory_account_id=warehouse and game_item_id=input_item;
      perform economy_private.ensure_business_inventory_account_v2(${g},${b},'work_in_progress');
      perform economy_private.ensure_business_inventory_account_v2(${g},${b},'finished_goods');
      insert into public.business_workforce_role_definitions(role_key,display_name,labor_class,default_labor_minutes_per_cycle,status)
        values('workforce.loop_manufacturing_fixture','Loop Operator','production',60,'active') returning id into role_id;
      insert into public.business_recipe_labor_requirements(recipe_definition_id,role_definition_id,labor_minutes_per_unit,minimum_headcount,status)
        values(recipe,role_id,5,1,'active');
      insert into public.business_workforce_candidates(game_session_id,role_definition_id,display_label,country_code,currency_code,wage_per_cycle,labor_minutes_per_cycle,skill_basis_points,source_type,source_key,request_hash,status)
        values(${g},role_id,'Loop Operator','TST','ECO',60,60,10000,'admin_seed','loop.manufacturing.fixture',repeat('e',64),'hired') returning id into candidate;
      insert into public.business_employees(game_session_id,business_id,role_name,wage_per_cycle,workforce_candidate_id,workforce_role_definition_id,labor_minutes_per_cycle,skill_basis_points,workforce_source_type)
        values(${g},${b},'Loop Operator',60,candidate,role_id,60,10000,'candidate_v2') returning id into employee;
      begin
        perform public.start_player_business_manufacturing_job_v2(${g},${lit(game.buyerOneId)},${key},product,1,'standard','loop-manufacturing-wrong-owner');
        raise exception 'EXPECTED_OWNER_REJECTION_MISSING';
      exception when others then if sqlerrm <> 'BUSINESS_NOT_FOUND' then raise; end if; end;
      begin
        update public.business_employees set labor_minutes_per_cycle=1 where id=employee;
        perform public.start_player_business_manufacturing_job_v2(${g},${p},${key},product,1,'standard','loop-manufacturing-no-labor');
        raise exception 'EXPECTED_LABOR_REJECTION_MISSING';
      exception when others then if sqlerrm <> 'BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE' then raise; end if; end;
      select public.start_player_business_manufacturing_job_v2(${g},${p},${key},product,1,'standard','loop-manufacturing-start-001') into job;
      before_replay := jsonb_build_object('events',(select count(*) from public.inventory_events where game_session_id=${g}),'postings',(select count(*) from public.inventory_transactions where game_session_id=${g}),'ledger',(select count(*) from public.ledger_entries where game_session_id=${g}));
      select public.start_player_business_manufacturing_job_v2(${g},${p},${key},product,1,'standard','loop-manufacturing-start-001') into replay;
      if before_replay is distinct from jsonb_build_object('events',(select count(*) from public.inventory_events where game_session_id=${g}),'postings',(select count(*) from public.inventory_transactions where game_session_id=${g}),'ledger',(select count(*) from public.ledger_entries where game_session_id=${g})) then raise exception 'LOOP_MANUFACTURING_START_REPLAY_WROTE_EVIDENCE'; end if;
      if (job->>'replayed')::boolean or not (replay->>'replayed')::boolean or job->>'jobKey' is distinct from replay->>'jobKey' then raise exception 'LOOP_MANUFACTURING_START_REPLAY_FAILED'; end if;
      begin
        perform public.start_player_business_manufacturing_job_v2(${g},${p},${key},product,2,'standard','loop-manufacturing-start-001');
        raise exception 'EXPECTED_IDEMPOTENCY_REJECTION_MISSING';
      exception when others then if sqlerrm <> 'BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT' then raise; end if; end;
      insert into manufacturing_loop_proof select id,public_key,product,output_item,input_item,employee,role_id,warehouse from public.business_manufacturing_jobs where public_key=job->>'jobKey';
      if not exists(select 1 from public.business_labor_reservations r join manufacturing_loop_proof proof on proof.job_id=r.manufacturing_job_id
        where r.game_session_id=${g} and r.business_id=${b} and r.employee_id=employee and r.role_definition_id=role_id and r.reserved_minutes=5
          and r.status='reserved' and r.reservation_kind='production_job' and r.source_reference_key like 'manufacturing:%')
        or (select count(*) from public.business_labor_reservations r join manufacturing_loop_proof proof on proof.job_id=r.manufacturing_job_id)<>1
        then raise exception 'LOOP_MANUFACTURING_LABOR_HOLD_INVALID'; end if;
      if not exists(select 1 from public.inventory_holdings h where h.game_session_id=${g} and h.inventory_account_id=warehouse and h.game_item_id=input_item and h.quantity_owned=6 and h.quantity_reserved=2)
        then raise exception 'LOOP_MANUFACTURING_MATERIAL_NOT_STAGED'; end if;
      perform * from public.start_queued_business_manufacturing_jobs_v2(${g},25);
      if exists(select 1 from public.claim_due_business_manufacturing_jobs_v2(${g},10,90)) then raise exception 'LOOP_MANUFACTURING_CLAIMED_BEFORE_DUE'; end if;
    end $fixture$;
    select pg_sleep(1.2);
    do $completion$
    declare claim record; result record; replay record; proof manufacturing_loop_proof%rowtype; draft jsonb; stocked jsonb; published jsonb; before_replay jsonb; quote jsonb; sale jsonb; sale_replay jsonb; buyer_before numeric; seller_before numeric; seller_account uuid;
    begin
      select * into proof from manufacturing_loop_proof;
      select * into claim from public.claim_due_business_manufacturing_jobs_v2(${g},10,90) where job_id=proof.job_id;
      if claim.job_id is null or claim.completion_attempt_count<>1 then raise exception 'LOOP_MANUFACTURING_CLAIM_MISSING'; end if;
      begin
        perform public.complete_business_manufacturing_job_v2(${g},claim.job_id,gen_random_uuid());
        raise exception 'EXPECTED_LEASE_REJECTION_MISSING';
      exception when others then if sqlerrm <> 'BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID' then raise; end if; end;
      select * into result from public.complete_business_manufacturing_job_v2(${g},claim.job_id,claim.lease_token);
      before_replay := jsonb_build_object('events',(select count(*) from public.inventory_events where game_session_id=${g}),'postings',(select count(*) from public.inventory_transactions where game_session_id=${g}),'ledger',(select count(*) from public.ledger_entries where game_session_id=${g}));
      select * into replay from public.complete_business_manufacturing_job_v2(${g},claim.job_id,claim.lease_token);
      if before_replay is distinct from jsonb_build_object('events',(select count(*) from public.inventory_events where game_session_id=${g}),'postings',(select count(*) from public.inventory_transactions where game_session_id=${g}),'ledger',(select count(*) from public.ledger_entries where game_session_id=${g})) then raise exception 'LOOP_MANUFACTURING_COMPLETION_REPLAY_WROTE_EVIDENCE'; end if;
      if result.replayed or not replay.replayed or result.output_quantity<>3 or result.material_cost_basis<>6 or result.labor_cost_basis<>5
        or result.total_cost_basis<>11 or result.finished_unit_cost<>3.666667 or result.status<>'completed'
        then raise exception 'LOOP_MANUFACTURING_COMPLETION_COST_OR_REPLAY_INVALID'; end if;
      if not exists(select 1 from public.business_labor_reservations where manufacturing_job_id=proof.job_id and status='consumed' and reserved_minutes=5)
        or not exists(select 1 from public.business_manufacturing_job_materials where job_id=proof.job_id and status='consumed' and staged_quantity=3)
        or (select count(*) from public.business_manufacturing_completion_receipts where job_id=proof.job_id)<>1
        then raise exception 'LOOP_MANUFACTURING_RESOURCES_NOT_CONSUMED_ONCE'; end if;
      if not exists(select 1 from public.business_inventory i join public.inventory_holdings h on h.inventory_account_id=i.inventory_account_id and h.game_item_id=i.game_item_id and h.game_session_id=i.game_session_id
        where i.game_session_id=${g} and i.business_id=${b} and i.game_item_id=proof.output_id and i.quantity=3 and h.quantity_owned=3 and i.total_cost_basis=11.0001 and i.unit_cost=h.average_unit_cost and h.average_unit_cost=3.6667)
        then raise exception 'LOOP_MANUFACTURING_FINISHED_GOODS_NOT_PROJECTED'; end if;
      insert into public.store_items(game_session_id,item_key,name,category,price,currency_code,stock_quantity,status,visibility,game_item_id)
        values(${g},'loop_manufacturing_output','Loop Manufactured Output','goods',12,'ECO',0,'active','visible',proof.output_id);
      draft := public.create_owned_business_store_offer_draft_v1(${g},${p},${key},'loop_manufacturing_output',12,'loop-manufacturing-offer-001');
      stocked := public.stock_owned_business_store_offer_v1(${g},${p},${key},draft->>'offerKey',3,(draft->>'version')::bigint,'loop-manufacturing-stock-001');
      published := public.publish_owned_business_store_offer_v1(${g},${p},${key},draft->>'offerKey',(stocked->>'offerVersion')::bigint,'loop-manufacturing-publish-001');
      if published->>'status'<>'active' or not exists(select 1 from public.store_seller_offers o join public.inventory_holdings h on h.inventory_account_id=o.inventory_account_id and h.game_item_id=o.game_item_id and h.game_session_id=o.game_session_id
        where o.public_key=draft->>'offerKey' and h.quantity_owned=3 and h.average_unit_cost=3.6667)
        then raise exception 'LOOP_MANUFACTURING_OUTPUT_NOT_SALE_READY'; end if;
      select balance into buyer_before from public.account_balances where game_session_id=${g} and player_id=${lit(game.buyerOneId)} and business_id is null and account_type='checking' and currency_code='ECO';
      select balance,bank_account_id into seller_before,seller_account from public.account_balances where game_session_id=${g} and business_id=${b} and currency_code='ECO';
      if buyer_before is null or seller_before is null or not exists(select 1 from public.bank_accounts where id=seller_account and account_kind='checking' and status='active')
        then raise exception 'LOOP_MANUFACTURING_CHECKING_ACCOUNTS_MISSING'; end if;
      quote := public.create_business_store_offer_quote_v2(${g},${lit(game.buyerOneId)},draft->>'offerKey',1,(published->>'version')::bigint,'loop-manufacturing-quote-001');
      sale := public.settle_business_store_offer_v2(${g},${lit(game.buyerOneId)},draft->>'offerKey',quote->>'quoteKey',1,(published->>'version')::bigint,'loop-manufacturing-sale-001');
      if sale->>'replayed' is distinct from 'false' or (sale->>'quantity')::integer<>1
        or (sale->>'buyerDebit')::numeric<>12 or (sale->>'businessCredit')::numeric<>12
        or (sale->>'sourceUnitCost')::numeric<>3.6667 or (sale->>'costOfGoodsSold')::numeric<>3.6667
        or (sale->>'remainingListedQuantity')::integer<>2
        then raise exception 'LOOP_MANUFACTURING_SALE_RECEIPT_INVALID'; end if;
      if (select balance from public.account_balances where game_session_id=${g} and player_id=${lit(game.buyerOneId)} and business_id is null and account_type='checking' and currency_code='ECO') is distinct from buyer_before-12
        or (select balance from public.account_balances where game_session_id=${g} and bank_account_id=seller_account) is distinct from seller_before+12
        or not exists(select 1 from public.store_offer_purchase_receipts r join public.ledger_entries debit on debit.id=r.buyer_debit_ledger_entry_id
          join public.ledger_entries credit on credit.id=r.business_credit_ledger_entry_id
          join public.inventory_transactions posting on posting.id=r.inventory_transaction_id and posting.status='committed'
          where r.game_session_id=${g} and r.public_key=sale->>'receiptKey' and r.business_id=${b} and r.quantity=1 and r.cost_of_goods_sold=3.6667)
        then raise exception 'LOOP_MANUFACTURING_SALE_CASH_OR_COMMITTED_EVIDENCE_INVALID'; end if;
      before_replay := jsonb_build_object('events',(select count(*) from public.inventory_events where game_session_id=${g}),'postings',(select count(*) from public.inventory_transactions where game_session_id=${g}),'ledger',(select count(*) from public.ledger_entries where game_session_id=${g}),'receipts',(select count(*) from public.store_offer_purchase_receipts where game_session_id=${g}));
      sale_replay := public.settle_business_store_offer_v2(${g},${lit(game.buyerOneId)},draft->>'offerKey',quote->>'quoteKey',1,(published->>'version')::bigint,'loop-manufacturing-sale-001');
      if sale_replay->>'replayed' is distinct from 'true' or (sale_replay-'replayed') is distinct from (sale-'replayed')
        or before_replay is distinct from jsonb_build_object('events',(select count(*) from public.inventory_events where game_session_id=${g}),'postings',(select count(*) from public.inventory_transactions where game_session_id=${g}),'ledger',(select count(*) from public.ledger_entries where game_session_id=${g}),'receipts',(select count(*) from public.store_offer_purchase_receipts where game_session_id=${g}))
        then raise exception 'LOOP_MANUFACTURING_SALE_REPLAY_MUTATED_EVIDENCE'; end if;
      if not exists(select 1 from public.store_seller_offers o join public.inventory_holdings h on h.inventory_account_id=o.inventory_account_id and h.game_item_id=o.game_item_id and h.game_session_id=o.game_session_id
        where o.public_key=draft->>'offerKey' and h.quantity_owned=2 and h.average_unit_cost=3.6667)
        or (select balance from public.account_balances where game_session_id=${g} and player_id=${lit(game.buyerOneId)} and business_id is null and account_type='checking' and currency_code='ECO') is distinct from buyer_before-12
        or (select balance from public.account_balances where game_session_id=${g} and bank_account_id=seller_account) is distinct from seller_before+12
        then raise exception 'LOOP_MANUFACTURING_SALE_REPLAY_CHANGED_STOCK_OR_CASH'; end if;
    end $completion$;
    rollback;`;
}

export function verifyBusinessPlayerManufacturing({ game, runSql }) {
  runSql(businessPlayerManufacturingSql(game));
  console.log("ok - real timed manufacturing reserves material/labor, claims after due, completes once, conserves cost, stocks output and settles buyer/seller Checking exactly once");
}

// Cross-session races need a committed setup, unlike the serial rollback proof.
// Reuse exactly its canonical setup but omit every command and assertion.
export function businessPlayerManufacturingRaceFixtureSql(game) {
  const sql = businessPlayerManufacturingSql(game);
  const boundary = "      begin\n        perform public.start_player_business_manufacturing_job_v2";
  const index = sql.indexOf(boundary);
  if (index < 0) throw new Error("Manufacturing fixture boundary missing");
  return sql.slice(0, index).replace("'input',9,2,input_item", "'input',30,2,input_item") + "    end $fixture$;\n    commit;";
}
