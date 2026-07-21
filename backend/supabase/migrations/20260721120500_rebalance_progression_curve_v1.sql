begin;

create or replace function public.progression_level_threshold_v1(p_level integer)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case p_level
    when 1 then 0
    when 2 then 150
    when 3 then 375
    when 4 then 675
    when 5 then 1050
    when 6 then 1500
    when 7 then 2025
    when 8 then 2625
    when 9 then 3300
    when 10 then 4050
    when 11 then 4875
    when 12 then 5775
    when 13 then 6750
    when 14 then 7800
    when 15 then 8925
    when 16 then 10125
    when 17 then 11400
    when 18 then 12750
    when 19 then 14175
    when 20 then 15675
    else 15675
  end::bigint;
$$;

comment on function public.progression_level_threshold_v1(integer) is
  'Bounded level curve with linearly increasing XP increments. Level 20 requires 15,675 XP; the curve is intentionally non-exponential and does not alter economic rewards.';

commit;
