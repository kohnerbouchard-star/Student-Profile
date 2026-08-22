from __future__ import annotations

from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: pattern did not match exactly once: {pattern}")
    write(path, updated)


MIGRATION = r'''
-- Business V2 Phase 4B: public candidate pools and server-owned hiring.
--
-- The browser chooses one candidate public key. Role, wage, skill, labor
-- capacity, country, currency, contract terms, and productivity are copied from
-- trusted candidate authority inside one transaction. Payroll settlement and
-- production-labor integration remain outside this checkpoint.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_workforce_candidates
  add column if not exists contract_type text not null default 'cycle';

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_workforce_candidates_contract_type_valid'
      and conrelid = 'public.business_workforce_candidates'::regclass
  ) then
    alter table public.business_workforce_candidates
      add constraint business_workforce_candidates_contract_type_valid
      check (contract_type in ('cycle', 'permanent'));
  end if;
end
$block$;

create unique index if not exists
  business_employees_candidate_player_active_unique
on public.business_employees (
  game_session_id,
  business_id,
  employee_player_id
)
where employee_player_id is not null
  and status = 'active'
  and workforce_source_type = 'candidate_v2';

create or replace function public.read_owned_business_workforce_candidates_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_business public.business_entities%rowtype;
  v_candidates jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.owner_player_id = p_player_id
    and business_row.status <> 'closed'
  order by business_row.created_at asc
  limit 1;

  if not found then
    return jsonb_build_object(
      'businessKey', '',
      'generatedAt', v_now,
      'candidates', '[]'::jsonb
    );
  end if;

  if exists (
    select 1
    from public.business_entities as other_business
    where other_business.game_session_id = p_game_session_id
      and other_business.owner_player_id = p_player_id
      and other_business.status <> 'closed'
      and other_business.id <> v_business.id
  ) then
    raise exception 'BUSINESS_OWNERSHIP_AMBIGUOUS' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'candidateKey', candidate_row.public_key,
        'roleKey', role_row.role_key,
        'roleName', role_row.display_name,
        'laborClass', role_row.labor_class,
        'displayLabel', candidate_row.display_label,
        'countryCode', candidate_row.country_code,
        'currencyCode', candidate_row.currency_code,
        'wagePerCycle', candidate_row.wage_per_cycle,
        'laborMinutesPerCycle', candidate_row.labor_minutes_per_cycle,
        'skillBasisPoints', candidate_row.skill_basis_points,
        'productivityIndex', 1,
        'contractType', candidate_row.contract_type,
        'availabilityEndsAt', candidate_row.availability_ends_at,
        'version', candidate_row.version
      )
      order by
        role_row.display_name asc,
        candidate_row.wage_per_cycle asc,
        candidate_row.display_label asc,
        candidate_row.public_key asc
    ),
    '[]'::jsonb
  )
  into v_candidates
  from public.business_workforce_candidates as candidate_row
  join public.business_workforce_role_definitions as role_row
    on role_row.id = candidate_row.role_definition_id
  where candidate_row.game_session_id = p_game_session_id
    and candidate_row.status = 'available'
    and candidate_row.availability_starts_at <= v_now
    and (
      candidate_row.availability_ends_at is null
      or candidate_row.availability_ends_at > v_now
    )
    and candidate_row.country_code = v_business.country_code
    and candidate_row.currency_code = v_business.currency_code
    and role_row.status = 'active';

  return jsonb_build_object(
    'businessKey', v_business.public_key,
    'generatedAt', v_now,
    'candidates', v_candidates
  );
end
$function$;

create or replace function public.hire_business_workforce_candidate_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_candidate_key text,
  p_idempotency_key text
)
returns table (
  business_key text,
  employee_key text,
  candidate_key text,
  workforce_role_key text,
  role_name text,
  contract_type text,
  wage_per_cycle numeric,
  currency_code text,
  labor_minutes_per_cycle integer,
  skill_basis_points integer,
  productivity_index numeric,
  employee_status text,
  hired_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_business public.business_entities%rowtype;
  v_candidate public.business_workforce_candidates%rowtype;
  v_role public.business_workforce_role_definitions%rowtype;
  v_employee public.business_employees%rowtype;
  v_request_hash text;
  v_replay_metadata jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_business_key is null
    or lower(btrim(p_business_key)) !~ '^biz_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_KEY_INVALID' using errcode = 'P0001';
  end if;
  if p_candidate_key is null
    or lower(btrim(p_candidate_key)) !~ '^wfc_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_idempotency_key is null
    or length(btrim(p_idempotency_key)) not between 8 and 160
  then
    raise exception 'IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.owner_player_id = p_player_id
    and business_row.status in ('active', 'restructuring')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    digest(
      concat_ws(
        '|',
        p_game_session_id::text,
        p_player_id::text,
        v_business.public_key,
        lower(btrim(p_candidate_key))
      ),
      'sha256'
    ),
    'hex'
  );

  select audit_row.metadata
  into v_replay_metadata
  from public.audit_log as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.actor_id = p_player_id
    and audit_row.action = 'business.workforce.candidate.hire'
    and audit_row.target_id = v_business.id
    and audit_row.metadata->>'idempotencyKey' = btrim(p_idempotency_key)
  order by audit_row.created_at desc
  limit 1;

  if found then
    if v_replay_metadata->>'requestHash' <> v_request_hash
      or v_replay_metadata->>'candidateKey'
        <> lower(btrim(p_candidate_key))
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;

    select employee_row.*
    into v_employee
    from public.business_employees as employee_row
    where employee_row.game_session_id = p_game_session_id
      and employee_row.business_id = v_business.id
      and employee_row.public_key = v_replay_metadata->>'employeeKey';
    if not found then
      raise exception 'BUSINESS_WORKFORCE_HIRE_REPLAY_MISSING'
        using errcode = 'P0001';
    end if;

    select candidate_row.*
    into v_candidate
    from public.business_workforce_candidates as candidate_row
    where candidate_row.id = v_employee.workforce_candidate_id;
    select role_row.*
    into v_role
    from public.business_workforce_role_definitions as role_row
    where role_row.id = v_employee.workforce_role_definition_id;

    return query select
      v_business.public_key,
      v_employee.public_key,
      v_candidate.public_key,
      v_role.role_key,
      v_employee.role_name,
      v_employee.contract_type,
      v_employee.wage_per_cycle,
      v_candidate.currency_code,
      v_employee.labor_minutes_per_cycle,
      v_employee.skill_basis_points,
      v_employee.productivity_index,
      v_employee.status,
      v_employee.hired_at,
      true;
    return;
  end if;

  select candidate_row.*
  into v_candidate
  from public.business_workforce_candidates as candidate_row
  where candidate_row.game_session_id = p_game_session_id
    and candidate_row.public_key = lower(btrim(p_candidate_key))
  for update;
  if not found then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_candidate.status <> 'available' then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_NOT_AVAILABLE'
      using errcode = 'P0001';
  end if;
  if v_candidate.availability_starts_at > v_now
    or (
      v_candidate.availability_ends_at is not null
      and v_candidate.availability_ends_at <= v_now
    )
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_EXPIRED'
      using errcode = 'P0001';
  end if;
  if v_candidate.country_code <> v_business.country_code then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_COUNTRY_MISMATCH'
      using errcode = 'P0001';
  end if;
  if v_candidate.currency_code <> v_business.currency_code then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;
  if v_candidate.candidate_player_id = p_player_id then
    raise exception 'BUSINESS_OWNER_CANNOT_HIRE_SELF'
      using errcode = 'P0001';
  end if;

  select role_row.*
  into v_role
  from public.business_workforce_role_definitions as role_row
  where role_row.id = v_candidate.role_definition_id
    and role_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_WORKFORCE_ROLE_NOT_ACTIVE'
      using errcode = 'P0001';
  end if;

  if v_candidate.candidate_player_id is not null
    and exists (
      select 1
      from public.business_employees as employee_row
      where employee_row.game_session_id = p_game_session_id
        and employee_row.business_id = v_business.id
        and employee_row.employee_player_id = v_candidate.candidate_player_id
        and employee_row.status = 'active'
        and employee_row.workforce_source_type = 'candidate_v2'
    )
  then
    raise exception 'BUSINESS_WORKFORCE_PLAYER_ALREADY_EMPLOYED'
      using errcode = 'P0001';
  end if;

  update public.business_workforce_candidates
  set
    status = 'reserved',
    version = version + 1,
    updated_at = v_now
  where id = v_candidate.id
    and status = 'available';
  if not found then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_NOT_AVAILABLE'
      using errcode = 'P0001';
  end if;

  insert into public.business_employees (
    game_session_id,
    business_id,
    employee_player_id,
    role_name,
    contract_type,
    wage_per_cycle,
    productivity_index,
    status,
    workforce_candidate_id,
    workforce_role_definition_id,
    labor_minutes_per_cycle,
    skill_basis_points,
    workforce_source_type,
    workforce_version
  ) values (
    p_game_session_id,
    v_business.id,
    v_candidate.candidate_player_id,
    v_role.display_name,
    v_candidate.contract_type,
    v_candidate.wage_per_cycle,
    1,
    'active',
    v_candidate.id,
    v_role.id,
    v_candidate.labor_minutes_per_cycle,
    v_candidate.skill_basis_points,
    'candidate_v2',
    1
  )
  returning * into v_employee;

  update public.business_workforce_candidates
  set
    status = 'hired',
    metadata = metadata || jsonb_build_object(
      'hiredBusinessKey', v_business.public_key,
      'hiredEmployeeKey', v_employee.public_key,
      'hiredAt', v_now
    ),
    version = version + 1,
    updated_at = v_now
  where id = v_candidate.id
  returning * into v_candidate;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.workforce.candidate.hire',
    'business',
    v_business.id,
    jsonb_build_object(
      'idempotencyKey', btrim(p_idempotency_key),
      'requestHash', v_request_hash,
      'businessKey', v_business.public_key,
      'candidateKey', v_candidate.public_key,
      'employeeKey', v_employee.public_key,
      'roleKey', v_role.role_key,
      'roleName', v_role.display_name,
      'contractType', v_candidate.contract_type,
      'wagePerCycle', v_candidate.wage_per_cycle,
      'currencyCode', v_candidate.currency_code,
      'laborMinutesPerCycle', v_candidate.labor_minutes_per_cycle,
      'skillBasisPoints', v_candidate.skill_basis_points,
      'productivityIndex', 1
    )
  );

  return query select
    v_business.public_key,
    v_employee.public_key,
    v_candidate.public_key,
    v_role.role_key,
    v_employee.role_name,
    v_employee.contract_type,
    v_employee.wage_per_cycle,
    v_candidate.currency_code,
    v_employee.labor_minutes_per_cycle,
    v_employee.skill_basis_points,
    v_employee.productivity_index,
    v_employee.status,
    v_employee.hired_at,
    false;
exception
  when unique_violation then
    raise exception 'BUSINESS_WORKFORCE_HIRE_CONFLICT'
      using errcode = 'P0001';
end
$function$;

revoke all on function public.read_owned_business_workforce_candidates_v2(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.read_owned_business_workforce_candidates_v2(
  uuid, uuid
) to service_role;

revoke all on function public.hire_business_workforce_candidate_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.hire_business_workforce_candidate_v2(
  uuid, uuid, text, text, text
) to service_role;

comment on function public.read_owned_business_workforce_candidates_v2(
  uuid, uuid
) is
  'Returns a public-key-only candidate pool for the Player-owned Business, filtered by Business country and currency.';
comment on function public.hire_business_workforce_candidate_v2(
  uuid, uuid, text, text, text
) is
  'Atomically locks and hires one trusted workforce candidate without accepting browser-authored labor economics.';

commit;
'''

PARSER = r'''
import {
  type BusinessCandidateHireReceiptDto,
  type BusinessWorkforceCandidateDto,
  type BusinessWorkforceSnapshotDto,
  PlayerBusinessError,
} from "../../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;

export function parseBusinessWorkforceSnapshot(
  value: unknown,
): BusinessWorkforceSnapshotDto {
  const row = record(value, "Business workforce result is invalid.");
  const candidates = Array.isArray(row.candidates) ? row.candidates : [];
  return {
    businessKey: text(row.businessKey),
    generatedAt: text(row.generatedAt),
    candidates: candidates.map(parseCandidate),
  };
}

export function parseBusinessCandidateHireReceipt(
  value: unknown,
): BusinessCandidateHireReceiptDto {
  const row = record(value, "Business workforce hire result is invalid.");
  return {
    businessKey: key(row.business_key, "biz"),
    employeeKey: key(row.employee_key, "emp"),
    candidateKey: key(row.candidate_key, "wfc"),
    roleKey: text(row.workforce_role_key),
    roleName: text(row.role_name),
    contractType: text(row.contract_type),
    wagePerCycle: number(row.wage_per_cycle),
    currencyCode: text(row.currency_code).toUpperCase(),
    laborMinutesPerCycle: integer(row.labor_minutes_per_cycle),
    skillBasisPoints: integer(row.skill_basis_points),
    productivityIndex: number(row.productivity_index, 1),
    status: text(row.employee_status),
    hiredAt: text(row.hired_at),
    replayed: Boolean(row.replayed),
  };
}

function parseCandidate(value: unknown): BusinessWorkforceCandidateDto {
  const row = record(value, "Business workforce candidate is invalid.");
  return {
    candidateKey: key(row.candidateKey, "wfc"),
    roleKey: text(row.roleKey),
    roleName: text(row.roleName),
    laborClass: text(row.laborClass),
    displayLabel: text(row.displayLabel),
    countryCode: text(row.countryCode).toUpperCase(),
    currencyCode: text(row.currencyCode).toUpperCase(),
    wagePerCycle: number(row.wagePerCycle),
    laborMinutesPerCycle: integer(row.laborMinutesPerCycle),
    skillBasisPoints: integer(row.skillBasisPoints),
    productivityIndex: number(row.productivityIndex, 1),
    contractType: text(row.contractType),
    availabilityEndsAt: nullableText(row.availabilityEndsAt),
    version: integer(row.version, 1),
  };
}

function record(value: unknown, message: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(message);
  }
  return value as Row;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value: unknown, fallback = 0): number {
  return Math.trunc(number(value, fallback));
}

function key(value: unknown, prefix: string): string {
  const result = text(value).toLowerCase();
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) {
    throw invalid(`Business workforce ${prefix} key is invalid.`);
  }
  return result;
}

function invalid(message: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_workforce_result_invalid",
    message,
    500,
  );
}
'''

WORKFORCE_API = r'''
import {
  type BusinessCandidateHireReceiptDto,
  type BusinessWorkforceSnapshotDto,
  type PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";
import { parseBusinessCandidateHireReceipt } from "../application/workforce/businessWorkforceResultParser.ts";
import {
  readIdempotencyKey,
  readKey,
} from "./playerBusinessRequestValidation.ts";

type Scope = {
  readonly gameSessionId: string;
  readonly playerId: string;
};

export async function readBusinessWorkforceCandidates(
  repository: PlayerBusinessRepository,
  scope: Scope,
): Promise<BusinessWorkforceSnapshotDto> {
  return repository.readWorkforceCandidates(scope);
}

export async function hireBusinessWorkforceCandidate(
  repository: PlayerBusinessRepository,
  scope: Scope,
  candidateKey: string,
  body: Record<string, unknown>,
): Promise<BusinessCandidateHireReceiptDto> {
  const result = await repository.execute(
    "hire_business_workforce_candidate_v2",
    {
      p_game_session_id: scope.gameSessionId,
      p_player_id: scope.playerId,
      p_business_key: readKey(body.businessKey, "businessKey", "biz"),
      p_candidate_key: candidateKey,
      p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
    },
  );
  return parseBusinessCandidateHireReceipt(result);
}
'''

TEST = r'''
import { assert, assertEquals } from "jsr:@std/assert@1";
import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import { readPlayerBusinessRoutePath } from "./playerBusinessRoutePaths.ts";
import type {
  BusinessWorkforceSnapshotDto,
  PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";

const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const CANDIDATE_KEY = `wfc_${"b".repeat(32)}`;
const EMPLOYEE_KEY = `emp_${"c".repeat(32)}`;

Deno.test("Phase 4B routes expose candidates and candidate-only hiring", () => {
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/workforce/candidates"),
    { kind: "businessRead", resource: "workforceCandidates" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/workforce/candidates/${CANDIDATE_KEY}/hire`,
    ),
    { kind: "businessCandidateHire", candidateKey: CANDIDATE_KEY },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/employees/hire"),
    { kind: "businessHire" },
  );
});

Deno.test("Phase 4B returns a public candidate pool", async () => {
  const workforce: BusinessWorkforceSnapshotDto = {
    businessKey: BUSINESS_KEY,
    generatedAt: "2026-08-22T00:00:00.000Z",
    candidates: [{
      candidateKey: CANDIDATE_KEY,
      roleKey: "workforce.production.operator",
      roleName: "Production Operator",
      laborClass: "production",
      displayLabel: "Candidate 17",
      countryCode: "NVA",
      currencyCode: "NVC",
      wagePerCycle: 125,
      laborMinutesPerCycle: 2400,
      skillBasisPoints: 6200,
      productivityIndex: 1,
      contractType: "cycle",
      availabilityEndsAt: null,
      version: 1,
    }],
  };
  const repository = fakeRepository(workforce);
  const response = await request(
    "/players/me/business/workforce/candidates",
    "GET",
    undefined,
    repository,
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body, workforce);
  assert(!JSON.stringify(body).includes("00000000-"));
});

Deno.test("Phase 4B hiring forwards only candidate intent and server scope", async () => {
  let command = "";
  let args: Record<string, unknown> = {};
  const repository = fakeRepository(undefined, (nextCommand, nextArgs) => {
    command = nextCommand;
    args = { ...nextArgs };
    return {
      business_key: BUSINESS_KEY,
      employee_key: EMPLOYEE_KEY,
      candidate_key: CANDIDATE_KEY,
      workforce_role_key: "workforce.production.operator",
      role_name: "Production Operator",
      contract_type: "cycle",
      wage_per_cycle: 125,
      currency_code: "NVC",
      labor_minutes_per_cycle: 2400,
      skill_basis_points: 6200,
      productivity_index: 1,
      employee_status: "active",
      hired_at: "2026-08-22T00:00:00.000Z",
      replayed: false,
    };
  });
  const response = await request(
    `/players/me/business/workforce/candidates/${CANDIDATE_KEY}/hire`,
    "POST",
    { businessKey: BUSINESS_KEY, idempotencyKey: "phase4b-hire-001" },
    repository,
  );
  assertEquals(response.status, 200);
  assertEquals(command, "hire_business_workforce_candidate_v2");
  assertEquals(args, {
    p_game_session_id: "game-scope",
    p_player_id: "player-scope",
    p_business_key: BUSINESS_KEY,
    p_candidate_key: CANDIDATE_KEY,
    p_idempotency_key: "phase4b-hire-001",
  });
  const body = await response.json();
  assertEquals(body.receipt.employeeKey, EMPLOYEE_KEY);
  assertEquals(body.receipt.wagePerCycle, 125);
  assertEquals(body.receipt.productivityIndex, 1);
});

Deno.test("legacy free-text hiring is authenticated compatibility-only 410", async () => {
  let executed = false;
  const repository = fakeRepository(undefined, () => {
    executed = true;
    return {};
  });
  const response = await request(
    "/players/me/business/employees/hire",
    "POST",
    {
      businessKey: BUSINESS_KEY,
      employeePlayerIdentifier: "P-102",
      role: "Player-authored role",
      contractType: "cycle",
      wagePerCycle: 999,
      productivityIndex: 3,
      idempotencyKey: "legacy-hire-001",
    },
    repository,
  );
  assertEquals(response.status, 410);
  assertEquals((await response.json()).code, "business_legacy_hiring_retired");
  assertEquals(executed, false);
});

function fakeRepository(
  workforce?: BusinessWorkforceSnapshotDto,
  execute?: (
    command: string,
    args: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>,
): PlayerBusinessRepository {
  return {
    readBusiness: () => Promise.reject(new Error("not used")),
    readWorkforceCandidates: () => Promise.resolve(workforce ?? {
      businessKey: BUSINESS_KEY,
      generatedAt: "2026-08-22T00:00:00.000Z",
      candidates: [],
    }),
    execute: (command, args) => Promise.resolve(
      execute?.(command, args) ?? {},
    ),
  };
}

async function request(
  path: string,
  method: string,
  body: Record<string, unknown> | undefined,
  repository: PlayerBusinessRepository,
): Promise<Response> {
  const route = readPlayerBusinessRoutePath(path);
  if (!route) throw new Error(`Route was not parsed: ${path}`);
  return handlePlayerBusinessRequest(
    new Request(`https://example.test${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    route,
    {
      readEnvironment: () => ({
        ok: true,
        value: {
          supabaseUrl: "https://example.supabase.co",
          serviceRoleKey: "test-service-role",
        },
      }) as never,
      createServiceClient: () => ({}) as never,
      resolveScope: () => Promise.resolve({
        gameId: "game-scope",
        playerUuid: "player-scope",
      }),
      createRepository: () => repository,
    },
  );
}
'''

CONTRACT = r'''
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "backend/supabase/migrations/20260822120000_business_workforce_candidate_hiring_v2.sql",
  "utf8",
);
const routes = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
  "utf8",
);
const handler = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  "utf8",
);
const executor = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessMutationExecutor.ts",
  "utf8",
);
const validation = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessRequestValidation.ts",
  "utf8",
);
const serverManifest = fs.readFileSync(
  "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
  "utf8",
);
const clientCapabilities = fs.readFileSync(
  "player-terminal/src/api/capabilities.js",
  "utf8",
);
const businessPage = fs.readFileSync(
  "player-terminal/src/pages/business-page.js",
  "utf8",
);

for (const token of [
  "read_owned_business_workforce_candidates_v2",
  "hire_business_workforce_candidate_v2",
  "for update",
  "status = 'reserved'",
  "status = 'hired'",
  "workforce_source_type",
  "candidate_v2",
  "business.workforce.candidate.hire",
  "IDEMPOTENCY_KEY_CONFLICT",
  "BUSINESS_WORKFORCE_PLAYER_ALREADY_EMPLOYED",
]) assert.match(migration, new RegExp(token.replaceAll(".", "\\."), "i"));

assert.match(routes, /business\/workforce\/candidates/u);
assert.match(routes, /businessCandidateHire/u);
assert.match(handler, /business_legacy_hiring_retired/u);
assert.match(handler, /hireBusinessWorkforceCandidate/u);
assert.doesNotMatch(executor, /hire_business_employee_v1/u);
assert.match(validation, /businessCandidateHire:\s*\["businessKey",\s*"idempotencyKey"\]/u);
assert.match(serverManifest, /businessCandidateHire/u);
assert.doesNotMatch(serverManifest, /"businessHire"/u);
assert.match(clientCapabilities, /businessCandidateHire/u);
assert.doesNotMatch(clientCapabilities, /"businessHire"/u);
assert.match(businessPage, /data-endpoint="businessCandidateHire"/u);
for (const prohibited of [
  'name="employeePlayerIdentifier"',
  'name="role"',
  'name="wagePerCycle"',
  'name="productivityIndex"',
]) assert.doesNotMatch(businessPage, new RegExp(prohibited, "u"));

console.log("Business Phase 4B workforce hiring contract passed.");
'''

write(
    "backend/supabase/migrations/20260822120000_business_workforce_candidate_hiring_v2.sql",
    textwrap.dedent(MIGRATION).lstrip(),
)
write(
    "backend/src/domains/business/application/workforce/businessWorkforceResultParser.ts",
    textwrap.dedent(PARSER).lstrip(),
)
write(
    "backend/src/domains/business/api/playerBusinessWorkforce.ts",
    textwrap.dedent(WORKFORCE_API).lstrip(),
)
write(
    "backend/src/domains/business/api/playerBusinessWorkforceHiring.test.ts",
    textwrap.dedent(TEST).lstrip(),
)
write(
    "scripts/business-workforce-hiring-contract.mjs",
    textwrap.dedent(CONTRACT).lstrip(),
)

# Business route and contract publication.
replace_once(
    "backend/src/domains/business/contracts/playerBusinessContracts.ts",
    'readonly resource?: "overview" | "stockroom" | "recipes";',
    'readonly resource?: "overview" | "stockroom" | "recipes" | "workforceCandidates";',
)
replace_once(
    "backend/src/domains/business/contracts/playerBusinessContracts.ts",
    '  | { readonly kind: "businessStorePurchase" }\n  | { readonly kind: "businessProductCreate" }',
    '  | { readonly kind: "businessStorePurchase" }\n  | { readonly kind: "businessCandidateHire"; readonly candidateKey: string }\n  | { readonly kind: "businessProductCreate" }',
)
replace_once(
    "backend/src/domains/business/contracts/playerBusinessContracts.ts",
    'export interface BusinessSnapshotDto {',
    '''export interface BusinessWorkforceCandidateDto {
  readonly candidateKey: string;
  readonly roleKey: string;
  readonly roleName: string;
  readonly laborClass: string;
  readonly displayLabel: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly wagePerCycle: number;
  readonly laborMinutesPerCycle: number;
  readonly skillBasisPoints: number;
  readonly productivityIndex: number;
  readonly contractType: string;
  readonly availabilityEndsAt: string | null;
  readonly version: number;
}

export interface BusinessWorkforceSnapshotDto {
  readonly businessKey: string;
  readonly generatedAt: string;
  readonly candidates: readonly BusinessWorkforceCandidateDto[];
}

export interface BusinessCandidateHireReceiptDto {
  readonly businessKey: string;
  readonly employeeKey: string;
  readonly candidateKey: string;
  readonly roleKey: string;
  readonly roleName: string;
  readonly contractType: string;
  readonly wagePerCycle: number;
  readonly currencyCode: string;
  readonly laborMinutesPerCycle: number;
  readonly skillBasisPoints: number;
  readonly productivityIndex: number;
  readonly status: string;
  readonly hiredAt: string;
  readonly replayed: boolean;
}

export interface BusinessSnapshotDto {''',
)
replace_once(
    "backend/src/domains/business/contracts/playerBusinessContracts.ts",
    '''  readBusiness(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto>;
  execute(''',
    '''  readBusiness(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto>;
  readWorkforceCandidates(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessWorkforceSnapshotDto>;
  execute(''',
)
replace_once(
    "backend/src/domains/business/contracts/playerBusinessContracts.ts",
    '  "businessStorePurchase",\n  "businessProductCreate",',
    '  "businessStorePurchase",\n  "businessCandidateHire",\n  "businessProductCreate",',
)

replace_once(
    "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
    '''  if (
    tail.length === 2 && tail[0] === "business" && tail[1] === "recipes"
  ) {
    return { kind: "businessRead", resource: "recipes" };
  }
''',
    '''  if (
    tail.length === 2 && tail[0] === "business" && tail[1] === "recipes"
  ) {
    return { kind: "businessRead", resource: "recipes" };
  }
  if (
    tail.length === 3 && tail[0] === "business" &&
    tail[1] === "workforce" && tail[2] === "candidates"
  ) {
    return { kind: "businessRead", resource: "workforceCandidates" };
  }
''',
)
replace_once(
    "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
    '''  if (
    tail.length === 3 && tail[0] === "business" &&
    tail[1] === "employees" && tail[2] === "hire"
  ) {
    return { kind: "businessHire" };
  }
''',
    '''  if (
    tail.length === 5 && tail[0] === "business" &&
    tail[1] === "workforce" && tail[2] === "candidates" &&
    tail[4] === "hire" && validKey(tail[3], "wfc")
  ) {
    return {
      kind: "businessCandidateHire",
      candidateKey: tail[3].toLowerCase(),
    };
  }
  if (
    tail.length === 3 && tail[0] === "business" &&
    tail[1] === "employees" && tail[2] === "hire"
  ) {
    return { kind: "businessHire" };
  }
''',
)

# Validation and execution boundary.
replace_once(
    "backend/src/domains/business/api/playerBusinessRequestValidation.ts",
    '    businessStorePurchase: [\n      "quoteKey",\n      "idempotencyKey",\n      "clientSubmittedAt",\n    ],',
    '    businessStorePurchase: [\n      "quoteKey",\n      "idempotencyKey",\n      "clientSubmittedAt",\n    ],\n    businessCandidateHire: ["businessKey", "idempotencyKey"],',
)
replace_once(
    "backend/src/domains/business/api/playerBusinessMutationExecutor.ts",
    '  readNumber,\n  readOptionalInteger,\n  readOptionalKey,\n  readOptionalText,',
    '  readOptionalInteger,\n  readOptionalKey,',
)
replace_once(
    "backend/src/domains/business/api/playerBusinessMutationExecutor.ts",
    '  | { readonly kind: "businessInputPurchase" }\n>;',
    '  | { readonly kind: "businessInputPurchase" }\n  | { readonly kind: "businessCandidateHire" }\n  | { readonly kind: "businessHire" }\n>;',
)
regex_once(
    "backend/src/domains/business/api/playerBusinessMutationExecutor.ts",
    r'''\n    case "businessHire":\n      return repository\.execute\("hire_business_employee_v1", \{.*?\n      \}\);''',
    "",
    flags=re.S,
)

# Handler cutover.
replace_once(
    "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
    '''import {
  createBusinessStoreQuote,
  purchaseBusinessStoreQuote,
} from "./playerBusinessStoreProcurement.ts";
''',
    '''import {
  createBusinessStoreQuote,
  purchaseBusinessStoreQuote,
} from "./playerBusinessStoreProcurement.ts";
import {
  hireBusinessWorkforceCandidate,
  readBusinessWorkforceCandidates,
} from "./playerBusinessWorkforce.ts";
''',
)
replace_once(
    "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
    '''      if (route.resource === "recipes") {
        return privateJson(200, {
          recipes: await readBusinessRecipes(client, publicScope),
        });
      }
      return privateJson(200, await repository.readBusiness(publicScope));
''',
    '''      if (route.resource === "recipes") {
        return privateJson(200, {
          recipes: await readBusinessRecipes(client, publicScope),
        });
      }
      if (route.resource === "workforceCandidates") {
        return privateJson(
          200,
          await readBusinessWorkforceCandidates(repository, publicScope),
        );
      }
      return privateJson(200, await repository.readBusiness(publicScope));
''',
)
replace_once(
    "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
    '''    if (route.kind === "businessStoreQuote") {
''',
    '''    if (route.kind === "businessHire") {
      return jsonError(410, {
        code: "business_legacy_hiring_retired",
        message:
          "Free-text Business hiring has been retired. Select an available workforce candidate.",
        retryable: false,
      });
    }

    if (route.kind === "businessCandidateHire") {
      return privateJson(200, {
        ok: true,
        receipt: await hireBusinessWorkforceCandidate(
          repository,
          publicScope,
          route.candidateKey,
          body,
        ),
        refreshRequired: true,
      });
    }

    if (route.kind === "businessStoreQuote") {
''',
)

# Repository candidate read and error mapping.
replace_once(
    "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
    '''import {
  type BusinessSnapshotDto,
  PlayerBusinessError,
  type PlayerBusinessRepository,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessContracts.ts";
''',
    '''import {
  type BusinessSnapshotDto,
  type BusinessWorkforceSnapshotDto,
  PlayerBusinessError,
  type PlayerBusinessRepository,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessContracts.ts";
import { parseBusinessWorkforceSnapshot } from "../application/workforce/businessWorkforceResultParser.ts";
''',
)
replace_once(
    "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
    '''  async execute(
    command: string,
''',
    '''  async readWorkforceCandidates(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessWorkforceSnapshotDto> {
    const response = await this.client.rpc<unknown>(
      "read_owned_business_workforce_candidates_v2",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
      },
    );
    if (response.error) throw mapDatabaseError(response.error.message);
    return parseBusinessWorkforceSnapshot(response.data);
  }

  async execute(
    command: string,
''',
)
replace_once(
    "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
    '''    BUSINESS_OWNERSHIP_AMBIGUOUS: [409, "Multiple open Businesses are associated with this Player."],
''',
    '''    BUSINESS_OWNERSHIP_AMBIGUOUS: [409, "Multiple open Businesses are associated with this Player."],
    BUSINESS_NOT_ACTIVE: [409, "The Business must be active before hiring."],
    BUSINESS_WORKFORCE_CANDIDATE_KEY_INVALID: [400, "Workforce candidate key is invalid."],
    BUSINESS_WORKFORCE_CANDIDATE_NOT_FOUND: [404, "Workforce candidate was not found."],
    BUSINESS_WORKFORCE_CANDIDATE_NOT_AVAILABLE: [409, "Workforce candidate is no longer available."],
    BUSINESS_WORKFORCE_CANDIDATE_EXPIRED: [409, "Workforce candidate availability has expired."],
    BUSINESS_WORKFORCE_CANDIDATE_COUNTRY_MISMATCH: [409, "Workforce candidate is not available in the Business country."],
    BUSINESS_WORKFORCE_CANDIDATE_CURRENCY_MISMATCH: [409, "Workforce candidate wage currency does not match the Business."],
    BUSINESS_WORKFORCE_ROLE_NOT_ACTIVE: [409, "The workforce role is not active."],
    BUSINESS_WORKFORCE_PLAYER_ALREADY_EMPLOYED: [409, "This candidate is already actively employed by the Business."],
    BUSINESS_OWNER_CANNOT_HIRE_SELF: [409, "The Business owner cannot hire themselves through the candidate market."],
    BUSINESS_WORKFORCE_HIRE_CONFLICT: [409, "The workforce candidate was hired by another request."],
    BUSINESS_WORKFORCE_HIRE_REPLAY_MISSING: [500, "Workforce hire replay evidence is incomplete.", true],
''',
)

# Public index exports.
replace_once(
    "backend/src/domains/business/index.ts",
    '''  type BusinessStoreReceiptDto,
  type PlayerBusinessRepository,
''',
    '''  type BusinessStoreReceiptDto,
  type BusinessCandidateHireReceiptDto,
  type BusinessWorkforceCandidateDto,
  type BusinessWorkforceSnapshotDto,
  type PlayerBusinessRepository,
''',
)

# Mixed compatibility facade publication.
replace_once(
    "backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts",
    '  { kind: "businessStorePurchase" },\n  { kind: "businessProduction" },',
    '  { kind: "businessStorePurchase" },\n  { kind: "businessCandidateHire" },\n  { kind: "businessProduction" },',
)

# Server capability and rate-limit contracts.
manifest = "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts"
replace_once(manifest, '"2026-08-21.2"', '"2026-08-22.1"')
replace_once(manifest, '  "businessHire",', '  "businessCandidateHire",')
replace_once(manifest, '  | "business"\n  | "businessCreate"', '  | "business"\n  | "businessWorkforce"\n  | "businessCreate"')
replace_once(manifest, '  | "businessHire"\n  | "businessPrice"', '  | "businessCandidateHire"\n  | "businessPrice"')
replace_once(
    manifest,
    '''  {
    key: "business",
    operations: [{ method: "GET", pathTemplate: "/players/me/business" }],
    routeCapabilities: ["business"],
  },
''',
    '''  {
    key: "business",
    operations: [{ method: "GET", pathTemplate: "/players/me/business" }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessWorkforce",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/business/workforce/candidates",
    }],
    routeCapabilities: ["business"],
  },
''',
)
regex_once(
    manifest,
    r'''  \{\n    key: "businessHire",\n    operations: \[\{\n      method: "POST",\n      pathTemplate: "/players/me/business/employees/hire",\n    \}\],\n    actionCapabilities: \["businessHire"\],\n  \},''',
    '''  {
    key: "businessCandidateHire",
    operations: [{
      method: "POST",
      pathTemplate:
        "/players/me/business/workforce/candidates/:candidateKey/hire",
    }],
    actionCapabilities: ["businessCandidateHire"],
  },''',
)

rate = "backend/src/security/playerRateLimitDispatch.ts"
replace_once(rate, '  | "businessInputPurchase";', '  | "businessInputPurchase"\n  | "businessLegacyHire";')
replace_once(
    rate,
    '''  businessHire: byMethod({
    POST: operation("player.business.employees.hire", "sensitive"),
  }),
''',
    '''  businessWorkforce: byMethod({
    GET: operation("player.business.workforce.read", "read"),
  }),
  businessCandidateHire: byMethod({
    POST: operation("player.business.workforce.candidate.hire", "sensitive"),
  }),
  businessLegacyHire: byMethod({
    POST: operation("player.business.employees.hire.retired", "sensitive"),
  }),
''',
)

# Classroom API maps the new read/action while preserving rate limiting for 410.
classroom = "backend/supabase/functions/classroom-api/index.ts"
replace_once(
    classroom,
    '      businessHire: "businessHire",',
    '      businessCandidateHire: "businessCandidateHire",\n      businessHire: "businessLegacyHire",',
)
marker = '''  if (playerBusinessBankingRoute) {
    const endpointKey = ({'''
text = read(classroom)
if marker not in text:
    raise SystemExit("classroom-api Business endpoint map marker missing")
text = text.replace(
    marker,
    '''  if (playerBusinessBankingRoute) {
    const endpointKey =
      playerBusinessBankingRoute.kind === "businessRead" &&
        playerBusinessBankingRoute.resource === "workforceCandidates"
        ? "businessWorkforce"
        : ({''',
    1,
)
write(classroom, text)

# Browser endpoint, capability, resource, and route adapter cutover.
endpoints = "player-terminal/src/api/endpoints.js"
replace_once(
    endpoints,
    '  business: { method: "GET", path: "/business" },',
    '  business: { method: "GET", path: "/business" },\n  businessWorkforce: { method: "GET", path: "/business/workforce/candidates" },',
)
replace_once(
    endpoints,
    '  businessHire: { method: "POST", path: "/business/employees/hire" },',
    '''  businessCandidateHire: {
    method: "POST",
    path: "/business/workforce/candidates/:candidateId/hire",
  },''',
)

adapter = "player-terminal/src/api/business-banking-backend-routes.js"
replace_once(
    adapter,
    '''  business: () => ({ method: "GET", path: "/players/me/business" }),
''',
    '''  business: () => ({ method: "GET", path: "/players/me/business" }),
  businessWorkforce: () => ({
    method: "GET",
    path: "/players/me/business/workforce/candidates",
  }),
''',
)
regex_once(
    adapter,
    r'''  businessHire: \(\{ payload \}\) => \(\{.*?\n  \}\),\n  businessTerminate:''',
    '''  businessCandidateHire: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/business/workforce/candidates/${encodeURIComponent(required(params.candidateId || payload.candidateKey, "candidateKey", "businessCandidateHire"))}/hire`,
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessCandidateHire"),
      idempotencyKey: key(payload, "businessCandidateHire"),
    },
  }),
  businessTerminate:''',
    flags=re.S,
)

core = "player-terminal/src/api/backend-routes-core.js"
replace_once(core, '  "business",\n  "businessCreate",', '  "business",\n  "businessWorkforce",\n  "businessCreate",')
replace_once(core, '  "businessHire",', '  "businessCandidateHire",')

caps = "player-terminal/src/api/capabilities.js"
replace_once(caps, '  "businessHire",', '  "businessCandidateHire",')

resources = "player-terminal/src/api/resource-plan.js"
replace_once(
    resources,
    '  business: Object.freeze({ required: Object.freeze(["business", "countries"]), optional: Object.freeze([]) }),',
    '  business: Object.freeze({ required: Object.freeze(["business", "countries"]), optional: Object.freeze(["businessWorkforce"]) }),',
)
replace_once(
    resources,
    '  businessHire: Object.freeze(["dashboard", "business", "banking"]),',
    '  businessCandidateHire: Object.freeze(["dashboard", "business", "businessWorkforce", "banking"]),',
)

empty = "player-terminal/src/data/empty-read-models.js"
replace_once(
    empty,
    '''    business: {
''',
    '''    businessWorkforce: {
      businessKey: "",
      generatedAt: "",
      candidates: []
    },
    business: {
''',
)

normalizer = "player-terminal/src/api/response-normalizer.js"
replace_once(normalizer, '  "business",\n  "store",', '  "business",\n  "businessWorkforce",\n  "store",')
replace_once(
    normalizer,
    '  business: Object.freeze(["products", "suppliers"]),',
    '  business: Object.freeze(["products", "suppliers"]),\n  businessWorkforce: Object.freeze(["candidates"]),',
)
replace_once(
    normalizer,
    '  if (endpointKey === "worldRuntime") validateWorldRuntime(value, context);',
    '''  if (endpointKey === "worldRuntime") validateWorldRuntime(value, context);
  if (
    endpointKey === "businessWorkforce" &&
    UUID.test(JSON.stringify(value))
  ) throw invalidResponse(endpointKey, context.requestId, context.path);''',
)

# Replace free-text employee hiring with a server-owned candidate market.
page = "player-terminal/src/pages/business-page.js"
replace_once(
    page,
    '''function statusForm(business) {
''',
    '''function workforceMarket(workforce, business, code) {
  const candidates = Array.isArray(workforce?.candidates)
    ? workforce.candidates
    : [];
  if (!candidates.length) {
    return renderEmptyState({
      title: "No candidates available",
      detail: "The server-owned labor market has no matching candidates for this Business country and currency.",
      iconName: "users"
    });
  }
  const groups = new Map();
  for (const candidate of candidates) {
    const key = candidate.roleKey || candidate.roleName || "workforce.other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  return [...groups.entries()].map(([roleKey, entries]) => `<section class="player-terminal-workforce-role-group">
    <header><small>${escapeHtml(roleKey)}</small><strong>${escapeHtml(entries[0]?.roleName || "Workforce")}</strong></header>
    <div>${entries.map((candidate) => `<article class="player-terminal-business-product">
      <span class="player-terminal-product-icon">${icon("users")}</span>
      <div><small>${escapeHtml(candidate.laborClass)} · ${escapeHtml(candidate.contractType)}</small><strong>${escapeHtml(candidate.displayLabel)}</strong><p>${escapeHtml(formatCurrency(candidate.wagePerCycle, candidate.currencyCode || code))} per cycle · ${escapeHtml(formatNumber(candidate.laborMinutesPerCycle))} labor minutes · ${escapeHtml(formatPercent(candidate.skillBasisPoints / 100, 0))} skill</p></div>
      <form data-player-form="business-candidate-hire" data-endpoint="businessCandidateHire" data-candidate-id="${escapeHtml(candidate.candidateKey)}">
        ${hiddenBusinessKey(business)}
        <input name="candidateKey" type="hidden" value="${escapeHtml(candidate.candidateKey)}" />
        <button class="player-terminal-secondary-button" type="submit">${icon("users")} Hire candidate</button>
      </form>
    </article>`).join("")}</div>
  </section>`).join("");
}

function statusForm(business) {
''',
)
regex_once(
    page,
    r'''        <details class="player-terminal-disclosure"><summary><span>\$\{icon\("users"\)\}</span><div><strong>Hire an employee</strong>.*?</form></details>\n        \$\{productCreationForm\(business\)\}''',
    '''        <details class="player-terminal-disclosure"><summary><span>${icon("users")}</span><div><strong>Workforce candidates</strong><small>Select from server-priced, role-grouped candidates</small></div>${icon("chevronRight")}</summary><div class="player-terminal-workforce-market">${workforceMarket(data.businessWorkforce, business, code)}</div></details>
        ${productCreationForm(business)}''',
    flags=re.S,
)

# Update current Player surface evidence/tests without deleting non-hiring coverage.
for path in [
    "player-terminal/tests/business-banking-surface.mjs",
    "player-terminal/tests/student-profile-adapter.mjs",
]:
    target = ROOT / path
    if not target.exists():
        continue
    text = target.read_text(encoding="utf-8")
    text = text.replace("businessHire", "businessCandidateHire")
    text = text.replace(
        "/players/me/business/employees/hire",
        f"/players/me/business/workforce/candidates/wfc_{'d' * 32}/hire",
    )
    text = text.replace("employeePlayerIdentifier", "candidateKey")
    text = re.sub(
        r'''candidateKey:\s*["'][^"']*["']''',
        f'''candidateKey: "wfc_{'d' * 32}"''',
        text,
    )
    target.write_text(text, encoding="utf-8")

# Runtime source contract: replace stale capability/action names, while the new
# focused contract owns the stronger candidate-only assertions.
runtime_contract = ROOT / "scripts/business-banking-runtime-contract.mjs"
if runtime_contract.exists():
    text = runtime_contract.read_text(encoding="utf-8")
    text = text.replace("businessHire", "businessCandidateHire")
    text = re.sub(
        r'''assert\.(?:match|ok|equal|deepEqual)\([^;]*hire_business_employee_v1[^;]*;\s*''',
        "",
        text,
        flags=re.S,
    )
    runtime_contract.write_text(text, encoding="utf-8")

# Button/action contract remains the same breadth, but points at the new action.
coverage = ROOT / "docs/operations/contracts/button-action-coverage-v1.json"
if coverage.exists():
    text = coverage.read_text(encoding="utf-8")
    text = text.replace("businessHire", "businessCandidateHire")
    text = text.replace("business-hire", "business-candidate-hire")
    text = text.replace(
        "/players/me/business/employees/hire",
        "/players/me/business/workforce/candidates/:candidateKey/hire",
    )
    coverage.write_text(text, encoding="utf-8")

# Fail closed if live browser code still authors hiring economics.
page_text = read(page)
for prohibited in [
    'name="employeePlayerIdentifier"',
    'name="role"',
    'name="wagePerCycle"',
    'name="productivityIndex"',
]:
    if prohibited in page_text:
        raise SystemExit(f"Player Business page still exposes {prohibited}")

print("Phase 4B implementation payload applied.")
