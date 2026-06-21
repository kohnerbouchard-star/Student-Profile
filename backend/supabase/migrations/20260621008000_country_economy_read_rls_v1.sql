-- Country economy read RLS V1.
-- Economy reads are game-session scoped for admin calculations and dashboards.
-- These reads are not player-specific.

create policy country_profiles_select_authenticated
on public.country_profiles
for select
to authenticated
using (status = 'active');

create policy difficulty_policy_profiles_select_authenticated
on public.difficulty_policy_profiles
for select
to authenticated
using (status = 'active');

create policy country_economic_snapshots_select_owned
on public.country_economic_snapshots
for select
to authenticated
using (public.is_game_owner(game_session_id));

create policy country_event_impacts_select_owned
on public.country_event_impacts
for select
to authenticated
using (public.is_game_owner(game_session_id));
