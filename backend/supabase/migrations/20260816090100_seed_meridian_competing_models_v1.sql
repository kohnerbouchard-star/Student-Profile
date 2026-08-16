begin;

create or replace function public.initialize_meridian_competing_models_v1(
  p_game_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_storyline_id uuid;
  v_contact jsonb;
  v_rules jsonb := '[]'::jsonb;
  v_followup_rules jsonb := '[]'::jsonb;
  v_game_effects jsonb;
  v_upserted integer := 0;
  v_contacts jsonb := $contacts$
[
  {
    "countryCode": "NORTHREACH",
    "characterKey": "character.northreach.edda-veyr.v1",
    "characterName": "Edda Veyr",
    "conversationKey": "relationship.northreach.edda-veyr.v1",
    "trustedTitle": "Edda Veyr — Compare the dependency, not just the construction schedule",
    "trustedBody": "Northreach can gain from long industrial orders, but every model asks us to depend on something different: Xalvorian capital, shared Lumenorian rules, Yrethian routes, or domestic guarantees. When you compare them, ask who controls strategic materials after the first wave of jobs arrives and what safeguard still works if prices turn against us.",
    "generalTitle": "Edda Veyr — Four Meridian models are now competing",
    "generalBody": "The Corridor debate has split into finance-first, multilateral, trade-and-logistics, and industrial-security models. Northreach benefits from demand for minerals and energy, but control and long-term supply commitments matter as much as the headline investment."
  },
  {
    "countryCode": "YRETHIA",
    "characterKey": "character.yrethia.leva-orren.v1",
    "characterName": "Leva Orren",
    "conversationKey": "relationship.yrethia.leva-orren.v1",
    "trustedTitle": "Leva Orren — Efficiency can become a bottleneck",
    "trustedBody": "Yrethia can make the trade-and-logistics model look very efficient because Sableport already has customs, insurance, and freight institutions. That is also the risk. Compare what happens when one port, one insurer standard, or one clearance rule becomes too important, and name the redundancy you would pay to keep.",
    "generalTitle": "Leva Orren — Meridian governance is becoming a commercial question",
    "generalBody": "Four models are competing to shape Meridian financing and control. Yrethia has a strong case for trade discipline and measurable route performance, but port concentration and compliance costs can shift benefits away from inland users and smaller operators."
  },
  {
    "countryCode": "THALORIS",
    "characterKey": "character.thaloris.vessa-tarn.v1",
    "characterName": "Vessa Tarn",
    "conversationKey": "relationship.thaloris.vessa-tarn.v1",
    "trustedTitle": "Vessa Tarn — Redundancy only matters if someone funds it",
    "trustedBody": "Thaloris can sell flexibility to a system that hates single points of failure, but emergency capacity is expensive when nobody is using it. Compare who pays to keep alternate routes ready, which standards protect trust, and when standards become a way to exclude the very redundancy everyone claims to want.",
    "generalTitle": "Vessa Tarn — Thaloris is being asked what flexibility is worth",
    "generalBody": "The trade-and-logistics proposal gives Thaloris a role as an alternate route, but the other models also need repair and overflow capacity. The argument is shifting from whether redundancy is useful to who finances it and which standards apply."
  },
  {
    "countryCode": "SOLVEND",
    "characterKey": "character.solvend.iven-sar.v1",
    "characterName": "Iven Sar",
    "conversationKey": "relationship.solvend.iven-sar.v1",
    "trustedTitle": "Iven Sar — Governance determines who gets technical access",
    "trustedBody": "Every Meridian model needs Solvend systems, but the access model changes with the governance model. A fast financier may centralize permissions; a multilateral charter may slow changes; industrial guarantees may lock technology into long contracts. Compare interoperability, audit, exit rights, and who can revoke emergency access.",
    "generalTitle": "Iven Sar — The financing debate is also a systems-design debate",
    "generalBody": "Four Meridian models are competing. Solvend can benefit under all of them, but technical ownership, interoperability, audit rights, and emergency access will be different depending on who finances and governs the Corridor."
  },
  {
    "countryCode": "ELDORAN",
    "characterKey": "character.eldoran.mera-dalen.v1",
    "characterName": "Mera Dalen",
    "conversationKey": "relationship.eldoran.mera-dalen.v1",
    "trustedTitle": "Mera Dalen — Trade volume is not the same thing as household value",
    "trustedBody": "Eldoran needs routes that move food cheaply and reliably, but a model optimized for high-value trade can still neglect storage, inland rail, and affordability. Compare who funds low-margin resilience and who absorbs the cost when the efficient route does not serve the people with the least bargaining power.",
    "generalTitle": "Mera Dalen — Meridian models distribute benefits differently",
    "generalBody": "Finance, multilateral governance, trade logistics, and industrial security can all create demand for Eldoran output. They do not distribute infrastructure, food costs, or bargaining power the same way, especially between ports, inland regions, and households."
  },
  {
    "countryCode": "VALERION",
    "characterKey": "character.valerion.celan-mire.v1",
    "characterName": "Celan Mire",
    "conversationKey": "relationship.valerion.celan-mire.v1",
    "trustedTitle": "Celan Mire — A safeguard without funding is only a sentence",
    "trustedBody": "Every delegation says it can protect water and environmental standards. Ask what those protections cost, who has authority to enforce them, and what happens when a deadline or debt covenant conflicts with a resource limit. The model that promises speed still needs an answer when physical capacity says no.",
    "generalTitle": "Celan Mire — Meridian speed is colliding with resource limits",
    "generalBody": "The four competing models offer different ways to finance and govern the Corridor. Valerion is pressing each one to explain who pays for environmental safeguards, who enforces them, and how emergency decisions interact with water and energy constraints."
  },
  {
    "countryCode": "LUMENOR",
    "characterKey": "character.lumenor.nela-corin.v1",
    "characterName": "Nela Corin",
    "conversationKey": "relationship.lumenor.nela-corin.v1",
    "trustedTitle": "Nela Corin — Legitimacy has an opportunity cost too",
    "trustedBody": "Lumenor can build a strong case for shared oversight, but delay is not an imaginary cost. Jobs, financing windows, and construction capacity can move while institutions negotiate. Compare how much delay you would accept for review rights, then specify who can act during an emergency and who reviews that action afterward.",
    "generalTitle": "Nela Corin — The Forum has four competing Meridian models",
    "generalBody": "Finance-first, multilateral governance, trade-and-logistics, and industrial-security proposals are now being compared openly. Lumenor argues for shared legitimacy and correction mechanisms, while critics warn that slow decisions can destroy real economic opportunities."
  },
  {
    "countryCode": "XALVORIA",
    "characterKey": "character.xalvoria.elian-vor.v1",
    "characterName": "Elian Vor",
    "conversationKey": "relationship.xalvoria.elian-vor.v1",
    "trustedTitle": "Elian Vor — Cheap speed becomes expensive when exit terms are vague",
    "trustedBody": "Xalvoria can assemble capital faster than the other models can assemble consensus. That is valuable. Now price the concentration risk: repayment stress, asset protections, refinancing leverage, and control rights that survive the construction boom. A serious recommendation must explain the exit, not only the funding round.",
    "generalTitle": "Elian Vor — Xalvoria is making the speed argument",
    "generalBody": "The finance-first model can move large amounts of capital quickly and create immediate construction demand. The tradeoff is concentrated leverage and control. Compare the terms that remain after repayment, not only the size of the initial package."
  },
  {
    "countryCode": "DRAVENLOK",
    "characterKey": "character.dravenlok.orsa-bren.v1",
    "characterName": "Orsa Bren",
    "conversationKey": "relationship.dravenlok.orsa-bren.v1",
    "trustedTitle": "Orsa Bren — Guaranteed demand can hide weak production decisions",
    "trustedBody": "Industrial-security guarantees give factories a schedule and workers a reason to train, but they can also lock buyers into expensive suppliers and push maintenance behind output targets. Compare the capacity we actually have with the capacity politicians want to promise, and include a rule for ending guarantees when conditions change.",
    "generalTitle": "Orsa Bren — Industrial security is gaining support",
    "generalBody": "Dravenlok and Northreach are arguing that Meridian needs guaranteed strategic capacity, not only cheap finance and efficient trade. The model supports jobs and production, but can create lock-in, high input costs, and pressure to prioritize strategic demand over civilian use."
  },
  {
    "countryCode": "SYNDALIS",
    "characterKey": "character.syndalis.aven-sorel.v1",
    "characterName": "Aven Sorel",
    "conversationKey": "relationship.syndalis.aven-sorel.v1",
    "trustedTitle": "Aven Sorel — Every governance model creates a different security failure",
    "trustedBody": "Central finance creates concentrated access. Multilateral governance creates slower coordination. Trade systems multiply external connections. Industrial security can normalize secrecy. Compare the failure mode of each model and require expiry, audit, and revocation rules before anyone calls broad access a safeguard.",
    "generalTitle": "Aven Sorel — Security is embedded in every Meridian model",
    "generalBody": "The four competing models distribute data access and operational authority differently. Syndalis is asking each proposal to explain authentication, audit, emergency access, and who can revoke permissions when the institutional model itself is under stress."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_COMPETING_MODELS_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_COMPETING_MODELS_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  -- This stage makes competing institutional models visible. It does not
  -- treat a player's recommendation as a global vote or silently mutate
  -- sovereign policy, financing, route state, or national ownership.
  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type','market_news_post',
      'payload',jsonb_build_object(
        'shockKey','meridian-competing-models-v1',
        'headline','Four competing models emerge for Meridian finance and governance',
        'explanation','Delegations are openly comparing finance-first, multilateral-governance, trade-and-logistics, and industrial-security structures. Each offers real benefits and costs, and no model has been approved as the single Meridian design.',
        'category','infrastructure',
        'scope','global',
        'targetKey',null,
        'sentiment','mixed',
        'impactStrength','medium',
        'durationTicks',12,
        'metadata',jsonb_build_object(
          'phase','meridian_competing_models','stage',2,
          'modelsVisible',4,
          'approvedOutcome','none',
          'recommendationsAreAdvisory',true,
          'financingAndGovernanceAreDistinct',true
        )
      )
    ),
    jsonb_build_object(
      'type','story_flag_set',
      'flagKey','meridian_competing_models_visible_v1',
      'value',true
    ),
    jsonb_build_object(
      'type','story_flag_set',
      'flagKey','meridian_governance_selection_status_v1',
      'value','open'
    ),
    jsonb_build_object(
      'type','story_flag_set',
      'flagKey','meridian_model_choice_not_global_vote_v1',
      'value',true
    ),
    jsonb_build_object(
      'type','contract_unlock',
      'contractKey','contract.meridian.compare-financing-governance.v1',
      'label','Compare Meridian Financing and Governance',
      'reason','Four competing Meridian models now require a player recommendation that distinguishes funding, decision authority, accepted costs, and safeguards.',
      'payload',jsonb_build_object(
        'title','Compare Meridian Financing and Governance',
        'description','Compare finance-first, multilateral-governance, trade-and-logistics, and industrial-security models, then recommend one structure or a defensible hybrid.',
        'instructions','For all four models identify funding source, decision authority, primary benefit, primary economic cost, institutional risk, a likely beneficiary, and a group needing protection. Then recommend one model or hybrid, state the final decision authority, accept at least one cost, and name two safeguards with responsible institutions.',
        'category','policy_analysis',
        'targetingPayload',jsonb_build_object('allPlayers',true),
        'requirementsPayload',jsonb_build_object(
          'manualText','Submit a fair four-model comparison, a final model or hybrid recommendation, one accepted cost, two safeguards, and the institutions responsible for those safeguards.'
        ),
        'rewardPayload',jsonb_build_object(
          'cash',jsonb_build_object('amount',300)
        ),
        'metadata',jsonb_build_object(
          'storyArc','meridian_corridor','stage',2,
          'contentSource','contract.meridian.compare-financing-governance.v1',
          'recommendationOnly',true,
          'noSessionLevelSupportMutation',true,
          'sovereignFinanceNotPlayerBanking',true,
          'hybridNotAutomaticallySuperior',true
        )
      )
    )
  );

  v_rules := v_rules || jsonb_build_array(
    jsonb_build_object(
      'ruleKey','meridian_competing_models_game_effects',
      'condition',jsonb_build_object(
        'type','player_current_country_in',
        'countryCodes',jsonb_build_array(
          'NORTHREACH','YRETHIA','THALORIS','SOLVEND','ELDORAN',
          'VALERION','LUMENOR','XALVORIA','DRAVENLOK','SYNDALIS'
        )
      ),
      'effects',v_game_effects
    )
  );

  for v_contact in select value from jsonb_array_elements(v_contacts)
  loop
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey',lower(v_contact ->> 'countryCode') || '_competing_models_trusted',
        'condition',jsonb_build_object(
          'all',jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            jsonb_build_object(
              'type','player_relationship_trust_score',
              'characterKey',v_contact ->> 'characterKey',
              'operator','at_least','score',20
            )
          )
        ),
        'effects',jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_contact ->> 'trustedTitle',
            'body',v_contact ->> 'trustedBody',
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_competing_models','stage',2,
              'branch','trusted','recommendationIsAdvisory',true
            )
          )
        )
      ),
      jsonb_build_object(
        'ruleKey',lower(v_contact ->> 'countryCode') || '_competing_models_general',
        'condition',jsonb_build_object(
          'all',jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            jsonb_build_object(
              'not',jsonb_build_object(
                'type','player_relationship_trust_score',
                'characterKey',v_contact ->> 'characterKey',
                'operator','at_least','score',20
              )
            )
          )
        ),
        'effects',jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_contact ->> 'generalTitle',
            'body',v_contact ->> 'generalBody',
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_competing_models','stage',2,
              'branch','general','recommendationIsAdvisory',true
            )
          )
        )
      )
    );

    v_followup_rules := v_followup_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey',lower(v_contact ->> 'countryCode') || '_competing_models_recommendation_recorded',
        'condition',jsonb_build_object(
          'all',jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            jsonb_build_object(
              'type','player_completed_contract',
              'contractKey','contract.meridian.compare-financing-governance.v1'
            )
          )
        ),
        'effects',jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',(v_contact ->> 'characterName') || ' — Your Meridian recommendation is on the record',
            'body','You completed the comparison before the first fracture warnings. Keep the accepted cost and safeguards beside the recommendation; if conditions change, that record will show whether you understood the tradeoff or only guessed the winning model.',
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_competing_models','stage',2,
              'branch','recommendation_recorded',
              'completionReturnsLater',true
            )
          )
        )
      ),
      jsonb_build_object(
        'ruleKey',lower(v_contact ->> 'countryCode') || '_competing_models_recommendation_open',
        'condition',jsonb_build_object(
          'all',jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            jsonb_build_object(
              'not',jsonb_build_object(
                'type','player_completed_contract',
                'contractKey','contract.meridian.compare-financing-governance.v1'
              )
            )
          )
        ),
        'effects',jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',(v_contact ->> 'characterName') || ' — The debate is moving faster than the paperwork',
            'body','The model comparison is still available, but governments and firms are already moving capital, inventory, and commitments. Do not fake certainty to finish quickly. A recommendation written after conditions change should say which assumptions are no longer true.',
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_competing_models','stage',2,
              'branch','recommendation_open',
              'completionStillOptional',true
            )
          )
        )
      )
    );
  end loop;

  insert into public.storyline_events (
    storyline_id,event_key,title,description,act,sequence,trigger_type,
    scheduled_offset_seconds,trigger_condition,reveal_payload,public_news_payload,
    player_rules,policy_payloads,flag_payloads,contract_unlock_payloads,priority,is_active
  ) values (
    v_storyline_id,
    'meridian_competing_models',
    'Four Models for Meridian',
    'Four financing and governance models become visible. Players compare speed, capital, legitimacy, trade efficiency, industrial resilience, ownership, and safeguards without selecting a global policy through a single choice.',
    1,130,'elapsed_time',43200,'{}'::jsonb,
    jsonb_build_object(
      'notificationType','story_cutscene',
      'displayMode','modal_on_next_login',
      'videoAssetKey','econovaria_cutscene_meridian_competing_models_v1',
      'posterAssetKey','econovaria_poster_meridian_competing_models_v1',
      'headline','The Meridian boom has become an argument about control',
      'summary','Finance-first, multilateral-governance, trade-and-logistics, and industrial-security proposals now compete to define who funds, builds, controls, and reviews the Corridor. Every model creates a different dependency.',
      'requiresAcknowledgement',false,
      'payload',jsonb_build_object(
        'storyArc','meridian_corridor','stage',2,
        'modelsVisible',4,
        'approvedOutcome','none',
        'recommendationIsAdvisory',true,
        'financingAndGovernanceAreDistinct',true
      )
    ),
    jsonb_build_object(
      'headline','Four competing models emerge for Meridian finance and governance',
      'explanation','Delegations are comparing finance-first, multilateral-governance, trade-and-logistics, and industrial-security structures. Each offers genuine benefits and costs; no model has been approved as the single Meridian design.',
      'category','infrastructure','scope','global','targetKey',null,
      'sentiment','mixed','impactStrength','medium','durationTicks',12,
      'source','system',
      'metadata',jsonb_build_object(
        'storyArc','meridian_corridor','stage',2,
        'modelsVisible',4,'approvedOutcome','none'
      )
    ),
    v_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'normal',false
  )
  on conflict (storyline_id,event_key) do update
  set title=excluded.title,description=excluded.description,act=excluded.act,
      sequence=excluded.sequence,trigger_type=excluded.trigger_type,
      scheduled_offset_seconds=excluded.scheduled_offset_seconds,
      trigger_condition=excluded.trigger_condition,reveal_payload=excluded.reveal_payload,
      public_news_payload=excluded.public_news_payload,player_rules=excluded.player_rules,
      policy_payloads=excluded.policy_payloads,flag_payloads=excluded.flag_payloads,
      contract_unlock_payloads=excluded.contract_unlock_payloads,
      priority=excluded.priority,is_active=false;
  v_upserted := v_upserted + 1;

  insert into public.storyline_events (
    storyline_id,event_key,title,description,act,sequence,trigger_type,
    scheduled_offset_seconds,trigger_condition,reveal_payload,public_news_payload,
    player_rules,policy_payloads,flag_payloads,contract_unlock_payloads,priority,is_active
  ) values (
    v_storyline_id,
    'meridian_competing_models_recommendation_followup',
    'Meridian Recommendation Check-In',
    'A short pre-fracture callback records whether the player completed the governance comparison while keeping the Contract available and the world state unchanged.',
    1,131,'elapsed_time',64800,'{}'::jsonb,
    '{}'::jsonb,'{}'::jsonb,
    v_followup_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'low',false
  )
  on conflict (storyline_id,event_key) do update
  set title=excluded.title,description=excluded.description,act=excluded.act,
      sequence=excluded.sequence,trigger_type=excluded.trigger_type,
      scheduled_offset_seconds=excluded.scheduled_offset_seconds,
      trigger_condition=excluded.trigger_condition,reveal_payload=excluded.reveal_payload,
      public_news_payload=excluded.public_news_payload,player_rules=excluded.player_rules,
      policy_payloads=excluded.policy_payloads,flag_payloads=excluded.flag_payloads,
      contract_unlock_payloads=excluded.contract_unlock_payloads,
      priority=excluded.priority,is_active=false;
  v_upserted := v_upserted + 1;

  return v_upserted;
end;
$function$;

create or replace function public.activate_meridian_competing_models_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status='active' then
    perform public.initialize_meridian_competing_models_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists zzm_activate_meridian_competing_models_from_full_game_v1
  on public.game_feature_activation_evidence;
create trigger zzm_activate_meridian_competing_models_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status='active')
execute function public.activate_meridian_competing_models_from_full_game_v1();

do $backfill$
declare v_game_session_id uuid;
begin
  if exists (
    select 1 from public.storylines as storyline_row
    where lower(storyline_row.key)=lower('econovaria_demo_act_1')
      and storyline_row.is_active
  ) then
    for v_game_session_id in
      select distinct activation.game_session_id
      from public.game_feature_activation_evidence as activation
      where activation.story_status='active'
    loop
      perform public.initialize_meridian_competing_models_v1(v_game_session_id);
    end loop;
  end if;
end;
$backfill$;

revoke all on function public.initialize_meridian_competing_models_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.initialize_meridian_competing_models_v1(uuid)
  to service_role;
revoke all on function public.activate_meridian_competing_models_from_full_game_v1()
  from public,anon,authenticated;

comment on function public.initialize_meridian_competing_models_v1(uuid) is
  'Attaches Stage 2 Competing Models at 12 hours plus a 18-hour recommendation callback. The comparison is advisory and auditable; it does not silently turn one player recommendation into session-level Meridian policy.';

commit;
