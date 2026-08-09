-- Restore legacy Store-created inventory action compatibility after canonical item cutover.
-- Physical-pack items retain their explicit effect_enabled authority. Store-created items
-- predate that metadata and historically exposed inventory.use while active and visible.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

update public.game_items gi
set
  metadata = coalesce(gi.metadata, '{}'::jsonb) || jsonb_build_object(
    'effectEnabled', true,
    'legacyStoreUseCompatibility', true
  ),
  version = gi.version + 1,
  updated_at = now()
where gi.source_kind = 'store_created'
  and gi.status = 'active'
  and coalesce(gi.metadata, '{}'::jsonb)->>'effectEnabled' is null
  and exists (
    select 1
    from public.store_items si
    where si.game_session_id = gi.game_session_id
      and si.game_item_id = gi.id
      and si.status = 'active'
      and si.visibility = 'visible'
  );

commit;
