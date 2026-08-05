declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../supabase/migrations/20260805023228_admin_local_application_mutations_v1.sql",
  import.meta.url,
);

Deno.test("Admin local mutation migration is private, transactional, and replay safe", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  assert(sql.startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));

  for (
    const fragment of [
      "create table private.admin_mutation_requests",
      "unique (staff_user_id, idempotency_key)",
      "alter table private.admin_mutation_requests force row level security",
      "revoke all on table private.admin_mutation_requests",
      "from public, anon, authenticated, service_role",
      "private.assert_admin_game_owned_v1",
      "owner_staff_user_id = p_staff_user_id",
      "private.admin_mutation_fingerprint_v1",
      "'gamesessionid', p_game_session_id",
      "'operation', p_operation",
      "'payload', p_request_payload",
      "pg_advisory_xact_lock",
      "admin_mutation_idempotency_conflict",
      "admin_mutation_idempotency_in_progress",
      "insert into public.audit_log",
      "status = 'completed'",
    ]
  ) includes(sql, fragment);

  for (
    const rpc of [
      "admin_read_mutation_replay_v1",
      "admin_create_player_v1",
      "admin_archive_player_v1",
      "admin_mutate_store_item_v1",
      "admin_mutate_contract_v1",
      "admin_record_attendance_v1",
      "admin_update_game_settings_v1",
      "admin_rotate_game_join_code_v1",
    ]
  ) {
    includes(sql, `create or replace function public.${rpc}`);
    includes(sql, `grant execute on function public.${rpc}`);
  }

  assert(
    !sql.includes("grant execute on function public.admin_create_player_v1") ||
      sql.includes("to service_role;"),
  );
  assert(!sql.includes("to authenticated;"));
  assert(!sql.includes("service_role token"));
});

Deno.test("Admin Player credentials and Staff attendance retain modern identity boundaries", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (
    const fragment of [
      "p_lookup_digest text",
      "p_credential_version text",
      "p_credential_salt text",
      "p_credential_verifier text",
      "p_credential_iterations integer",
      "set_player_identity_and_access_credential_v2",
      "private.record_attendance_clock_in_core_v1",
      "'staff_user'",
      "'admin_api_local_staff_attendance_scan'",
      "'attendance.staff_scan'",
    ]
  ) includes(sql, fragment);

  assert(!sql.includes("p_access_code_hash"));
  assert(!sql.includes("accesscode',"));
  assert(!sql.includes("studentcode',"));
});

Deno.test("Admin attendance and attendance-day locks share one transaction lock", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (
    const fragment of [
      "create or replace function private.lock_attendance_day_mutation_v1",
      "create or replace function private.lock_attendance_day_mutation_trigger_v1",
      "'admin-attendance-day:' || p_game_session_id::text || ':' || p_attendance_date::text",
      "create trigger serialize_attendance_day_mutations_v1",
      "before insert or update or delete on public.attendance_day_locks",
      "execute function private.lock_attendance_day_mutation_trigger_v1()",
      "revoke all on function private.lock_attendance_day_mutation_v1(uuid, date)",
      "revoke all on function private.lock_attendance_day_mutation_trigger_v1()",
    ]
  ) includes(sql, fragment);

  const attendanceStart = sql.indexOf(
    "create or replace function public.admin_record_attendance_v1",
  );
  const attendanceEnd = sql.indexOf(
    "create or replace function public.admin_update_game_settings_v1",
    attendanceStart,
  );
  const attendanceSql = sql.slice(attendanceStart, attendanceEnd);
  const transactionLock = attendanceSql.indexOf(
    "perform private.lock_attendance_day_mutation_v1",
  );
  const dayLockRead = attendanceSql.indexOf(
    "from public.attendance_day_locks",
  );
  assert(attendanceStart >= 0 && attendanceEnd > attendanceStart);
  assert(transactionLock >= 0 && transactionLock < dayLockRead);
});

Deno.test("Compatibility mutations share the same atomic ledger conventions", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (
    const fragment of [
      "'players.archive'",
      "'create', 'update', 'archive', 'restock', 'rebalance'",
      "stock_quantity = item_row.stock_quantity +",
      "'quantityadded', (v_payload->>'quantity')::integer",
      "'create', 'publish', 'archive', 'duplicate'",
      "left(coalesce(nullif(v_existing_contract.contract_key, ''), 'contract'), 42)",
      "left(encode(extensions.digest(convert_to(p_idempotency_key, 'utf8'), 'sha256'), 'hex'), 16)",
    ]
  ) includes(sql, fragment);
});

function includes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected migration contract fragment: ${expected}`);
  }
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed");
}
