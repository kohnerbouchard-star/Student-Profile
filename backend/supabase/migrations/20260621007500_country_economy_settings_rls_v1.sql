-- Country economy settings RLS V1.
-- Game-level economy settings are owned by the authenticated staff owner of the game session.

create policy game_difficulty_policy_settings_select_owned
on public.game_difficulty_policy_settings
for select
to authenticated
using (public.is_game_owner(game_session_id));

create policy game_difficulty_policy_settings_insert_owned
on public.game_difficulty_policy_settings
for insert
to authenticated
with check (public.is_game_owner(game_session_id));

create policy game_difficulty_policy_settings_update_owned
on public.game_difficulty_policy_settings
for update
to authenticated
using (public.is_game_owner(game_session_id))
with check (public.is_game_owner(game_session_id));

create policy game_country_economic_baseline_settings_select_owned
on public.game_country_economic_baseline_settings
for select
to authenticated
using (public.is_game_owner(game_session_id));

create policy game_country_economic_baseline_settings_insert_owned
on public.game_country_economic_baseline_settings
for insert
to authenticated
with check (public.is_game_owner(game_session_id));

create policy game_country_economic_baseline_settings_update_owned
on public.game_country_economic_baseline_settings
for update
to authenticated
using (public.is_game_owner(game_session_id))
with check (public.is_game_owner(game_session_id));
