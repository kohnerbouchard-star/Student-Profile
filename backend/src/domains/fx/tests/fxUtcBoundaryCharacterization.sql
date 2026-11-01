-- Read-only characterization of existing canonical FX boundary helpers.
-- Requires an explicitly owned disposable PostgreSQL database with canonical
-- migrations already applied, and a role already allowed to call the helpers.
-- Use a client that stops on SQL errors; this file does not choose a database.
-- This is helper math, not deterministic quote-at-08:00 or initializer coverage.
-- It creates no fixtures and does not exercise expired-state rejection/refresh.

begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

do $fx_utc_boundary_characterization$
declare
  v_case record;
  v_actual timestamptz;
  -- The Market fixture passes calculated wall-clock time minus one minute as
  -- p_effective_at. These fixed values model that separation across 08:00 only;
  -- they do not replace either clock_timestamp() call in the initializer.
  v_calculated_at constant timestamptz := timestamptz '2026-11-01 08:00:30+00';
  v_effective_at constant timestamptz := v_calculated_at - interval '1 minute';
begin
  v_actual := private.fx_boundary_for_local_date_v1(date '2026-11-01', 'UTC');
  if v_actual is distinct from timestamptz '2026-11-01 08:00:00+00' then
    raise exception 'UTC local-date boundary: expected %, got %',
      timestamptz '2026-11-01 08:00:00+00', v_actual;
  end if;

  for v_case in
    select * from (values
      (
        'one microsecond before 08:00 selects today',
        timestamptz '2026-11-01 07:59:59.999999+00',
        timestamptz '2026-11-01 08:00:00+00'
      ),
      (
        'exactly 08:00 selects tomorrow',
        timestamptz '2026-11-01 08:00:00+00',
        timestamptz '2026-11-02 08:00:00+00'
      ),
      (
        'one microsecond after 08:00 selects tomorrow',
        timestamptz '2026-11-01 08:00:00.000001+00',
        timestamptz '2026-11-02 08:00:00+00'
      ),
      (
        'fixture effective-time helper input selects today (not initializer behavior)',
        v_effective_at,
        timestamptz '2026-11-01 08:00:00+00'
      ),
      (
        'calculated-time helper input selects tomorrow (not initializer behavior)',
        v_calculated_at,
        timestamptz '2026-11-02 08:00:00+00'
      )
    ) as cases(label, after_at, expected_at)
  loop
    v_actual := private.fx_next_boundary_v1(v_case.after_at, 'UTC');
    if v_actual is distinct from v_case.expected_at then
      raise exception '%: expected %, got %',
        v_case.label, v_case.expected_at, v_actual;
    end if;
  end loop;

  raise notice 'FX UTC boundary helper characterization: 6 assertions passed; no initializer, quote, or refresh executed';
end;
$fx_utc_boundary_characterization$;

rollback;
