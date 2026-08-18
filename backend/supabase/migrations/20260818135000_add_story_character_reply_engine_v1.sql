begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.story_character_reply_runtime (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  max_batch_size integer not null default 100 check (max_batch_size between 1 and 200),
  lease_seconds integer not null default 120 check (lease_seconds between 30 and 600),
  updated_at timestamptz not null default now()
);

insert into private.story_character_reply_runtime (singleton, enabled, max_batch_size, lease_seconds)
values (true, true, 100, 120)
on conflict (singleton) do nothing;

create table private.story_character_reply_jobs (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  thread_id uuid not null,
  player_id uuid not null,
  source_message_id uuid not null,
  source_public_message_id text not null,
  status text not null default 'pending',
  available_at timestamptz not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  response_intent text null,
  response_topic text null,
  response_public_message_id text null,
  last_error_code text null,
  last_error_detail text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint story_character_reply_jobs_thread_fk
    foreign key (game_session_id, thread_id)
    references public.message_threads(game_session_id, id)
    on delete cascade,
  constraint story_character_reply_jobs_player_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint story_character_reply_jobs_source_message_fk
    foreign key (game_session_id, source_message_id)
    references public.messages(game_session_id, id)
    on delete cascade,
  constraint story_character_reply_jobs_source_unique
    unique (game_session_id, source_message_id),
  constraint story_character_reply_jobs_source_public_id_valid
    check (source_public_message_id ~ '^msg_[0-9a-f]{32}$'),
  constraint story_character_reply_jobs_status_valid
    check (status in ('pending','processing','retry','completed','dead_letter','superseded')),
  constraint story_character_reply_jobs_attempts_valid
    check (attempt_count >= 0 and max_attempts between 1 and 10 and attempt_count <= max_attempts),
  constraint story_character_reply_jobs_lease_valid
    check (
      (status = 'processing' and lease_token is not null and lease_expires_at is not null)
      or (status <> 'processing' and lease_token is null and lease_expires_at is null)
    ),
  constraint story_character_reply_jobs_response_id_valid
    check (
      response_public_message_id is null
      or response_public_message_id ~ '^msg_[0-9a-f]{32}$'
    ),
  constraint story_character_reply_jobs_error_code_valid
    check (
      last_error_code is null
      or (
        length(last_error_code) between 1 and 80
        and last_error_code ~ '^[A-Z0-9_]+$'
      )
    ),
  constraint story_character_reply_jobs_error_detail_valid
    check (last_error_detail is null or length(last_error_detail) <= 500)
);

create index story_character_reply_jobs_due_idx
  on private.story_character_reply_jobs (available_at, created_at)
  where status in ('pending','retry');

create index story_character_reply_jobs_processing_idx
  on private.story_character_reply_jobs (lease_expires_at)
  where status = 'processing';

create index story_character_reply_jobs_thread_idx
  on private.story_character_reply_jobs (game_session_id, thread_id, created_at desc);

alter table private.story_character_reply_runtime enable row level security;
alter table private.story_character_reply_jobs enable row level security;
alter table private.story_character_reply_runtime force row level security;
alter table private.story_character_reply_jobs force row level security;

revoke all on table private.story_character_reply_runtime from public, anon, authenticated;
revoke all on table private.story_character_reply_jobs from public, anon, authenticated;
grant select, insert, update, delete on table private.story_character_reply_runtime to service_role;
grant select, insert, update, delete on table private.story_character_reply_jobs to service_role;

create or replace function private.classify_story_character_reply_intent_v1(p_body text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_body text := lower(btrim(coalesce(p_body, '')));
begin
  if v_body = '' then
    return 'statement';
  elsif v_body ~ '(thank you|thanks|thx|appreciate)' then
    return 'gratitude';
  elsif v_body ~ '(sorry|apolog|my fault)' then
    return 'apology';
  elsif v_body ~ '(shut up|idiot|stupid|hate you|useless)' then
    return 'hostile';
  elsif v_body ~ '(i disagree|do not agree|don''t agree|that is wrong|you are wrong)' then
    return 'disagreement';
  elsif v_body ~ '(negotiate|negotiation|counteroffer|counter offer|deal|terms|salary|wage|rent|price)' then
    return 'negotiation';
  elsif v_body ~ '(worried|worry|concerned|concern|afraid|scared|risky|risk|problem)' then
    return 'concern';
  elsif v_body ~ '(should i|what would you|what do you think|recommend|advice|help me decide)' then
    return 'advice';
  elsif position('?' in v_body) > 0
    or v_body ~ '^(what|why|how|when|where|who|can|could|would|should|do|does|is|are|will)[[:space:]]'
  then
    return 'question';
  elsif v_body ~ '^(hi|hello|hey|good morning|good afternoon|good evening)([[:punct:][:space:]]|$)' then
    return 'greeting';
  elsif v_body ~ '(i agree|sounds good|makes sense|okay|^ok([[:punct:][:space:]]|$)|i will|i''ll)' then
    return 'agreement';
  end if;
  return 'statement';
end;
$function$;

create or replace function private.classify_story_character_reply_topic_v1(p_body text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_body text := lower(btrim(coalesce(p_body, '')));
begin
  if v_body ~ '(job|work|employer|employee|salary|wage|career|hiring|hire|shift|overtime)' then
    return 'employment';
  elsif v_body ~ '(house|housing|rent|lease|apartment|room|landlord|home)' then
    return 'housing';
  elsif v_body ~ '(loan|debt|credit|interest|invest|investment|stock|money|cash|bank|finance|financing)' then
    return 'finance';
  elsif v_body ~ '(business|company|client|customer|startup|supplier|contract|sale|sales|revenue|profit)' then
    return 'business';
  elsif v_body ~ '(port|ship|shipping|cargo|freight|travel|route|border|transport|logistics|customs)' then
    return 'logistics';
  elsif v_body ~ '(document|paperwork|record|permit|visa|residen|status|application|form|license)' then
    return 'records';
  elsif v_body ~ '(privacy|security|data|cyber|password|identity|account|scam|fraud|hack)' then
    return 'security';
  elsif v_body ~ '(training|credential|school|degree|skill|technology|technical|research|program)' then
    return 'education';
  elsif v_body ~ '(supply|inventory|production|factory|material|mineral|energy|water|food|shortage|capacity)' then
    return 'supply';
  end if;
  return 'general';
end;
$function$;

create or replace function private.story_character_reply_body_v1(
  p_character_key text,
  p_character_name text,
  p_relationship_stage text,
  p_trust_score integer,
  p_intent text,
  p_topic text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_country text := upper(split_part(coalesce(p_character_key, ''), '.', 2));
  v_stage text := coalesce(nullif(btrim(p_relationship_stage), ''), 'contacted');
  v_trust integer := greatest(-100, least(100, coalesce(p_trust_score, 0)));
  v_intent text := coalesce(nullif(btrim(p_intent), ''), 'statement');
  v_topic text := coalesce(nullif(btrim(p_topic), ''), 'general');
  v_lead text := '';
  v_country_line text;
  v_topic_line text;
  v_close text := '';
  v_result text;
begin
  if v_intent = 'greeting' then
    return 'Good to hear from you. What are you trying to decide?';
  elsif v_intent = 'gratitude' then
    return 'You''re welcome. Keep me posted on what you choose, especially if the terms or risks change.';
  elsif v_intent = 'apology' then
    return 'No damage done. What matters is what you do next. If there is a decision in front of you, tell me the constraint that matters most.';
  elsif v_intent = 'hostile' then
    return 'I''ll keep this useful. Give me the decision, risk, or constraint you want help with, and I''ll answer that directly.';
  end if;

  if v_trust >= 20 or v_stage = 'trusted' then
    v_lead := 'Since you''ve kept me informed, I''ll be direct. ';
  elsif v_trust <= -20 or v_stage in ('strained','broken') then
    v_lead := 'I''ll answer plainly, but trust matters here. ';
  end if;

  v_country_line := case v_country
    when 'NORTHREACH' then
      'Start with what you can verify: the terms, the documents, and what happens if employment or supply conditions change.'
    when 'YRETHIA' then
      'Get the record straight first. In a system under pressure, a small documentation mistake can become an expensive delay.'
    when 'THALORIS' then
      'Flexibility is useful, but keep the arrangement traceable. Fast opportunities are safest when the terms can still be proved later.'
    when 'SOLVEND' then
      'Look past the headline benefit and read the restrictions: credentials, ownership, confidentiality, and how easily you can move later.'
    when 'ELDORAN' then
      'Protect your cash buffer before you commit. A good opportunity can still become a bad decision if it leaves no room for a bad week.'
    when 'VALERION' then
      'Count the recurring costs and the resource constraints, not only the visible upside. Infrastructure choices always shift costs somewhere.'
    when 'LUMENOR' then
      'Separate what is verified from what people are claiming. Decisions made on uncertain information should stay reversible.'
    when 'XALVORIA' then
      'Model the downside before you accept the leverage. Ask what obligation survives if the optimistic case fails.'
    when 'DRAVENLOK' then
      'Capacity, quality, and safety have to be considered together. More output is not free if the schedule or inputs become fragile.'
    when 'SYNDALIS' then
      'Give access only to what is actually required and keep evidence. Convenience is not a reason to surrender control of your data.'
    else
      'Break the decision into what you know, what you can verify, and what you would still owe if conditions change.'
  end;

  v_topic_line := case v_topic
    when 'employment' then
      'For the job itself, compare take-home pay, schedule, location, termination terms, training obligations, and what happens to housing or status if the job ends.'
    when 'housing' then
      'For housing, compare the full recurring cost, deposit, lease length, commute, exit terms, and what happens if your income changes.'
    when 'finance' then
      'For the money side, calculate the downside case: cash required now, recurring payments, interest or dilution, liquidity, and what you still owe if the upside never arrives.'
    when 'business' then
      'For the business decision, separate revenue from cash flow and read the obligations behind the deal: delivery, quality, financing, cancellation, and counterparty risk.'
    when 'logistics' then
      'For the route or shipment, check time, documentation, insurance, border exposure, delay costs, and whether you have a viable alternate route.'
    when 'records' then
      'For the paperwork, use the recognized process, keep copies, verify names and dates, and do not treat a verbal assurance as a corrected record.'
    when 'security' then
      'For the security question, minimize access, verify the requester, preserve evidence, and do not trade permanent account or identity control for temporary convenience.'
    when 'education' then
      'For training or credentials, compare recognition, time, cost, mobility, ownership of work, and whether the program expands your options or locks you into one path.'
    when 'supply' then
      'For the supply question, check inventory coverage, replacement lead time, input concentration, storage cost, and which commitment fails first if availability tightens.'
    else
      'Give me the two options you are choosing between and the main constraint—money, time, status, or risk—and I can narrow it down.'
  end;

  v_close := case v_intent
    when 'disagreement' then
      ' You do not need to agree with me; make the alternative survive the same downside test.'
    when 'negotiation' then
      ' Know your walk-away point before you negotiate, and separate the headline price from the obligations hidden in the terms.'
    when 'concern' then
      ' The risk is real enough to plan for, but uncertainty is not the same as disaster. Keep the next move reversible.'
    when 'agreement' then
      ' Make the next step concrete and keep a record of it.'
    when 'question' then
      ' If you give me the exact option you are considering, I can narrow the answer further.'
    when 'advice' then
      ' If you tell me which tradeoff you are most willing to accept, I can be more specific.'
    else
      ' Keep the next move tied to evidence and consequences, not momentum alone.'
  end;

  v_result := btrim(v_lead || v_country_line || ' ' || v_topic_line || v_close);
  if length(v_result) > 1000 then
    v_result := left(v_result, 1000);
  end if;
  return v_result;
end;
$function$;

create or replace function private.enqueue_story_character_reply_job_v1()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_thread public.message_threads%rowtype;
  v_delay_seconds integer;
begin
  if new.sender_type <> 'player' or new.sender_player_id is null then
    return new;
  end if;

  select *
  into v_thread
  from public.message_threads as thread_row
  where thread_row.game_session_id = new.game_session_id
    and thread_row.id = new.thread_id
    and thread_row.story_character_key is not null
    and thread_row.story_player_id = new.sender_player_id
    and thread_row.status = 'active'
    and thread_row.allow_player_replies
    and thread_row.retention_until > new.created_at;

  if not found then
    return new;
  end if;

  update private.story_character_reply_jobs
  set status = 'superseded',
      lease_token = null,
      lease_expires_at = null,
      completed_at = new.created_at,
      updated_at = new.created_at
  where game_session_id = new.game_session_id
    and thread_id = new.thread_id
    and player_id = new.sender_player_id
    and status in ('pending','retry');

  v_delay_seconds := 12 + abs(mod(hashtextextended(new.id::text, 0), 29))::integer;

  insert into private.story_character_reply_jobs (
    game_session_id,
    thread_id,
    player_id,
    source_message_id,
    source_public_message_id,
    status,
    available_at,
    created_at,
    updated_at
  ) values (
    new.game_session_id,
    new.thread_id,
    new.sender_player_id,
    new.id,
    new.public_message_id,
    'pending',
    new.created_at + make_interval(secs => v_delay_seconds),
    new.created_at,
    new.created_at
  )
  on conflict (game_session_id, source_message_id) do nothing;

  return new;
end;
$function$;

drop trigger if exists enqueue_story_character_reply_job_v1 on public.messages;
create trigger enqueue_story_character_reply_job_v1
after insert on public.messages
for each row
when (new.sender_type = 'player')
execute function private.enqueue_story_character_reply_job_v1();

create or replace function public.process_due_story_character_reply_jobs_v1(
  p_limit integer default 100,
  p_now timestamptz default clock_timestamp()
)
returns table (
  processed_count integer,
  completed_count integer,
  retry_count integer,
  dead_letter_count integer,
  superseded_count integer
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_runtime private.story_character_reply_runtime%rowtype;
  v_job private.story_character_reply_jobs%rowtype;
  v_source public.messages%rowtype;
  v_thread public.message_threads%rowtype;
  v_relationship public.player_story_relationships%rowtype;
  v_delivery record;
  v_intent text;
  v_topic text;
  v_body text;
  v_country_code text;
  v_trust_delta integer;
  v_error_code text;
  v_error_detail text;
  v_processed integer := 0;
  v_completed integer := 0;
  v_retry integer := 0;
  v_dead_letter integer := 0;
  v_superseded integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 200 or p_now is null then
    raise exception 'STORY_CHARACTER_REPLY_PROCESS_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_runtime
  from private.story_character_reply_runtime
  where singleton = true;

  if not found or not v_runtime.enabled then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  for v_job in
    select job_row.*
    from private.story_character_reply_jobs as job_row
    where (
      (job_row.status in ('pending','retry') and job_row.available_at <= p_now)
      or (
        job_row.status = 'processing'
        and job_row.lease_expires_at is not null
        and job_row.lease_expires_at <= p_now
      )
    )
    order by job_row.available_at asc, job_row.created_at asc
    limit least(p_limit, v_runtime.max_batch_size)
    for update skip locked
  loop
    v_processed := v_processed + 1;

    update private.story_character_reply_jobs
    set status = 'processing',
        attempt_count = least(max_attempts, attempt_count + 1),
        lease_token = gen_random_uuid(),
        lease_expires_at = p_now + make_interval(secs => v_runtime.lease_seconds),
        last_error_code = null,
        last_error_detail = null,
        updated_at = p_now
    where id = v_job.id
    returning * into v_job;

    begin
      select *
      into strict v_source
      from public.messages as source_row
      where source_row.game_session_id = v_job.game_session_id
        and source_row.id = v_job.source_message_id
        and source_row.thread_id = v_job.thread_id
        and source_row.sender_type = 'player'
        and source_row.sender_player_id = v_job.player_id
        and source_row.hidden_at is null;

      select *
      into strict v_thread
      from public.message_threads as thread_row
      where thread_row.game_session_id = v_job.game_session_id
        and thread_row.id = v_job.thread_id
        and thread_row.story_character_key is not null
        and thread_row.story_player_id = v_job.player_id
        and thread_row.status = 'active'
        and thread_row.allow_player_replies
        and thread_row.retention_until > p_now;

      if exists (
        select 1
        from private.story_character_reply_jobs as newer_job
        where newer_job.game_session_id = v_job.game_session_id
          and newer_job.thread_id = v_job.thread_id
          and newer_job.player_id = v_job.player_id
          and newer_job.created_at > v_job.created_at
          and newer_job.status in ('pending','retry','processing','completed')
      ) then
        update private.story_character_reply_jobs
        set status = 'superseded',
            lease_token = null,
            lease_expires_at = null,
            completed_at = p_now,
            updated_at = p_now
        where id = v_job.id;
        v_superseded := v_superseded + 1;
        continue;
      end if;

      select *
      into v_relationship
      from public.player_story_relationships as relationship_row
      where relationship_row.game_session_id = v_job.game_session_id
        and relationship_row.player_id = v_job.player_id
        and relationship_row.character_key = v_thread.story_character_key;

      if not found then
        v_relationship.stage := 'engaged';
        v_relationship.trust_score := 0;
        v_relationship.relationship_role := 'other';
      end if;

      v_intent := private.classify_story_character_reply_intent_v1(v_source.body);
      v_topic := private.classify_story_character_reply_topic_v1(v_source.body);
      v_body := private.story_character_reply_body_v1(
        v_thread.story_character_key,
        v_thread.story_character_name,
        v_relationship.stage,
        v_relationship.trust_score,
        v_intent,
        v_topic
      );

      select *
      into strict v_delivery
      from public.deliver_story_character_message_v1(
        v_job.game_session_id,
        v_job.player_id,
        v_thread.story_character_key,
        v_thread.story_character_name,
        v_thread.story_conversation_key,
        v_thread.title,
        v_body,
        true,
        'char_reply_' || replace(v_job.source_message_id::text, '-', '')
      );

      v_country_code := nullif(upper(split_part(v_thread.story_character_key, '.', 2)), '');
      v_trust_delta := case
        when v_intent in ('gratitude','apology') then 1
        when v_intent = 'hostile' then -2
        else 0
      end;

      insert into public.player_story_relationships (
        game_session_id,
        player_id,
        character_key,
        character_name,
        country_code,
        relationship_role,
        stage,
        contact_count,
        reply_count,
        trust_score,
        last_contacted_at,
        last_replied_at,
        memory,
        updated_at
      ) values (
        v_job.game_session_id,
        v_job.player_id,
        v_thread.story_character_key,
        v_thread.story_character_name,
        v_country_code,
        coalesce(nullif(v_relationship.relationship_role, ''), 'other'),
        'engaged',
        1,
        1,
        v_trust_delta,
        v_delivery.created_at,
        v_source.created_at,
        jsonb_build_object(
          'lastPlayerIntent', v_intent,
          'lastPlayerTopic', v_topic,
          'lastReplyMessageId', v_source.public_message_id,
          'lastReplyAt', v_source.created_at,
          'lastCharacterReplyMessageId', v_delivery.message_id,
          'lastCharacterReplyAt', v_delivery.created_at
        ),
        v_delivery.created_at
      )
      on conflict (game_session_id, player_id, character_key) do update
      set character_name = excluded.character_name,
          country_code = coalesce(excluded.country_code, public.player_story_relationships.country_code),
          stage = case
            when public.player_story_relationships.stage = 'contacted' then 'engaged'
            else public.player_story_relationships.stage
          end,
          contact_count = public.player_story_relationships.contact_count + 1,
          trust_score = greatest(
            -100,
            least(100, public.player_story_relationships.trust_score + v_trust_delta)
          ),
          last_contacted_at = excluded.last_contacted_at,
          memory = public.player_story_relationships.memory || excluded.memory,
          updated_at = excluded.updated_at;

      update private.story_character_reply_jobs
      set status = 'completed',
          lease_token = null,
          lease_expires_at = null,
          response_intent = v_intent,
          response_topic = v_topic,
          response_public_message_id = v_delivery.message_id,
          completed_at = v_delivery.created_at,
          updated_at = v_delivery.created_at
      where id = v_job.id;

      v_completed := v_completed + 1;
    exception
      when others then
        get stacked diagnostics
          v_error_code = returned_sqlstate,
          v_error_detail = message_text;

        update private.story_character_reply_jobs
        set status = case
              when v_job.attempt_count >= v_job.max_attempts then 'dead_letter'
              else 'retry'
            end,
            available_at = case
              when v_job.attempt_count >= v_job.max_attempts then available_at
              else p_now + make_interval(
                secs => least(900, 15 * (2 ^ greatest(0, v_job.attempt_count - 1))::integer)
              )
            end,
            lease_token = null,
            lease_expires_at = null,
            last_error_code = upper(left(regexp_replace(coalesce(v_error_code, 'XX000'), '[^A-Za-z0-9_]', '_', 'g'), 80)),
            last_error_detail = left(coalesce(v_error_detail, 'Unknown character reply error.'), 500),
            completed_at = case
              when v_job.attempt_count >= v_job.max_attempts then p_now
              else null
            end,
            updated_at = p_now
        where id = v_job.id;

        if v_job.attempt_count >= v_job.max_attempts then
          v_dead_letter := v_dead_letter + 1;
        else
          v_retry := v_retry + 1;
        end if;
    end;
  end loop;

  return query select v_processed, v_completed, v_retry, v_dead_letter, v_superseded;
end;
$function$;

create or replace function public.read_story_character_reply_engine_health_v1()
returns jsonb
language sql
security definer
stable
set search_path = public, private, pg_temp
as $function$
  select jsonb_build_object(
    'enabled', coalesce((select enabled from private.story_character_reply_runtime where singleton = true), false),
    'pending', count(*) filter (where status = 'pending'),
    'retrying', count(*) filter (where status = 'retry'),
    'processing', count(*) filter (where status = 'processing'),
    'deadLetter', count(*) filter (where status = 'dead_letter'),
    'superseded', count(*) filter (where status = 'superseded'),
    'completedLastHour', count(*) filter (
      where status = 'completed' and completed_at >= now() - interval '1 hour'
    ),
    'oldestDueAt', min(available_at) filter (
      where status in ('pending','retry') and available_at <= now()
    ),
    'checkedAt', now()
  )
  from private.story_character_reply_jobs;
$function$;

create or replace function public.set_story_character_reply_engine_enabled_v1(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_updated_at timestamptz := clock_timestamp();
begin
  if p_enabled is null then
    raise exception 'STORY_CHARACTER_REPLY_ENGINE_ENABLED_INVALID' using errcode = 'P0001';
  end if;

  insert into private.story_character_reply_runtime (singleton, enabled, updated_at)
  values (true, p_enabled, v_updated_at)
  on conflict (singleton) do update
  set enabled = excluded.enabled,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'enabled', p_enabled,
    'updatedAt', v_updated_at
  );
end;
$function$;

revoke all on function private.classify_story_character_reply_intent_v1(text)
  from public, anon, authenticated;
revoke all on function private.classify_story_character_reply_topic_v1(text)
  from public, anon, authenticated;
revoke all on function private.story_character_reply_body_v1(text, text, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function private.enqueue_story_character_reply_job_v1()
  from public, anon, authenticated;

revoke all on function public.process_due_story_character_reply_jobs_v1(integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.read_story_character_reply_engine_health_v1()
  from public, anon, authenticated;
revoke all on function public.set_story_character_reply_engine_enabled_v1(boolean)
  from public, anon, authenticated;

grant execute on function public.process_due_story_character_reply_jobs_v1(integer, timestamptz)
  to service_role;
grant execute on function public.read_story_character_reply_engine_health_v1()
  to service_role;
grant execute on function public.set_story_character_reply_engine_enabled_v1(boolean)
  to service_role;

do $block$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is not null then
    for v_job_id in
      select jobid
      from cron.job
      where jobname = 'econovaria-story-character-replies-v1'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'econovaria-story-character-replies-v1',
      '* * * * *',
      $cron$select public.process_due_story_character_reply_jobs_v1(100, clock_timestamp());$cron$
    );
  end if;
end;
$block$;

comment on table private.story_character_reply_jobs is
  'Durable, player-scoped queue for bounded story-character replies. One source player message can produce at most one canonical character reply.';
comment on function public.process_due_story_character_reply_jobs_v1(integer, timestamptz) is
  'Claims due story-character reply jobs with SKIP LOCKED, generates bounded deterministic in-character responses, updates relationship memory, and delivers through canonical Messaging.';
comment on function public.read_story_character_reply_engine_health_v1() is
  'Service-role-only health snapshot for the durable story-character reply queue.';
comment on function public.set_story_character_reply_engine_enabled_v1(boolean) is
  'Service-role-only kill switch for processing story-character reply jobs. Enqueueing continues while disabled so player messages are not lost.';

commit;
