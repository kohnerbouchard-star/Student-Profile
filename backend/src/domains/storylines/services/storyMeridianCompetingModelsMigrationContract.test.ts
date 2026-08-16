export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};
const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090100_seed_meridian_competing_models_v1.sql",
  import.meta.url,
);

Deno.test("Stage 2 exposes four real Meridian models before the fracture", async () => {
  const sql=await Deno.readTextFile(MIGRATION);
  for (const required of [
    "meridian_competing_models",
    "43200",
    "64800",
    "130",
    "131",
    "finance-first",
    "multilateral-governance",
    "trade-and-logistics",
    "industrial-security",
    "meridian_competing_models_visible_v1",
    "meridian_governance_selection_status_v1",
    "meridian_model_choice_not_global_vote_v1",
    "contract.meridian.compare-financing-governance.v1",
    "sovereignFinanceNotPlayerBanking",
    "hybridNotAutomaticallySuperior",
  ]) assertIncludes(sql,required);
  assertEquals(countOccurrences(sql,'"countryCode":'),10);
  assertEquals(countOccurrences(sql,"'type','contract_unlock'"),1);
});

Deno.test("Stage 2 recommendation completion returns without controlling the world", async () => {
  const sql=await Deno.readTextFile(MIGRATION);
  assertIncludes(sql,"'type','player_completed_contract'");
  assertIncludes(sql,"_competing_models_recommendation_recorded");
  assertIncludes(sql,"_competing_models_recommendation_open");
  assertIncludes(sql,"jsonb_build_object(\n              'not',jsonb_build_object(\n                'type','player_completed_contract'");
  assertIncludes(sql,"recommendationIsAdvisory");
  assertIncludes(sql,"noSessionLevelSupportMutation");
  assertNotIncludes(sql,"world_route_state_change");
  assertNotIncludes(sql,"world_location_state_change");
  assertNotIncludes(sql,"immigration_lock");
  assertNotIncludes(sql,"market_status_change");
  assertNotIncludes(sql,"approvedOutcome','finance");
  assertEquals(firstNonblank(sql),"begin;");
  assertEquals(lastNonblank(sql),"commit;");
});

Deno.test("Stage 2 keeps financing and governance analytically distinct", async () => {
  const sql=(await Deno.readTextFile(MIGRATION)).toLowerCase();
  assertIncludes(sql,"financingandgovernancearedistinct");
  assertIncludes(sql,"funding source");
  assertIncludes(sql,"decision authority");
  assertIncludes(sql,"one accepted cost");
  assertIncludes(sql,"two safeguards");
  assertIncludes(sql,"no model has been approved");
  assertNotIncludes(sql,"best model");
  assertNotIncludes(sql,"morally superior");
});
function countOccurrences(value:string,needle:string):number{return value.split(needle).length-1;}
function firstNonblank(value:string):string{return value.split(/\r?\n/).map(l=>l.trim().toLowerCase()).find(Boolean)??"";}
function lastNonblank(value:string):string{return value.split(/\r?\n/).map(l=>l.trim().toLowerCase()).filter(Boolean).at(-1)??"";}
function assertIncludes(value:string,expected:string):void{if(!value.includes(expected))throw new Error(`Missing contract: ${expected}`);}
function assertNotIncludes(value:string,unexpected:string):void{if(value.includes(unexpected))throw new Error(`Unexpected contract: ${unexpected}`);}
function assertEquals(actual:unknown,expected:unknown):void{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);}
