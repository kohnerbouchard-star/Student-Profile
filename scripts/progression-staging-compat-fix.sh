#!/usr/bin/env bash
set -euo pipefail

# Operational carrier: never merge this branch.
EXPECTED_HEAD="4f6a47ecec782d4c17d2eaf9b531a917c179c196"
BRANCH="agent/progression-reputation-achievements-v1"
MIGRATION="backend/supabase/migrations/20260721160000_add_progression_reputation_runtime_v1.sql"

git config user.name "econovaria-progression-controller"
git config user.email "progression-controller@users.noreply.github.com"
git fetch origin "$BRANCH"
git switch -C "$BRANCH" "origin/$BRANCH"
test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"

python3 - "$MIGRATION" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
replacements = {
    """    select * into v_profile from public.player_progression_profiles
    where game_session_id = p_game_session_id and player_id = v_player for update;""":
    """    select profile.* into v_profile
    from public.player_progression_profiles as profile
    where profile.game_session_id = p_game_session_id
      and profile.player_id = v_player
    for update;""",
    """    update public.player_progression_profiles
    set experience = v_after,
        level = public.progression_level_for_experience_v1(v_after),
        earned_skill_points = greatest(earned_skill_points, public.progression_level_for_experience_v1(v_after) - 1),
        updated_at = now()
    where game_session_id = p_game_session_id and player_id = v_player;""":
    """    update public.player_progression_profiles as profile
    set experience = v_after,
        level = public.progression_level_for_experience_v1(v_after),
        earned_skill_points = greatest(profile.earned_skill_points, public.progression_level_for_experience_v1(v_after) - 1),
        updated_at = now()
    where profile.game_session_id = p_game_session_id
      and profile.player_id = v_player;""",
    """    update public.player_progression_counters
    set counter_value = public.progression_level_for_experience_v1(v_after), updated_at = now()
    where game_session_id = p_game_session_id and player_id = v_player and counter_key = 'level.current';""":
    """    update public.player_progression_counters as counter
    set counter_value = public.progression_level_for_experience_v1(v_after), updated_at = now()
    where counter.game_session_id = p_game_session_id
      and counter.player_id = v_player
      and counter.counter_key = 'level.current';""",
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit("Expected one exact Admin correction SQL block for replacement")
    text = text.replace(old, new)

function_start = text.index("create or replace function public.apply_admin_progression_correction_atomic_v1(")
function_end = text.index("\n$function$;", function_start)
function_body = text[function_start:function_end]
for unsafe in (
    "where game_session_id = p_game_session_id and player_id = v_player",
    "where game_session_id = p_game_session_id and player_id = v_player for update",
):
    if unsafe in function_body:
        raise SystemExit(f"Unqualified Admin correction predicate remains: {unsafe}")

path.write_text(text, encoding="utf-8")
print("Qualified Admin correction profile and counter predicates")
PY

grep -Fq "select profile.* into v_profile" "$MIGRATION"
grep -Fq "update public.player_progression_profiles as profile" "$MIGRATION"
grep -Fq "update public.player_progression_counters as counter" "$MIGRATION"
git diff --check

git add "$MIGRATION"
git commit -m "fix(progression): qualify Admin correction predicates"
git push origin "HEAD:$BRANCH"
