// Test-harness observations only: never refresh or alter the FX authority.
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
const nullable = check => value => value === null || check(value);
const boolean = value => typeof value === 'boolean';
const fields = {
  databaseClockUtc: value => typeof value === 'string' && UTC_TIME.test(value),
  gameTimezoneIsUtc: boolean,
  runtimePresent: boolean,
  cutoverStatus: nullable(value => ['pending', 'ready', 'blocked'].includes(value)),
  nextDueAtUtc: nullable(value => typeof value === 'string' && UTC_TIME.test(value)),
  deadlineExpired: nullable(boolean),
  currentFixingPresent: boolean,
  currentFixingDigest: nullable(value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)),
  fixingKind: nullable(value => ['bootstrap', 'daily'].includes(value)),
  fixingLocalDate: nullable(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)),
  fixingEffectiveAtUtc: nullable(value => typeof value === 'string' && UTC_TIME.test(value)),
  fixingCalculatedAtUtc: nullable(value => typeof value === 'string' && UTC_TIME.test(value)),
};

function clockSql(gameId) {
  if (typeof gameId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(gameId)) {
    throw new Error('Invalid diagnostic fixture scope');
  }
  const time = expression => `to_char(${expression} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  return `begin read only;
set local statement_timeout = '1s';
set local lock_timeout = '500ms';
with observed as materialized (select clock_timestamp() as at)
select jsonb_build_object(
  'databaseClockUtc', ${time('observed.at')},
  'gameTimezoneIsUtc', public.game_timezone_for_game_v1('${gameId}'::uuid) = 'UTC',
  'runtimePresent', runtime.game_session_id is not null,
  'cutoverStatus', runtime.cutover_status,
  'nextDueAtUtc', ${time('runtime.next_due_at')},
  'deadlineExpired', runtime.next_due_at <= observed.at,
  'currentFixingPresent', fixing.id is not null,
  'currentFixingDigest', encode(extensions.digest(runtime.current_fixing_id::text, 'sha256'), 'hex'),
  'fixingKind', fixing.fixing_kind,
  'fixingLocalDate', to_char(fixing.fixing_local_date, 'YYYY-MM-DD'),
  'fixingEffectiveAtUtc', ${time('fixing.effective_at')},
  'fixingCalculatedAtUtc', ${time('fixing.calculated_at')}
)::text
from observed
left join private.fx_runtime_state runtime on runtime.game_session_id = '${gameId}'::uuid
left join public.fx_fixings fixing on fixing.id = runtime.current_fixing_id
  and fixing.game_session_id = runtime.game_session_id;
rollback;`;
}

export function observeFinancialMarketReentryQuote(quote, {gameId, runSql, emit = console.log}) {
  function observe(stage) {
    let receipt = {schemaVersion: 1, stage, available: false};
    try {
      const result = runSql(clockSql(gameId), {allowError: true, timeoutMs: 2_000});
      if (result.status === 0 && typeof result.output === 'string' && Buffer.byteLength(result.output) <= 2_048) {
        const raw = JSON.parse(result.output);
        if (raw && typeof raw === 'object' && !Array.isArray(raw) &&
            Object.entries(fields).every(([key, check]) => check(raw[key]))) {
          receipt = {schemaVersion: 1, stage, available: true,
            observation: Object.fromEntries(Object.keys(fields).map(key => [key, raw[key]]))};
        }
      }
    } catch {
      // Diagnostic failure must not replace the original quote result/error.
    }
    try {
      const serialized = JSON.stringify(receipt);
      const line = `FINANCIAL_MARKET_FX_CLOCK ${serialized}`;
      if (Buffer.byteLength(line) <= 2_048) emit(line);
    } catch {
      // Logging cannot change the acceptance path either.
    }
  }
  observe('before_reentry_quote');
  try {
    return quote();
  } catch (error) {
    observe('after_reentry_quote_failure');
    throw error;
  }
}
