import assert from "node:assert/strict";
import { businessPlayerManufacturingRaceFixtureSql } from "./business-player-manufacturing-database.mjs";

// Must run after the serial harness assertions and before its normal database
// reset. Committed fixtures are necessary for separate PostgreSQL sessions.
export async function verifyBusinessPlayerManufacturingConcurrency({ game, runSql, runJson, openPsqlSession, pollForDatabaseWait }) {
  const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
  runSql(businessPlayerManufacturingRaceFixtureSql(game));
  const product = runJson(`select to_jsonb(public_key)::text from public.business_products where game_session_id=${lit(game.id)} and business_id=${lit(game.businessId)} and name='Loop Manufactured Output';`);
  const ledgerBefore = runJson(`select to_jsonb(count(*))::text from public.ledger_entries where game_session_id=${lit(game.id)};`);
  const sessions = [];
  const open = async (name) => {
    const session = openPsqlSession(name);
    sessions.push(session);
    await session.waitFor("SESSION_READY:");
    session.takeOutput();
    return session;
  };
  const command = (quantity, key) => `select public.start_player_business_manufacturing_job_v2(${lit(game.id)},${lit(game.ownerId)},${lit(game.businessKey)},${lit(product)},${quantity},'standard',${lit(key)})::text;`;
  const race = async (name, left, right) => {
    const gate = await open(`mfg_gate_${name}`);
    const firstName = `mfg_first_${name}`, secondName = `mfg_second_${name}`;
    const first = await open(firstName), second = await open(secondName);
    try {
      gate.write(`begin; select id from public.business_entities where game_session_id=${lit(game.id)} and id=${lit(game.businessId)} for no key update; select 'GATE_LOCKED';`);
      await gate.waitFor("GATE_LOCKED");
      first.write(`${command(...left)} select 'FIRST_DONE';`);
      await pollForDatabaseWait(firstName);
      second.write(`${command(...right)} select 'SECOND_DONE';`);
      await pollForDatabaseWait(secondName);
      // Both starts must request the final exclusive Business lock immediately.
      // This assertion rejects the old shared-lock-then-upgrade implementation,
      // even if a particular scheduler run happens not to choose a deadlock victim.
      const modes = runJson(`select coalesce(jsonb_agg(l.mode),'[]'::jsonb)::text from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name in (${lit(firstName)},${lit(secondName)}) and l.locktype='tuple' and l.relation='public.business_entities'::regclass;`);
      assert.ok(modes.length > 0, "starts must be blocked at the Business row");
      assert.ok(modes.every((mode) => mode === "AccessExclusiveLock"), `unexpected shared Business lock before start: ${modes}`);
      gate.write("commit; select 'GATE_RELEASED';");
      await gate.waitFor("GATE_RELEASED");
      await Promise.all([first.waitFor("FIRST_DONE"), second.waitFor("SECOND_DONE")]);
      assert.equal(first.errors, ""); assert.equal(second.errors, "");
      const result = [first, second].map((session) => {
        const rows = session.takeOutput().split(/\r?\n/u).filter((line) => line.startsWith("{"));
        assert.equal(rows.length, 1);
        return JSON.parse(rows[0]);
      });
      gate.close(); first.close(); second.close();
      return result;
    } catch (error) {
      const diagnostics = [["gate", gate], [firstName, first], [secondName, second]]
        .map(([label, session]) => `${label}: stderr=${session.errors || "<empty>"}; stdout=${session.takeOutput() || "<empty>"}`)
        .join("\n");
      throw new Error(`Manufacturing ${name} race failed: ${error.message}\n${diagnostics}`, { cause: error });
    }
  };
  try {
    const same = await race("same", [1, "loop-manufacturing-race-same"], [1, "loop-manufacturing-race-same"]);
    assert.equal(same[0].jobKey, same[1].jobKey);
    assert.deepEqual(same.map((row) => row.replayed).sort(), [false, true]);
    const distinct = await race("distinct", [2, "loop-manufacturing-race-two"], [3, "loop-manufacturing-race-three"]);
    assert.notEqual(distinct[0].jobKey, distinct[1].jobKey);
    assert.deepEqual(distinct.map((row) => row.replayed), [false, false]);
    const proof = runJson(`select jsonb_build_object(
      'jobs',(select count(*) from public.business_manufacturing_jobs where game_session_id=${lit(game.id)} and product_id=(select id from public.business_products where public_key=${lit(product)})),
      'minutes',(select sum(r.reserved_minutes) from public.business_labor_reservations r join public.business_manufacturing_jobs j on j.id=r.manufacturing_job_id where j.game_session_id=${lit(game.id)} and j.product_id=(select id from public.business_products where public_key=${lit(product)})),
      'holds',(select count(*) from public.business_labor_reservations r join public.business_manufacturing_jobs j on j.id=r.manufacturing_job_id where j.game_session_id=${lit(game.id)} and j.product_id=(select id from public.business_products where public_key=${lit(product)})),
      'postings',(select count(*) from public.inventory_transactions t join public.business_manufacturing_jobs j on j.id=t.source_id where j.game_session_id=${lit(game.id)} and j.product_id=(select id from public.business_products where public_key=${lit(product)}) and t.source_action='manufacturing_material_staged' and t.status='committed'),
      'events',(select count(*) from public.inventory_events e join public.business_manufacturing_jobs j on j.id=e.source_id where j.game_session_id=${lit(game.id)} and j.product_id=(select id from public.business_products where public_key=${lit(product)}) and e.source_action='manufacturing_material_staged'),
      'warehouse',(select h.quantity_owned from public.inventory_holdings h join public.game_items i on i.id=h.game_item_id join public.inventory_accounts a on a.id=h.inventory_account_id where i.game_session_id=${lit(game.id)} and i.canonical_key='loop_manufacturing_material' and a.account_kind='warehouse'),
      'reserved',(select h.quantity_reserved from public.inventory_holdings h join public.game_items i on i.id=h.game_item_id join public.inventory_accounts a on a.id=h.inventory_account_id where i.game_session_id=${lit(game.id)} and i.canonical_key='loop_manufacturing_material' and a.account_kind='warehouse'),
      'ledger',(select count(*) from public.ledger_entries where game_session_id=${lit(game.id)})
    )::text;`);
    assert.deepEqual(proof, { jobs: 3, minutes: 30, holds: 3, postings: 3, events: 6, warehouse: 12, reserved: 2, ledger: ledgerBefore });
    console.log("ok - concurrent same/distinct manufacturing starts acquire exclusive authority first, serialize without deadlock and commit exact holds/postings once");
  } finally {
    for (const session of sessions) session.close();
  }
}
