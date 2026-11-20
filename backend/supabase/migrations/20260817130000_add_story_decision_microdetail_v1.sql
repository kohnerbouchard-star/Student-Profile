begin;

create table if not exists public.story_decision_definitions (
  decision_key text primary key,
  contract_key text not null unique,
  story_stage integer not null check (story_stage between 1 and 100),
  relationship_role text not null default 'sponsor',
  public_prompt jsonb not null default '{}'::jsonb,
  mechanical_options jsonb not null default '{}'::jsonb,
  trust_delta integer not null default 0 check (trust_delta between -20 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_decision_definitions_prompt_object check (jsonb_typeof(public_prompt) = 'object'),
  constraint story_decision_definitions_options_object check (jsonb_typeof(mechanical_options) = 'object')
);

create table if not exists public.player_story_decisions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  decision_key text not null references public.story_decision_definitions(decision_key) on delete restrict,
  contract_key text not null,
  contract_id uuid not null references public.game_session_contracts(id) on delete cascade,
  progress_id uuid not null references public.player_contract_progress(id) on delete cascade,
  option_key text not null,
  rationale text not null,
  semantic_tags text[] not null default '{}',
  dimensions jsonb not null default '{}'::jsonb,
  relationship_character_key text,
  decided_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_story_decisions_dimensions_object check (jsonb_typeof(dimensions) = 'object'),
  constraint player_story_decisions_rationale_length check (char_length(rationale) between 20 and 4000),
  unique (game_session_id, player_id, decision_key, version),
  unique (progress_id, decision_key, version)
);

create index if not exists player_story_decisions_game_player_idx
  on public.player_story_decisions (game_session_id, player_id, decided_at desc);

create table if not exists public.player_story_relationship_adjustments (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  character_key text not null,
  source_type text not null,
  source_id uuid not null,
  trust_delta integer not null check (trust_delta between -20 and 20),
  created_at timestamptz not null default now(),
  unique (game_session_id, player_id, character_key, source_type, source_id)
);

create index if not exists player_story_relationship_adjustments_lookup_idx
  on public.player_story_relationship_adjustments (game_session_id, player_id, character_key, created_at desc);

alter table public.story_decision_definitions enable row level security;
alter table public.player_story_decisions enable row level security;
alter table public.player_story_relationship_adjustments enable row level security;

revoke all on table public.story_decision_definitions from anon, authenticated;
revoke all on table public.player_story_decisions from anon, authenticated;
revoke all on table public.player_story_relationship_adjustments from anon, authenticated;
grant select, insert, update, delete on table public.story_decision_definitions to service_role;
grant select, insert, update, delete on table public.player_story_decisions to service_role;
grant select, insert, update, delete on table public.player_story_relationship_adjustments to service_role;

insert into public.story_decision_definitions (
  decision_key,
  contract_key,
  story_stage,
  relationship_role,
  public_prompt,
  mechanical_options,
  trust_delta,
  is_active
)
values
(
  'meridian_model_recommendation',
  'contract.meridian.compare-financing-governance.v1',
  2,
  'sponsor',
  jsonb_build_object(
    'sceneTitle', 'A Question of Priorities',
    'question', 'Meridian cannot optimize for everything at once. If you had to choose the priority, where would you put the weight?',
    'fallbackAcknowledgement', 'You have made your position clear. I will remember where you stood when Meridian comes under pressure.',
    'options', jsonb_build_array(
      jsonb_build_object('optionKey','finance_first','label','Finance & investment','detail','Prioritize rapid capital formation and investment flexibility.','characterReaction','You are putting a great deal of faith in capital moving faster than institutions.','rationalePrompt','Why should financing take priority over governance, logistics, and industrial resilience?'),
      jsonb_build_object('optionKey','multilateral','label','Multilateral governance','detail','Prioritize shared oversight, rules, and coordinated financing.','characterReaction','You are choosing institutional coordination over speed.','rationalePrompt','Why is shared governance worth the slower decisions and political friction it can create?'),
      jsonb_build_object('optionKey','trade_logistics','label','Trade & logistics','detail','Prioritize customs capacity, transport, and supply-chain throughput.','characterReaction','You are putting a great deal of weight on keeping goods, information, and people moving.','rationalePrompt','Why should trade and logistics take priority over financing, governance, and industrial resilience?'),
      jsonb_build_object('optionKey','industrial_security','label','Industrial security','detail','Prioritize strategic production capacity and infrastructure resilience.','characterReaction','You are choosing resilience even when redundancy costs more.','rationalePrompt','What makes the cost of industrial resilience worth accepting over faster growth or greater efficiency?'),
      jsonb_build_object('optionKey','hybrid','label','A hybrid approach','detail','Combine elements of the competing models rather than making one dominant.','characterReaction','A hybrid sounds safer until two priorities conflict and someone has to choose.','rationalePrompt','When the goals conflict, what principle should decide which part of your hybrid model takes priority?')
    )
  ),
  jsonb_build_object(
    'finance_first',jsonb_build_object('semanticTags',jsonb_build_array('prioritized_finance'),'dimensions',jsonb_build_object('finance',3,'governance',1,'logistics',1,'resilience',1)),
    'multilateral',jsonb_build_object('semanticTags',jsonb_build_array('prioritized_multilateral_governance'),'dimensions',jsonb_build_object('finance',1,'governance',3,'logistics',1,'resilience',1)),
    'trade_logistics',jsonb_build_object('semanticTags',jsonb_build_array('prioritized_trade_logistics'),'dimensions',jsonb_build_object('finance',1,'governance',1,'logistics',3,'resilience',1)),
    'industrial_security',jsonb_build_object('semanticTags',jsonb_build_array('prioritized_industrial_security'),'dimensions',jsonb_build_object('finance',1,'governance',1,'logistics',1,'resilience',3)),
    'hybrid',jsonb_build_object('semanticTags',jsonb_build_array('prioritized_hybrid_model'),'dimensions',jsonb_build_object('finance',2,'governance',2,'logistics',2,'resilience',2))
  ),
  10,
  true
),
(
  'long_term_status_intent',
  'contract.meridian.belonging-long-term-status-decision.v1',
  9,
  'sponsor',
  jsonb_build_object(
    'sceneTitle', 'What Comes After',
    'question', 'The emergency will end eventually. When it does, what direction do you actually want your life here to take?',
    'fallbackAcknowledgement', 'That gives me a clearer sense of where you think your life is heading. The legal process will decide status; this tells me what you intend.',
    'options', jsonb_build_array(
      jsonb_build_object('optionKey','remain_temporary','label','Remain temporary','detail','Stay for now without making a permanent-status commitment.','characterReaction','You are separating staying for now from promising that it will become permanent.','rationalePrompt','Why is remaining temporary the right balance between your opportunities here and the commitments you are not ready to make?'),
      jsonb_build_object('optionKey','seek_permanent_residency','label','Seek permanent residency','detail','Pursue a durable legal right to remain when eligible.','characterReaction','That is a real commitment to building continuity here, even without assuming what the authorities will decide.','rationalePrompt','Why do you want to make this country a durable part of your future rather than keeping your status temporary?'),
      jsonb_build_object('optionKey','seek_citizenship_if_eligible','label','Seek citizenship if eligible','detail','Pursue citizenship if the legal system eventually makes that path available.','characterReaction','That is the strongest long-term commitment you could intend, even though eligibility is not yours to grant.','rationalePrompt','What makes citizenship, if you become eligible, worth the obligations and permanence it would represent?'),
      jsonb_build_object('optionKey','relocate','label','Prepare to relocate','detail','Plan to build the next part of your life somewhere else.','characterReaction','Then you are treating this chapter as important without treating it as permanent.','rationalePrompt','What makes relocation a better long-term choice than deepening your commitments here?'),
      jsonb_build_object('optionKey','defer','label','Defer the decision','detail','Do not commit to a long-term status direction yet.','characterReaction','Keeping the option open protects flexibility, but it also postpones commitments other people may be planning around.','rationalePrompt','What uncertainty is important enough that you are unwilling to choose a long-term direction yet?')
    )
  ),
  jsonb_build_object(
    'remain_temporary',jsonb_build_object('semanticTags',jsonb_build_array('status_intent_temporary'),'dimensions',jsonb_build_object('local_commitment',1)),
    'seek_permanent_residency',jsonb_build_object('semanticTags',jsonb_build_array('status_intent_permanent_residency','local_long_term_commitment'),'dimensions',jsonb_build_object('local_commitment',3)),
    'seek_citizenship_if_eligible',jsonb_build_object('semanticTags',jsonb_build_array('status_intent_citizenship','local_long_term_commitment'),'dimensions',jsonb_build_object('local_commitment',3)),
    'relocate',jsonb_build_object('semanticTags',jsonb_build_array('status_intent_relocate'),'dimensions',jsonb_build_object('local_commitment',0)),
    'defer',jsonb_build_object('semanticTags',jsonb_build_array('status_intent_deferred'),'dimensions',jsonb_build_object('local_commitment',0))
  ),
  10,
  true
)
on conflict (decision_key) do update
set contract_key = excluded.contract_key,
    story_stage = excluded.story_stage,
    relationship_role = excluded.relationship_role,
    public_prompt = excluded.public_prompt,
    mechanical_options = excluded.mechanical_options,
    trust_delta = excluded.trust_delta,
    is_active = excluded.is_active,
    updated_at = now();

create or replace function public.capture_player_story_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_contract_key text;
  v_definition public.story_decision_definitions%rowtype;
  v_option_key text;
  v_rationale text;
  v_option jsonb;
  v_existing public.player_story_decisions%rowtype;
  v_decision_id uuid;
  v_character_key text;
  v_tags text[] := '{}';
  v_adjustment_id uuid;
begin
  if new.status <> 'submitted' then
    return new;
  end if;

  select contract_row.contract_key
  into v_contract_key
  from public.game_session_contracts as contract_row
  where contract_row.id = new.contract_id
    and contract_row.game_session_id = new.game_session_id;

  select * into v_definition
  from public.story_decision_definitions as definition_row
  where definition_row.contract_key = v_contract_key
    and definition_row.is_active;

  if not found then
    return new;
  end if;

  v_option_key := nullif(btrim(new.evidence_payload #>> '{storyDecision,optionKey}'), '');
  v_rationale := nullif(btrim(new.evidence_payload #>> '{storyDecision,rationale}'), '');

  if v_option_key is null then
    raise exception 'STORY_DECISION_OPTION_REQUIRED' using errcode = '22023';
  end if;
  if v_rationale is null or char_length(v_rationale) < 20 or char_length(v_rationale) > 4000 then
    raise exception 'STORY_DECISION_RATIONALE_INVALID' using errcode = '22023';
  end if;

  v_option := v_definition.mechanical_options -> v_option_key;
  if v_option is null or jsonb_typeof(v_option) <> 'object' then
    raise exception 'STORY_DECISION_OPTION_INVALID' using errcode = '22023';
  end if;

  select * into v_existing
  from public.player_story_decisions as decision_row
  where decision_row.game_session_id = new.game_session_id
    and decision_row.player_id = new.player_id
    and decision_row.decision_key = v_definition.decision_key
    and decision_row.version = 1;

  if found then
    if v_existing.option_key <> v_option_key then
      raise exception 'STORY_DECISION_ALREADY_COMMITTED' using errcode = '23505';
    end if;

    if v_existing.rationale <> v_rationale then
      update public.player_story_decisions
      set rationale = v_rationale,
          updated_at = now()
      where id = v_existing.id;
    end if;

    return new;
  end if;

  select relationship_row.character_key
  into v_character_key
  from public.player_story_relationships as relationship_row
  where relationship_row.game_session_id = new.game_session_id
    and relationship_row.player_id = new.player_id
    and relationship_row.relationship_role = v_definition.relationship_role
  order by relationship_row.updated_at desc
  limit 1;

  select coalesce(array_agg(tag_value order by tag_value), '{}'::text[])
  into v_tags
  from jsonb_array_elements_text(coalesce(v_option -> 'semanticTags', '[]'::jsonb))
    as tag_row(tag_value);

  insert into public.player_story_decisions (
    game_session_id, player_id, decision_key, contract_key, contract_id,
    progress_id, option_key, rationale, semantic_tags, dimensions,
    relationship_character_key, decided_at, version
  ) values (
    new.game_session_id, new.player_id, v_definition.decision_key, v_contract_key,
    new.contract_id, new.id, v_option_key, v_rationale, v_tags,
    coalesce(v_option -> 'dimensions', '{}'::jsonb), v_character_key,
    coalesce(new.submitted_at, now()), 1
  ) returning id into v_decision_id;

  if v_character_key is not null and v_definition.trust_delta <> 0 then
    insert into public.player_story_relationship_adjustments (
      game_session_id, player_id, character_key, source_type, source_id, trust_delta
    ) values (
      new.game_session_id, new.player_id, v_character_key, 'story_decision',
      v_decision_id, v_definition.trust_delta
    )
    on conflict do nothing
    returning id into v_adjustment_id;

    if v_adjustment_id is not null then
      update public.player_story_relationships as relationship_row
      set trust_score = greatest(-100, least(100, relationship_row.trust_score + v_definition.trust_delta)),
          stage = case
            when relationship_row.stage = 'broken' then relationship_row.stage
            when relationship_row.trust_score + v_definition.trust_delta >= 20 then 'trusted'
            when relationship_row.stage = 'contacted' then 'engaged'
            else relationship_row.stage
          end,
          memory = coalesce(relationship_row.memory, '{}'::jsonb) || jsonb_build_object(
            'lastStoryDecisionKey', v_definition.decision_key,
            'lastStoryDecisionOption', v_option_key,
            'lastStoryDecisionAt', coalesce(new.submitted_at, now()),
            'storyDecisions', coalesce(relationship_row.memory -> 'storyDecisions', '{}'::jsonb) || jsonb_build_object(v_definition.decision_key, v_option_key)
          ),
          updated_at = now()
      where relationship_row.game_session_id = new.game_session_id
        and relationship_row.player_id = new.player_id
        and relationship_row.character_key = v_character_key;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.capture_player_story_decision_v1() from public, anon, authenticated, service_role;

drop trigger if exists capture_player_story_decision_v1 on public.player_contract_progress;
create trigger capture_player_story_decision_v1
after insert or update of status, evidence_payload, submitted_at
on public.player_contract_progress
for each row
execute function public.capture_player_story_decision_v1();

comment on table public.player_story_decisions is
  'Authoritative player Story decisions. The selected option is immutable for a decision version; teacher-requested rationale revisions may update the explanation without replaying trust or changing the mechanical choice.';
comment on table public.player_story_relationship_adjustments is
  'Idempotent trust ledger for authored Story consequences. Ordinary free-form replies never award trust; substantive Story decisions can award trust once through their decision record.';

commit;
