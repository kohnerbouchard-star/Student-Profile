export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const PATH = "supabase/migrations/20260721143100_harden_marketplace_table_return_conflicts_v1.sql";

Deno.test("Marketplace table-returning functions use bounded function-local conflict hardening", async () => {
  const sql = await Deno.readTextFile(PATH);
  for (const required of [
    "#variable_conflict use_column",
    "pg_get_function_result(p.oid) like 'TABLE%'",
    "p.proname like '%marketplace%'",
    "v_count <> 16",
    "pg_get_function_identity_arguments",
  ]) {
    if (!sql.includes(required)) throw new Error(`Missing table-return conflict contract: ${required}`);
  }
  if (/alter\s+database/i.test(sql)) throw new Error("Conflict hardening must remain function-local.");
});
