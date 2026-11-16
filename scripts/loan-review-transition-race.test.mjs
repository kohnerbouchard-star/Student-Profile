import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { bindLoanDatabase } from "./loan-review-transition-binding.mjs";
import { fixture,call,helpers,assertApproval,snapshot } from "./loan-review-transition-fixtures.mjs";

// Only committed synthetic fixtures in this attested disposable stack survive
// individual sessions; the workflow removes its own stack after every outcome.
function session(args) {
 const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"]});
 let output="",error="",closed=false,code;
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 child.on('close',c=>{closed=true;code=c;});
 child.on('error',e=>{error+=e.message;closed=true;code=-1;});
 return {
  write: text=>child.stdin.write(text+'\n'),
  rows:()=>output.split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l)),
  async wait(marker) {
   const deadline=Date.now()+15000;
   while(!output.includes(marker)) {
    if(closed) throw new Error(`psql exited ${code}: ${error}`);
    if(Date.now()>deadline) throw new Error(`psql marker timeout ${marker}: ${error}`);
    await new Promise(r=>setTimeout(r,25));
   }
  },
  async finish() {child.stdin.end();const deadline=Date.now()+15000;while(!closed){if(Date.now()>deadline)throw new Error('owned psql exit timeout');await new Promise(r=>setTimeout(r,25));}assert.equal(code,0,error);},
  abort(){if(!closed&&!child.stdin.writableEnded)child.stdin.end('rollback;\n\\q\n');},
 };
}
const cases=[
 ['approve','approve','commit',true],['approve','approve','commit',false],
 ['approve','decline','commit',false],['decline','approve','commit',false],
 ['approve','approve','rollback',false],['decline','approve','rollback',false],
];
for(const [firstDecision,secondDecision,end,sameKey] of cases) test(`real approval contention: ${firstDecision}/${secondDecision}, ${end}, ${sameKey?'same':'different'} keys`,async()=>{
 const {sql,args}=bindLoanDatabase();
 const f=fixture(),other=fixture();
 sql(`begin; ${f.setup} ${other.setup} commit;`);
 const before=sql(snapshot(f));
 const a=session(args),b=session(args);
 const identity="select json_build_object('pid',pid,'backend_start',backend_start) from pg_stat_activity where pid=pg_backend_pid();";
 const request=(decision,key)=>`select row_to_json(r) from public.review_player_loan_application_v1('${f.game}','${f.staff}','${f.appKey}','${decision}','Synthetic concurrent review','${key}') r;`;
 try {
  // A executes the ACTUAL review and holds all its effects uncommitted.
  a.write(`begin; set local statement_timeout='20s'; set local lock_timeout='10s'; ${identity} set local role service_role; ${request(firstDecision,'synthetic-review-first')}\n\\echo OWNER_REVIEW_STAGED`);
  await a.wait('OWNER_REVIEW_STAGED');
  const owner=a.rows()[0];assert(Number.isInteger(owner.pid));assert(owner.backend_start);
  b.write(`begin; set local statement_timeout='20s'; set local lock_timeout='10s'; ${identity}\n\\echo WAITER_IDENTIFIED\nset local role service_role; ${request(secondDecision,sameKey?'synthetic-review-first':'synthetic-review-second')} commit;\n\\echo WAITER_DONE`);
  await b.wait('WAITER_IDENTIFIED');
  const waiter=b.rows()[0];assert(Number.isInteger(waiter.pid));assert.notEqual(waiter.pid,owner.pid);
  let observed;const deadline=Date.now()+5000;
  while(Date.now()<deadline){
   const row=JSON.parse(sql(`select json_build_object('pid',pid,'backend_start',backend_start,'wait',wait_event_type,'blockers',pg_blocking_pids(pid)) from pg_stat_activity where pid=${waiter.pid};`));
   if(row?.wait==='Lock'&&row.blockers.includes(owner.pid)){observed=row;break;}
   await new Promise(r=>setTimeout(r,25));
  }
  assert(observed,'B actual review must block behind A actual review');
  assert.equal(observed.backend_start,waiter.backend_start);
  const currentOwner=JSON.parse(sql(`select json_build_object('pid',pid,'backend_start',backend_start) from pg_stat_activity where pid=${owner.pid};`));
  assert.deepEqual(currentOwner,owner,'Blocker PID and backend_start identity unchanged');
  assert.equal(b.rows().length,1,'Blocked B must not return a review result');
  assert.equal(sql(snapshot(f)),before,'No staged A effects visible before commit');
  console.log(JSON.stringify({owner,waiter,observed,firstDecision,secondDecision,end,sameKey}));
  // Different game completes its own actual review while A still holds this row.
  sql(`begin; set local role service_role; ${call(other)}; commit;`);
  sql(`begin; ${helpers} ${assertApproval(other)} rollback;`);
  const otherAfter=sql(snapshot(other));
  a.write(`${end};\n\\echo OWNER_DONE`);
  await Promise.all([a.wait('OWNER_DONE'),b.wait('WAITER_DONE')]);
  await Promise.all([a.finish(),b.finish()]);
  const first=a.rows()[1],second=b.rows()[1];
  assert.equal(first.replayed,false);assert.equal(second.replayed,end==='commit');
  const winner=end==='commit'?firstDecision:secondDecision;
  assert.equal(first.status,firstDecision==='approve'?'approved':'declined');
  assert.equal(second.status,winner==='approve'?'approved':'declined');
  if(end==='commit')assert.equal(first.loan_key,second.loan_key);
  if(winner==='approve')sql(`begin; ${helpers} ${assertApproval(f)} rollback;`);
  else sql(`begin; ${helpers}
   select pg_temp.check_loan((select status='declined' from public.loan_applications where id='${f.app}'),'decline winner');
   select pg_temp.check_loan(not exists(select 1 from public.player_loans where application_id='${f.app}') and not exists(select 1 from public.bank_transactions where game_session_id='${f.game}') and not exists(select 1 from public.ledger_entries where game_session_id='${f.game}'),'decline no economics');
   select pg_temp.check_loan((select count(*)=1 from public.audit_log where game_session_id='${f.game}' and action='loan.application.decline'),'one decline audit'); rollback;`);
  assert.equal(sql(snapshot(other)),otherAfter,'Releasing A must not alter the independently completed other game');
  const durable=sql(snapshot(f));sql(`${call(f,'approve','synthetic-after-race')};`);
  assert.equal(sql(snapshot(f)),durable,'Post-race replay has no durable effects');
 } finally {a.abort();b.abort();}
});
