-- Phase 15 canonical routine convergence: current Meridian initializer contracts.
-- Definitions are copied from their latest immutable repository migrations.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Source: 20260816090100_seed_meridian_competing_models_v1.sql
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

-- Source: 20260816090200_seed_meridian_outbreak_of_war_v1.sql
create or replace function public.initialize_meridian_outbreak_of_war_v1(
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
  v_game_effects jsonb;
  v_upserted integer := 0;
  v_contacts jsonb := $contacts$
[
  {
    "countryCode":"NORTHREACH",
    "characterKey":"character.northreach.edda-veyr.v1",
    "characterName":"Edda Veyr",
    "conversationKey":"relationship.northreach.edda-veyr.v1",
    "trustedTitle":"Edda Veyr — The priority corridor is now a wartime corridor",
    "trustedBody":"Open conflict has closed the direct Syndalis–Lumenor and Dravenlok–Syndalis links. Northern mineral and fuel movements are being prioritized, but a priority order does not erase safety, documentation, or civilian need. Because we have an established line, I am sending you the verified route status before rumor overtakes it. Use that access to protect continuity, not to promise supply you cannot verify.",
    "generalTitle":"Edda Veyr — Northern freight is moving under wartime priority",
    "generalBody":"Open conflict has closed key Meridian links and placed strategic freight under priority controls. Expect delays, higher costs, and stricter records. The original attack still has no confirmed public attribution."
  },
  {
    "countryCode":"YRETHIA",
    "characterKey":"character.yrethia.leva-orren.v1",
    "characterName":"Leva Orren",
    "conversationKey":"relationship.yrethia.leva-orren.v1",
    "trustedTitle":"Leva Orren — War-risk pricing is replacing ordinary insurance",
    "trustedBody":"Carriers are invoking war-risk clauses while Sableport customs separates essential cargo from ordinary freight. Some delays are unavoidable; some people will use the emergency to hide weak records or charge for certainty they cannot provide. Verify the carrier, the route, and the exclusion before you pay a premium or repeat a claim about responsibility.",
    "generalTitle":"Leva Orren — Sableport is applying wartime insurance and customs rules",
    "generalBody":"Sableport carriers, insurers, and customs offices are operating under war-risk procedures. Essential cargo receives priority, while other shipments face delay, higher cost, and stricter verification. Attribution for the original attack remains unresolved."
  },
  {
    "countryCode":"THALORIS",
    "characterKey":"character.thaloris.vessa-tarn.v1",
    "characterName":"Vessa Tarn",
    "conversationKey":"relationship.thaloris.vessa-tarn.v1",
    "trustedTitle":"Vessa Tarn — Overflow work has become civilian triage",
    "trustedBody":"Dusk Harbor is receiving more emergency diversions than its warehouses and repair yards can absorb. The profitable job and the necessary job are no longer always the same. Record why a shipment receives space, who is displaced, and what capacity actually exists before promising relief or taking a wartime premium.",
    "generalTitle":"Vessa Tarn — Dusk Harbor is receiving emergency diversions",
    "generalBody":"Wartime route closures are diverting cargo toward Dusk Harbor. Repair, storage, and transport demand are rising, but capacity is limited and essential shipments may displace ordinary trade."
  },
  {
    "countryCode":"SOLVEND",
    "characterKey":"character.solvend.iven-sar.v1",
    "characterName":"Iven Sar",
    "conversationKey":"relationship.solvend.iven-sar.v1",
    "trustedTitle":"Iven Sar — Emergency access is expanding again",
    "trustedBody":"War protocols are isolating payment, identity, satellite, and logistics systems while emergency teams ask for broader access. Approve only the minimum scope, preserve the audit trail, and require an expiry. Open conflict is confirmed. The original attack's responsible actor is not, and technical urgency does not make an attribution claim true.",
    "generalTitle":"Iven Sar — Technical systems are operating under war controls",
    "generalBody":"Solvend networks supporting payments, identity, and logistics are shifting to isolated wartime procedures. Access reviews will slow ordinary work while emergency teams protect essential systems."
  },
  {
    "countryCode":"ELDORAN",
    "characterKey":"character.eldoran.mera-dalen.v1",
    "characterName":"Mera Dalen",
    "conversationKey":"relationship.eldoran.mera-dalen.v1",
    "trustedTitle":"Mera Dalen — The first shortage is distribution time",
    "trustedBody":"Food still exists, but closed routes, delayed settlement, and local stockpiling are turning time into scarcity. Check physical inventory before repeating a shortage claim. If you help allocate supply, write down the rule, the capacity, and who may be excluded. Panic can empty a market faster than the war does.",
    "generalTitle":"Mera Dalen — Food and payment delays are creating local shortages",
    "generalBody":"Open conflict is disrupting food distribution and settlement timing. Some local shortages reflect delayed routes rather than total supply loss, but household prices and uncertainty are rising."
  },
  {
    "countryCode":"VALERION",
    "characterKey":"character.valerion.celan-mire.v1",
    "characterName":"Celan Mire",
    "conversationKey":"relationship.valerion.celan-mire.v1",
    "trustedTitle":"Celan Mire — Essential systems cannot wait for political certainty",
    "trustedBody":"Water, energy, and transport operators are isolating exposed links and reserving capacity for essential service. Those measures can protect civilians, but every emergency restriction needs a named owner, a review date, and a condition for ending it. Continuity is the objective; permanent unreviewed control is not.",
    "generalTitle":"Celan Mire — Utilities are shifting to wartime continuity plans",
    "generalBody":"Valerion infrastructure operators are isolating exposed systems and reserving capacity for essential service. Procurement and settlement will slow while emergency continuity plans remain active."
  },
  {
    "countryCode":"LUMENOR",
    "characterKey":"character.lumenor.nela-corin.v1",
    "characterName":"Nela Corin",
    "conversationKey":"relationship.lumenor.nela-corin.v1",
    "trustedTitle":"Nela Corin — Open conflict does not resolve the original evidence",
    "trustedBody":"Governments have mobilized and mutual-defense commitments are active. Those are confirmed developments. They do not prove who carried out the original Meridian attack. The Forum is now working on civilian access, emergency diplomacy, and corrections. Preserve the difference between a party to the war, a political accusation, and evidence about the attack that began the crisis.",
    "generalTitle":"Nela Corin — Lumenor is coordinating emergency diplomacy and civilian access",
    "generalBody":"The Meridian crisis has become open conflict. Lumenor institutions are coordinating civilian access, emergency diplomacy, and verified public reporting. The original attack remains without confirmed attribution."
  },
  {
    "countryCode":"XALVORIA",
    "characterKey":"character.xalvoria.elian-vor.v1",
    "characterName":"Elian Vor",
    "conversationKey":"relationship.xalvoria.elian-vor.v1",
    "trustedTitle":"Elian Vor — Liquidity is now a survival constraint",
    "trustedBody":"Settlement delays, route closures, and war-risk pricing are forcing firms to hold more cash while revenue arrives later. Model the next two payment cycles before taking emergency credit or buying distressed assets. A profitable-looking wartime position can still fail if the financing expires before the route reopens.",
    "generalTitle":"Elian Vor — Banks are widening buffers as war risk reprices credit",
    "generalBody":"Xalvorian lenders are increasing liquidity and settlement buffers as open conflict disrupts Meridian trade. Credit costs and currency volatility are rising, especially for firms dependent on closed routes."
  },
  {
    "countryCode":"DRAVENLOK",
    "characterKey":"character.dravenlok.orsa-bren.v1",
    "characterName":"Orsa Bren",
    "conversationKey":"relationship.dravenlok.orsa-bren.v1",
    "trustedTitle":"Orsa Bren — Mobilization orders do not suspend the safety record",
    "trustedBody":"Factories are receiving priority orders while the direct Syndalis route is closed. Supervisors will call delay a national risk and may treat every shortcut as necessary. Keep the safety, quality, and allocation record intact. Wartime demand can create opportunity, but it also decides who bears the defect, injury, or missed civilian shipment.",
    "generalTitle":"Orsa Bren — Industrial production is moving under mobilization rules",
    "generalBody":"Dravenlok factories are receiving priority production orders while key Meridian routes remain closed or restricted. Work and overtime may rise alongside input shortages, safety pressure, and allocation disputes."
  },
  {
    "countryCode":"SYNDALIS",
    "characterKey":"character.syndalis.aven-sorel.v1",
    "characterName":"Aven Sorel",
    "conversationKey":"relationship.syndalis.aven-sorel.v1",
    "trustedTitle":"Aven Sorel — Blacklight is under conflict restrictions",
    "trustedBody":"I am working from the emergency site. Blacklight is under conflict restrictions, the Security Operations Center remains damaged, and two key Meridian links are closed. Keep identity, payment, housing, and travel records available through verified channels. Follow civilian instructions first. We still do not have confirmed attribution for the original attack, even though the wider conflict is now real.",
    "generalTitle":"Aven Sorel — Blacklight is under emergency conflict controls",
    "generalBody":"Open conflict has placed Blacklight under emergency restrictions and closed key Meridian routes. Emergency services are prioritizing civilians, essential payments, and verified movement. The original attacker remains unconfirmed."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_OUTBREAK_OF_WAR_GAME_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_OUTBREAK_OF_WAR_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  -- Stage 7 deliberately closes only the directly exposed corridors. Alternate
  -- routes remain restricted rather than universally closed so civilian and
  -- economic continuity work remains possible.
  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type', 'market_news_post',
      'payload', jsonb_build_object(
        'shockKey', 'meridian-outbreak-of-war-v1',
        'headline', 'Open conflict closes key Meridian routes as governments mobilize',
        'explanation', 'Retaliatory action, border incidents, mutual-defense obligations, and mobilization have turned the Meridian crisis into open conflict. Civilian travel, essential supply, settlement, and communications are disrupted. The original Meridian attack remains without confirmed public attribution.',
        'category', 'war_conflict',
        'scope', 'global',
        'targetKey', null,
        'sentiment', 'negative',
        'impactStrength', 'high',
        'durationTicks', 18,
        'metadata', jsonb_build_object(
          'phase', 'meridian_outbreak_of_war',
          'stage', 7,
          'openConflict', true,
          'attribution', 'unresolved',
          'civilianFocus', true,
          'playerAuthority', 'civilian_economic_response'
        )
      )
    ),
    jsonb_build_object(
      'type', 'world_location_state_change',
      'payload', jsonb_build_object(
        'locationIds', jsonb_build_array(
          'loc_syndalis_meridian_security_center_v1',
          'loc_syndalis_blacklight_v1'
        ),
        'availability', 'conflict'
      )
    ),
    jsonb_build_object(
      'type', 'world_location_state_change',
      'payload', jsonb_build_object(
        'locationIds', jsonb_build_array(
          'loc_lumenor_starfall_v1',
          'loc_dravenlok_ironhold_v1',
          'loc_yrethia_sableport_v1',
          'loc_eldoran_crescent_bay_v1'
        ),
        'availability', 'shortage'
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array(
          'rte_meridian_syndalis_lumenor_v1',
          'rte_meridian_dravenlok_syndalis_v1'
        ),
        'status', 'closed',
        'reason', 'war',
        'costMultiplierBasisPoints', 10000,
        'durationMultiplierBasisPoints', 10000
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array(
          'rte_meridian_xalvoria_syndalis_v1',
          'rte_meridian_lumenor_xalvoria_v1',
          'rte_meridian_xalvoria_dravenlok_v1'
        ),
        'status', 'restricted',
        'reason', 'war',
        'costMultiplierBasisPoints', 15000,
        'durationMultiplierBasisPoints', 19000
      )
    ),
    jsonb_build_object(
      'type', 'currency_volatility',
      'payload', jsonb_build_object(
        'adjustmentsBasisPoints', jsonb_build_object(
          'NRC', 280,
          'YRC', 420,
          'THD', 480,
          'SLV', 350,
          'ELD', 500,
          'VAL', 0,
          'LUM', 720,
          'SYN', 980,
          'XAL', 650,
          'DRV', 760
        )
      )
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_war_outbreak_active_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_open_conflict_status_v1',
      'value', 'active'
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_mobilization_status_v1',
      'value', 'active'
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_attack_attribution_status_v1',
      'value', 'unresolved'
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_route_resilience_status_v1',
      'value', 'severely_degraded'
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_civilian_protection_priority_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_information_integrity_priority_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.war-civilian-continuity-assessment.v1',
      'label', 'War Civilian Continuity Assessment',
      'reason', 'Open conflict has broken key routes and verification systems, requiring bounded recommendations for essential civilian continuity and fair allocation.',
      'payload', jsonb_build_object(
        'title', 'War Civilian Continuity Assessment',
        'description', 'Map one essential civilian flow disrupted by open conflict and recommend a bounded allocation and continuity response.',
        'instructions', 'Choose food, medicine, payments, utilities, transport, or shelter. Identify the broken route or verification step, available capacity, a fair allocation rule, who bears the cost, one group at risk of exclusion, and one condition for ending the emergency measure. Frame the submission as a recommendation; you do not control national systems.',
        'category', 'civilian_assistance',
        'targetingPayload', jsonb_build_object('allPlayers', true),
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the essential flow, disruption point, available capacity, allocation rule, payer, exclusion risk, and exit condition.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 550)
        ),
        'metadata', jsonb_build_object(
          'storyArc', 'meridian_corridor',
          'stage', 7,
          'playerAuthority', 'recommendation_only',
          'civilianFocus', true,
          'openConflict', true
        )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.conflict-evidence-and-correction.v1',
      'label', 'Conflict Evidence and Correction Brief',
      'reason', 'Mobilization and retaliation have accelerated public claims while attribution for the original attack remains unresolved.',
      'payload', jsonb_build_object(
        'title', 'Conflict Evidence and Correction Brief',
        'description', 'Separate confirmed wartime developments from contested claims and unresolved attribution before recommending action.',
        'instructions', 'Create a three-column evidence ledger: confirmed facts, contested claims, and unresolved questions. Identify one claim that requires correction or stronger evidence, and explain what decision can be made without naming an attacker. Do not invent private or classified evidence.',
        'category', 'information_integrity',
        'targetingPayload', jsonb_build_object('allPlayers', true),
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the evidence ledger, one correction or evidence threshold, and one bounded decision that does not depend on unsupported attribution.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 450)
        ),
        'metadata', jsonb_build_object(
          'storyArc', 'meridian_corridor',
          'stage', 7,
          'playerAuthority', 'recommendation_only',
          'attributionStatus', 'unresolved',
          'correctionRequiredWhenUnsupported', true
        )
      )
    )
  );

  v_rules := v_rules || jsonb_build_array(
    jsonb_build_object(
      'ruleKey', 'meridian_outbreak_of_war_game_effects',
      'condition', jsonb_build_object(
        'type', 'player_current_country_in',
        'countryCodes', jsonb_build_array(
          'NORTHREACH','YRETHIA','THALORIS','SOLVEND','ELDORAN',
          'VALERION','LUMENOR','XALVORIA','DRAVENLOK','SYNDALIS'
        )
      ),
      'effects', v_game_effects
    )
  );

  for v_contact in
    select value
    from jsonb_array_elements(v_contacts)
  loop
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_outbreak_of_war_trusted',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object(
              'type', 'player_current_country_is',
              'countryCode', v_contact ->> 'countryCode'
            ),
            jsonb_build_object(
              'type', 'player_relationship_trust_score',
              'characterKey', v_contact ->> 'characterKey',
              'operator', 'at_least',
              'score', 20
            )
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type', 'character_message',
            'characterKey', v_contact ->> 'characterKey',
            'characterName', v_contact ->> 'characterName',
            'conversationKey', v_contact ->> 'conversationKey',
            'title', v_contact ->> 'trustedTitle',
            'body', v_contact ->> 'trustedBody',
            'allowPlayerReplies', true,
            'payload', jsonb_build_object(
              'phase', 'meridian_outbreak_of_war',
              'stage', 7,
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'trusted',
              'openConflict', true,
              'attribution', 'unresolved',
              'playerAuthority', 'civilian_economic_response'
            )
          )
        )
      ),
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_outbreak_of_war_general',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object(
              'type', 'player_current_country_is',
              'countryCode', v_contact ->> 'countryCode'
            ),
            jsonb_build_object(
              'not', jsonb_build_object(
                'type', 'player_relationship_trust_score',
                'characterKey', v_contact ->> 'characterKey',
                'operator', 'at_least',
                'score', 20
              )
            )
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type', 'character_message',
            'characterKey', v_contact ->> 'characterKey',
            'characterName', v_contact ->> 'characterName',
            'conversationKey', v_contact ->> 'conversationKey',
            'title', v_contact ->> 'generalTitle',
            'body', v_contact ->> 'generalBody',
            'allowPlayerReplies', true,
            'payload', jsonb_build_object(
              'phase', 'meridian_outbreak_of_war',
              'stage', 7,
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'general',
              'openConflict', true,
              'attribution', 'unresolved',
              'playerAuthority', 'civilian_economic_response'
            )
          )
        )
      )
    );
  end loop;

  insert into public.storyline_events (
    storyline_id,
    event_key,
    title,
    description,
    act,
    sequence,
    trigger_type,
    scheduled_offset_seconds,
    trigger_condition,
    reveal_payload,
    public_news_payload,
    player_rules,
    policy_payloads,
    flag_payloads,
    contract_unlock_payloads,
    priority,
    is_active
  ) values (
    v_storyline_id,
    'meridian_outbreak_of_war',
    'Outbreak of War',
    'Retaliatory action, border incidents, mutual-defense obligations, and mobilization turn the Meridian crisis into open conflict. The player experiences civilian, economic, informational, and relationship consequences but does not decide whether the war exists and does not receive authority over national systems.',
    3,
    170,
    'elapsed_time',
    432000,
    '{}'::jsonb,
    jsonb_build_object(
      'notificationType', 'story_cutscene',
      'displayMode', 'modal_on_next_login',
      'videoAssetKey', 'econovaria_cutscene_meridian_outbreak_of_war_v1',
      'posterAssetKey', 'econovaria_poster_meridian_outbreak_of_war_v1',
      'headline', 'The Meridian crisis has become open war',
      'summary', 'Retaliatory action, border incidents, mutual-defense obligations, and mobilization have turned the Meridian crisis into open conflict. Key routes are closed or restricted, civilians face shortages and movement limits, and the original attack remains without confirmed public attribution.',
      'requiresAcknowledgement', true,
      'payload', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 7,
        'tone', 'civilian_consequence_and_economic_disruption',
        'openConflict', true,
        'attribution', 'unresolved',
        'playerAuthority', 'civilian_economic_response',
        'doesNotGrantNationalAuthority', true,
        'avoidSpectacle', true
      )
    ),
    jsonb_build_object(
      'headline', 'Open conflict closes key Meridian routes as governments mobilize',
      'explanation', 'Retaliatory action, border incidents, mutual-defense obligations, and mobilization have turned the Meridian crisis into open conflict. Civilian travel, essential supply, settlement, and communications are disrupted. The original attack remains without confirmed public attribution.',
      'category', 'war_conflict',
      'scope', 'global',
      'targetKey', null,
      'sentiment', 'negative',
      'impactStrength', 'high',
      'durationTicks', 18,
      'source', 'system',
      'metadata', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 7,
        'openConflict', true,
        'attribution', 'unresolved',
        'civilianFocus', true,
        'playerAuthority', 'civilian_economic_response'
      )
    ),
    v_rules,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'critical',
    false
  )
  on conflict (storyline_id, event_key) do update
  set title = excluded.title,
      description = excluded.description,
      act = excluded.act,
      sequence = excluded.sequence,
      trigger_type = excluded.trigger_type,
      scheduled_offset_seconds = excluded.scheduled_offset_seconds,
      trigger_condition = excluded.trigger_condition,
      reveal_payload = excluded.reveal_payload,
      public_news_payload = excluded.public_news_payload,
      player_rules = excluded.player_rules,
      policy_payloads = excluded.policy_payloads,
      flag_payloads = excluded.flag_payloads,
      contract_unlock_payloads = excluded.contract_unlock_payloads,
      priority = excluded.priority,
      is_active = false;

  get diagnostics v_upserted = row_count;
  return v_upserted;
end;
$function$;

-- Source: 20260816090300_seed_meridian_fortune_during_war_v1.sql
create or replace function public.initialize_meridian_fortune_during_war_v1(
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
  v_game_effects jsonb;
  v_prepared_condition jsonb;
  v_upserted integer := 0;
  v_contacts jsonb := $contacts$
[
  {
    "countryCode": "NORTHREACH",
    "characterKey": "character.northreach.edda-veyr.v1",
    "characterName": "Edda Veyr",
    "conversationKey": "relationship.northreach.edda-veyr.v1",
    "preparedTitle": "Edda Veyr — Wartime demand has turned bottlenecks into bids",
    "preparedBody": "Mineral and fuel buyers are paying for verified capacity, not merely supply. Your earlier crisis work matters here: document the bottleneck, the civilian claim on that capacity, and the financing window before you accept a premium. Profit is lawful when the service is real; it becomes fragile when the promise outruns the route.",
    "generalTitle": "Edda Veyr — Strategic buyers are bidding for verified northern capacity",
    "generalBody": "Wartime procurement is lifting prices for minerals, fuel, repair, and verified logistics. The opportunity is real, but so are civilian allocation conflicts and short financing windows."
  },
  {
    "countryCode": "YRETHIA",
    "characterKey": "character.yrethia.leva-orren.v1",
    "characterName": "Leva Orren",
    "conversationKey": "relationship.yrethia.leva-orren.v1",
    "preparedTitle": "Leva Orren — Insurance knowledge is becoming commercial leverage",
    "preparedBody": "Your earlier continuity or evidence work gives you an advantage: you know that a premium is only useful when the route, exclusion, and claim process are real. War-risk brokerage can be profitable, but record who is protected, who is excluded, and what happens when the emergency clause ends.",
    "generalTitle": "Leva Orren — War-risk insurance is creating a new market",
    "generalBody": "Carriers and firms are paying for verified war-risk coverage, customs documentation, and rerouting expertise. Weak exclusions and false certainty can turn today's fee into tomorrow's dispute."
  },
  {
    "countryCode": "THALORIS",
    "characterKey": "character.thaloris.vessa-tarn.v1",
    "characterName": "Vessa Tarn",
    "conversationKey": "relationship.thaloris.vessa-tarn.v1",
    "preparedTitle": "Vessa Tarn — Every emergency berth now has an opportunity cost",
    "preparedBody": "Because you already worked through crisis allocation, do not evaluate the berth fee alone. A premium repair or storage contract can displace food, medicine, or another vessel. Price the service, record the displaced use, and make the tradeoff visible before calling the margin clean.",
    "generalTitle": "Vessa Tarn — Diversions are creating profitable repair and storage work",
    "generalBody": "Dusk Harbor is selling scarce repair, storage, and transfer capacity at wartime premiums. Capacity is limited, so profitable allocations can impose real costs on displaced cargo."
  },
  {
    "countryCode": "SOLVEND",
    "characterKey": "character.solvend.iven-sar.v1",
    "characterName": "Iven Sar",
    "conversationKey": "relationship.solvend.iven-sar.v1",
    "preparedTitle": "Iven Sar — Continuity contracts are valuable because failure is expensive",
    "preparedBody": "Your earlier evidence discipline is exactly what this market needs. Firms will pay for isolated payment, identity, and logistics systems, but emergency access cannot become permanent access by inertia. Define minimum privilege, expiry, audit evidence, and the customer dependency you create.",
    "generalTitle": "Iven Sar — Cyber continuity spending is accelerating",
    "generalBody": "Payment, identity, logistics, and communications operators are buying isolation, recovery, and audit capacity. The commercial upside comes with access-control, privacy, and long-term dependency risk."
  },
  {
    "countryCode": "ELDORAN",
    "characterKey": "character.eldoran.mera-dalen.v1",
    "characterName": "Mera Dalen",
    "conversationKey": "relationship.eldoran.mera-dalen.v1",
    "preparedTitle": "Mera Dalen — Scarcity margins need a distribution rule",
    "preparedBody": "You have already seen how delay can look like shortage. That matters now. Emergency distribution can earn a margin by reducing spoilage and delivery time, but a high price is not evidence of a fair allocation. State the service, the margin, the rationing rule, and the households who could be priced out.",
    "generalTitle": "Mera Dalen — Emergency distribution is becoming a wartime business",
    "generalBody": "Food distributors can earn more by solving rerouting, storage, and spoilage problems. The same scarcity can also price vulnerable households out, so allocation rules matter."
  },
  {
    "countryCode": "VALERION",
    "characterKey": "character.valerion.celan-mire.v1",
    "characterName": "Celan Mire",
    "conversationKey": "relationship.valerion.celan-mire.v1",
    "preparedTitle": "Celan Mire — Resilience procurement creates contracts and lock-in",
    "preparedBody": "Your earlier continuity work gives you the right question: what happens after the emergency? Utilities will pay for backup capacity, repair, and control systems, but a temporary dependency can become permanent if exit terms are vague. Price the resilience benefit and the lock-in risk together.",
    "generalTitle": "Celan Mire — Utilities are buying resilience capacity at emergency speed",
    "generalBody": "Backup power, repair, water, transport, and control-system contracts are expanding. Suppliers can benefit, but rushed procurement can create long-term vendor dependence and weak exit terms."
  },
  {
    "countryCode": "LUMENOR",
    "characterKey": "character.lumenor.nela-corin.v1",
    "characterName": "Nela Corin",
    "conversationKey": "relationship.lumenor.nela-corin.v1",
    "preparedTitle": "Nela Corin — Reconstruction money is arriving before political certainty",
    "preparedBody": "Your earlier evidence work is a useful guardrail. Reconstruction finance can preserve jobs and civilian systems, but investors will be tempted to price political claims as settled facts. Separate verified damage, repayment capacity, public guarantees, and unresolved attribution before you call an asset cheap.",
    "generalTitle": "Nela Corin — Reconstruction finance is forming before the conflict is settled",
    "generalBody": "Lenders and investors are pricing damaged infrastructure, emergency guarantees, and future rebuilding. Returns may be substantial, but political assumptions and attribution claims remain uncertain."
  },
  {
    "countryCode": "XALVORIA",
    "characterKey": "character.xalvoria.elian-vor.v1",
    "characterName": "Elian Vor",
    "conversationKey": "relationship.xalvoria.elian-vor.v1",
    "preparedTitle": "Elian Vor — Distress creates discounts, not free money",
    "preparedBody": "You already know to test continuity and evidence before acting. Distressed firms and securities may be cheap because financing, route access, or customer demand can fail before recovery. Model liquidity through the next two settlement cycles, identify who absorbs the restructuring loss, and keep the thesis falsifiable.",
    "generalTitle": "Elian Vor — Distressed assets are trading at wartime discounts",
    "generalBody": "Route-dependent firms and securities are repricing sharply. Buying distress can create upside, but liquidity, refinancing, and counterparty failure can erase the discount before recovery arrives."
  },
  {
    "countryCode": "DRAVENLOK",
    "characterKey": "character.dravenlok.orsa-bren.v1",
    "characterName": "Orsa Bren",
    "conversationKey": "relationship.dravenlok.orsa-bren.v1",
    "preparedTitle": "Orsa Bren — Priority orders can make a factory rich and brittle",
    "preparedBody": "Your earlier crisis work should keep the cost ledger honest. Wartime manufacturing premiums are real, but so are overtime injuries, defective output, displaced civilian production, and single-buyer dependency. Measure the margin after those risks, not before them.",
    "generalTitle": "Orsa Bren — Mobilization orders are lifting industrial margins",
    "generalBody": "Factories are receiving high-priority orders for repair, components, and strategic goods. The opportunity comes with safety pressure, input scarcity, civilian displacement, and dependency on emergency buyers."
  },
  {
    "countryCode": "SYNDALIS",
    "characterKey": "character.syndalis.aven-sorel.v1",
    "characterName": "Aven Sorel",
    "conversationKey": "relationship.syndalis.aven-sorel.v1",
    "preparedTitle": "Aven Sorel — Recovery work is becoming a market while people are still displaced",
    "preparedBody": "You already worked through civilian continuity or evidence, so keep that standard now. Blacklight needs housing, payments, transport, repair, and verified records. Providers can earn money solving those problems, but the contract should say who pays, what the resident receives, and when emergency pricing ends.",
    "generalTitle": "Aven Sorel — Blacklight recovery is creating urgent commercial demand",
    "generalBody": "Housing, payment recovery, transport, repair, and documentation services are in high demand. Emergency work can be profitable, but displaced residents have little bargaining power and need transparent terms."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_FORTUNE_DURING_WAR_GAME_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_FORTUNE_DURING_WAR_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  v_prepared_condition := jsonb_build_object(
    'any', jsonb_build_array(
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.war-civilian-continuity-assessment.v1'
      ),
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.conflict-evidence-and-correction.v1'
      )
    )
  );

  -- Stage 8 is an adaptation phase, not another military escalation. It opens
  -- lawful commercial work created by disruption while preserving Stage 7's
  -- route, location, attribution, and civilian-protection state.
  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type', 'market_news_post',
      'payload', jsonb_build_object(
        'shockKey', 'meridian-fortune-during-war-v1',
        'headline', 'Wartime shortages and reconstruction bids create sharp sector winners and losers',
        'explanation', 'Open conflict is producing emergency procurement, rerouting premiums, cyber-continuity spending, distressed assets, essential-supply bottlenecks, and early reconstruction finance. These opportunities are commercially real but depend on scarce capacity, public guarantees, civilian needs, and uncertain conflict duration.',
        'category', 'war_conflict',
        'scope', 'global',
        'targetKey', null,
        'sentiment', 'mixed',
        'impactStrength', 'high',
        'durationTicks', 24,
        'metadata', jsonb_build_object(
          'phase', 'meridian_fortune_during_war',
          'stage', 8,
          'openConflict', true,
          'attribution', 'unresolved',
          'opportunityWindow', true,
          'profitMustBeExplainable', true,
          'playerAuthority', 'civilian_commercial_decision'
        )
      )
    ),
    jsonb_build_object(
      'type', 'currency_volatility',
      'payload', jsonb_build_object(
        'adjustmentsBasisPoints', jsonb_build_object(
          'NRC', 120,
          'YRC', 160,
          'THD', 180,
          'SLV', 90,
          'ELD', 140,
          'VAL', 0,
          'LUM', 220,
          'SYN', 300,
          'XAL', 240,
          'DRV', 260
        )
      )
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_wartime_opportunity_window_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_wartime_profit_requires_tradeoff_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.wartime-emergency-logistics-allocation.v1',
      'label', 'Emergency Logistics Allocation',
      'reason', 'Wartime disruption has created a lawful commercial opportunity whose profit source and human costs must be explicit.',
      'payload', jsonb_build_object(
        'title', 'Emergency Logistics Allocation',
        'description', 'Evaluate a lawful wartime logistics opportunity created by rerouting, scarce storage, or priority freight.',
        'instructions', 'Identify the bottleneck, paying customer, capacity supplied, gross margin source, civilian use that competes for the same capacity, one legal or contractual risk, one reputational risk, and the condition that ends the emergency premium. Recommend accept, modify, or decline with evidence.',
        'category', 'wartime_logistics',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested analysis with a numerical or bounded commercial recommendation and explicit tradeoffs.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 700)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 8,
            'wartimeOpportunity', true,
            'profitSource', 'scarcity premium for verified transport, storage, or rerouting capacity',
            'affectedPeople', 'civilian and essential cargo competing for the same constrained corridor',
            'legalRisk', 'priority-allocation, customs, insurance, and performance obligations',
            'reputationalRisk', 'appearing to exploit emergency scarcity or displace essential cargo',
            'longTermDependency', 'reliance on temporary war-routing demand and emergency pricing',
            'playerAuthority', 'civilian_commercial_decision',
            'mutuallyExclusive', false,
            'completionConsequence', 'available_to_later_story_conditions'
          )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.wartime-strategic-manufacturing-capacity.v1',
      'label', 'Strategic Manufacturing Capacity Bid',
      'reason', 'Wartime disruption has created a lawful commercial opportunity whose profit source and human costs must be explicit.',
      'payload', jsonb_build_object(
        'title', 'Strategic Manufacturing Capacity Bid',
        'description', 'Price a production-capacity bid created by mobilization demand without hiding safety or civilian displacement costs.',
        'instructions', 'Model units, input constraints, overtime or quality risk, emergency buyer concentration, displaced civilian production, gross margin, one compliance condition, and an exit plan for capacity after emergency demand falls. Recommend bid, cap, or decline.',
        'category', 'wartime_manufacturing',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested analysis with a numerical or bounded commercial recommendation and explicit tradeoffs.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 750)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 8,
            'wartimeOpportunity', true,
            'profitSource', 'priority procurement premiums and high utilization of scarce industrial capacity',
            'affectedPeople', 'workers and civilian customers whose production capacity may be displaced',
            'legalRisk', 'safety, quality, procurement, labor, and delivery obligations',
            'reputationalRisk', 'profiting from mobilization while hiding worker or civilian costs',
            'longTermDependency', 'single-buyer and emergency-order concentration after mobilization ends',
            'playerAuthority', 'civilian_commercial_decision',
            'mutuallyExclusive', false,
            'completionConsequence', 'available_to_later_story_conditions'
          )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.wartime-cyber-continuity-procurement.v1',
      'label', 'Cyber Continuity Procurement',
      'reason', 'Wartime disruption has created a lawful commercial opportunity whose profit source and human costs must be explicit.',
      'payload', jsonb_build_object(
        'title', 'Cyber Continuity Procurement',
        'description', 'Evaluate a paid continuity and recovery engagement for payments, identity, logistics, or communications systems.',
        'instructions', 'Define the service, customer, outage cost avoided, access requested, least-privilege boundary, audit evidence, expiry, privacy or security risk, price, and post-emergency offboarding. Recommend a bounded statement of work.',
        'category', 'wartime_cyber',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested analysis with a numerical or bounded commercial recommendation and explicit tradeoffs.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 700)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 8,
            'wartimeOpportunity', true,
            'profitSource', 'fees for isolation, recovery, monitoring, and verified continuity services',
            'affectedPeople', 'users whose payments, identity, logistics, or communications depend on the protected system',
            'legalRisk', 'access authorization, privacy, auditability, data handling, and expiry requirements',
            'reputationalRisk', 'emergency access becoming surveillance, lock-in, or unreviewed privilege',
            'longTermDependency', 'customer dependence on a wartime continuity vendor or proprietary recovery path',
            'playerAuthority', 'civilian_commercial_decision',
            'mutuallyExclusive', false,
            'completionConsequence', 'available_to_later_story_conditions'
          )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.wartime-essential-supply-distribution.v1',
      'label', 'Essential Supply Distribution Plan',
      'reason', 'Wartime disruption has created a lawful commercial opportunity whose profit source and human costs must be explicit.',
      'payload', jsonb_build_object(
        'title', 'Essential Supply Distribution Plan',
        'description', 'Design a profitable emergency distribution service without confusing scarcity pricing with fair allocation.',
        'instructions', 'Choose an essential good. Identify supply available, route delay, spoilage or storage constraint, service provided, margin source, allocation rule, payer, households or firms at risk of exclusion, anti-hoarding control, and exit condition for emergency pricing.',
        'category', 'wartime_distribution',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested analysis with a numerical or bounded commercial recommendation and explicit tradeoffs.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 650)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 8,
            'wartimeOpportunity', true,
            'profitSource', 'distribution margin earned by reducing delay, spoilage, or coordination failure',
            'affectedPeople', 'households and essential users competing for limited delivered supply',
            'legalRisk', 'rationing, anti-hoarding, consumer protection, and truthful availability claims',
            'reputationalRisk', 'price gouging or excluding vulnerable buyers during scarcity',
            'longTermDependency', 'continued scarcity and emergency allocation rules',
            'playerAuthority', 'civilian_commercial_decision',
            'mutuallyExclusive', false,
            'completionConsequence', 'available_to_later_story_conditions'
          )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.wartime-distressed-asset-memo.v1',
      'label', 'Distressed Asset Acquisition Memo',
      'reason', 'Wartime disruption has created a lawful commercial opportunity whose profit source and human costs must be explicit.',
      'payload', jsonb_build_object(
        'title', 'Distressed Asset Acquisition Memo',
        'description', 'Evaluate a wartime-discounted firm or security as an investment rather than treating distress as automatic upside.',
        'instructions', 'State the asset thesis, why it is discounted, liquidity runway, route or customer dependency, refinancing risk, recovery catalyst, downside case, who absorbs restructuring losses, evidence that would falsify the thesis, and a maximum position size.',
        'category', 'wartime_finance',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested analysis with a numerical or bounded commercial recommendation and explicit tradeoffs.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 800)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 8,
            'wartimeOpportunity', true,
            'profitSource', 'purchase discount if operations, financing, or demand recover before capital is exhausted',
            'affectedPeople', 'employees, creditors, customers, and existing owners exposed to restructuring',
            'legalRisk', 'disclosure, market conduct, creditor priority, and transaction restrictions',
            'reputationalRisk', 'being seen as exploiting distress or trading on unsupported information',
            'longTermDependency', 'timing of route reopening, refinancing, public guarantees, and conflict recovery',
            'playerAuthority', 'civilian_commercial_decision',
            'mutuallyExclusive', false,
            'completionConsequence', 'available_to_later_story_conditions'
          )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.wartime-reconstruction-finance-terms.v1',
      'label', 'Reconstruction Finance Terms',
      'reason', 'Wartime disruption has created a lawful commercial opportunity whose profit source and human costs must be explicit.',
      'payload', jsonb_build_object(
        'title', 'Reconstruction Finance Terms',
        'description', 'Structure reconstruction financing that can earn a return while making public guarantees and long-term obligations visible.',
        'instructions', 'Identify the damaged service or asset, verified need, borrower or sponsor, capital required, repayment source, public guarantee if any, expected return, affordability constraint, political or attribution assumption, covenant, and exit or refinancing path. Separate verified facts from assumptions.',
        'category', 'wartime_reconstruction',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested analysis with a numerical or bounded commercial recommendation and explicit tradeoffs.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 800)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 8,
            'wartimeOpportunity', true,
            'profitSource', 'interest, fees, or asset appreciation from financing verified reconstruction needs',
            'affectedPeople', 'taxpayers, ratepayers, residents, borrowers, and future users who service the obligation',
            'legalRisk', 'procurement, guarantee authority, disclosure, covenant, and conflict-of-interest rules',
            'reputationalRisk', 'socializing downside while privatizing emergency upside',
            'longTermDependency', 'future public revenue, guarantees, political stability, and successful reconstruction',
            'playerAuthority', 'civilian_commercial_decision',
            'mutuallyExclusive', false,
            'completionConsequence', 'available_to_later_story_conditions'
          )
      )
    )
  );

  v_rules := v_rules || jsonb_build_array(
    jsonb_build_object(
      'ruleKey', 'meridian_fortune_during_war_game_effects',
      'condition', jsonb_build_object(
        'type', 'player_current_country_in',
        'countryCodes', jsonb_build_array(
          'NORTHREACH','YRETHIA','THALORIS','SOLVEND','ELDORAN',
          'VALERION','LUMENOR','XALVORIA','DRAVENLOK','SYNDALIS'
        )
      ),
      'effects', v_game_effects
    )
  );

  for v_contact in
    select value from jsonb_array_elements(v_contacts)
  loop
    -- Prepared players get an explicit callback to the work they completed in
    -- Stage 7. Everyone else still receives a country-specific opportunity
    -- brief, so optional Contract completion changes continuity without making
    -- the main story unreachable.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_fortune_during_war_prepared',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object(
              'type', 'player_current_country_is',
              'countryCode', v_contact ->> 'countryCode'
            ),
            v_prepared_condition
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type', 'character_message',
            'characterKey', v_contact ->> 'characterKey',
            'characterName', v_contact ->> 'characterName',
            'conversationKey', v_contact ->> 'conversationKey',
            'title', v_contact ->> 'preparedTitle',
            'body', v_contact ->> 'preparedBody',
            'allowPlayerReplies', true,
            'payload', jsonb_build_object(
              'phase', 'meridian_fortune_during_war',
              'stage', 8,
              'relationshipRole', 'sponsor',
              'branch', 'stage7_prepared',
              'openConflict', true,
              'attribution', 'unresolved',
              'profitMustBeExplainable', true,
              'playerAuthority', 'civilian_commercial_decision'
            )
          )
        )
      ),
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_fortune_during_war_general',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object(
              'type', 'player_current_country_is',
              'countryCode', v_contact ->> 'countryCode'
            ),
            jsonb_build_object('not', v_prepared_condition)
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type', 'character_message',
            'characterKey', v_contact ->> 'characterKey',
            'characterName', v_contact ->> 'characterName',
            'conversationKey', v_contact ->> 'conversationKey',
            'title', v_contact ->> 'generalTitle',
            'body', v_contact ->> 'generalBody',
            'allowPlayerReplies', true,
            'payload', jsonb_build_object(
              'phase', 'meridian_fortune_during_war',
              'stage', 8,
              'relationshipRole', 'sponsor',
              'branch', 'general',
              'openConflict', true,
              'attribution', 'unresolved',
              'profitMustBeExplainable', true,
              'playerAuthority', 'civilian_commercial_decision'
            )
          )
        )
      )
    );
  end loop;

  insert into public.storyline_events (
    storyline_id,
    event_key,
    title,
    description,
    act,
    sequence,
    trigger_type,
    scheduled_offset_seconds,
    trigger_condition,
    reveal_payload,
    public_news_payload,
    player_rules,
    policy_payloads,
    flag_payloads,
    contract_unlock_payloads,
    priority,
    is_active
  ) values (
    v_storyline_id,
    'meridian_fortune_during_war',
    'Fortune During War',
    'Wartime disruption creates lawful opportunities in logistics, production, cyber continuity, essential distribution, distressed assets, and reconstruction finance. Profit comes from solving a real bottleneck or assuming a real risk; every opportunity makes the affected people, legal and reputational risks, and long-term dependency visible.',
    3,
    180,
    'elapsed_time',
    518400,
    '{}'::jsonb,
    jsonb_build_object(
      'notificationType', 'story_cutscene',
      'displayMode', 'modal_on_next_login',
      'videoAssetKey', 'econovaria_cutscene_meridian_fortune_during_war_v1',
      'posterAssetKey', 'econovaria_poster_meridian_fortune_during_war_v1',
      'headline', 'War has created shortages — and opportunities',
      'summary', 'Emergency procurement, rerouting premiums, cyber continuity, distressed assets, essential distribution, and reconstruction finance are creating winners and losers. A fortune is possible, but only when the player can explain what service or risk produces the return and who bears the tradeoff.',
      'requiresAcknowledgement', true,
      'payload', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 8,
        'tone', 'commercial_opportunity_with_moral_cost',
        'openConflict', true,
        'attribution', 'unresolved',
        'profitMustBeExplainable', true,
        'lotteryProfit', false,
        'playerAuthority', 'civilian_commercial_decision'
      )
    ),
    jsonb_build_object(
      'headline', 'Wartime shortages and reconstruction bids create sharp sector winners and losers',
      'explanation', 'Open conflict is producing emergency procurement, rerouting premiums, cyber-continuity spending, distressed assets, essential-supply bottlenecks, and early reconstruction finance. Returns depend on scarce capacity, financing, civilian demand, and uncertain conflict duration.',
      'category', 'war_conflict',
      'scope', 'global',
      'targetKey', null,
      'sentiment', 'mixed',
      'impactStrength', 'high',
      'durationTicks', 24,
      'source', 'system',
      'metadata', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 8,
        'openConflict', true,
        'attribution', 'unresolved',
        'opportunityWindow', true,
        'profitMustBeExplainable', true
      )
    ),
    v_rules,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'major',
    false
  )
  on conflict (storyline_id, event_key) do update
  set title = excluded.title,
      description = excluded.description,
      act = excluded.act,
      sequence = excluded.sequence,
      trigger_type = excluded.trigger_type,
      scheduled_offset_seconds = excluded.scheduled_offset_seconds,
      trigger_condition = excluded.trigger_condition,
      reveal_payload = excluded.reveal_payload,
      public_news_payload = excluded.public_news_payload,
      player_rules = excluded.player_rules,
      policy_payloads = excluded.policy_payloads,
      flag_payloads = excluded.flag_payloads,
      contract_unlock_payloads = excluded.contract_unlock_payloads,
      priority = excluded.priority,
      is_active = false;

  get diagnostics v_upserted = row_count;
  return v_upserted;
end;
$function$;

-- Source: 20260816090400_seed_meridian_question_of_belonging_v1.sql
create or replace function public.initialize_meridian_question_of_belonging_v1(
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
  v_game_effects jsonb;
  v_wartime_choice_condition jsonb;
  v_upserted integer := 0;
  v_contacts jsonb := $contacts$
[
  {
    "countryCode": "NORTHREACH",
    "characterKey": "character.northreach.edda-veyr.v1",
    "characterName": "Edda Veyr",
    "conversationKey": "relationship.northreach.edda-veyr.v1",
    "choiceTitle": "Edda Veyr — The work you chose is now being read as loyalty",
    "choiceBody": "The wartime work you completed is now part of your record here. Strategic employers are asking who served emergency supply, who profited from scarcity, and which foreign relationships still influence decisions. Do not invent a cleaner history. Disclose what is required, preserve private information that is not, and separate lawful commercial success from a political oath no civilian employer has authority to demand.",
    "generalTitle": "Edda Veyr — Residency and strategic-work reviews are tightening",
    "generalBody": "Northreach employers and residency offices are reviewing foreign ties around strategic industries. Be ready to document your work, transfers, and contacts without treating ordinary foreign relationships as proof of disloyalty."
  },
  {
    "countryCode": "YRETHIA",
    "characterKey": "character.yrethia.leva-orren.v1",
    "characterName": "Leva Orren",
    "conversationKey": "relationship.yrethia.leva-orren.v1",
    "choiceTitle": "Leva Orren — Your wartime transactions are becoming part of the residency file",
    "choiceBody": "The contracts you completed during the crisis now attract questions about beneficiaries, foreign counterparties, and who absorbed the risk. Answer with records, not slogans. A legitimate review can verify money flows without turning nationality into evidence. If someone asks you to endorse a political claim to keep ordinary status, ask for the legal basis in writing.",
    "generalTitle": "Leva Orren — Cross-border finance is drawing residency scrutiny",
    "generalBody": "Yrethian banks, insurers, and residency offices are increasing review of foreign beneficiaries and transfers. Documentation matters, but foreign ties alone are not evidence of wrongdoing."
  },
  {
    "countryCode": "THALORIS",
    "characterKey": "character.thaloris.vessa-tarn.v1",
    "characterName": "Vessa Tarn",
    "conversationKey": "relationship.thaloris.vessa-tarn.v1",
    "choiceTitle": "Vessa Tarn — Port access is becoming a test of who belongs",
    "choiceBody": "The wartime work you completed gave you access to scarce capacity, and people remember who received that access. Port credentials and resident work rights are now under review. Bring the allocation record with you. You can explain the decision without pretending every displaced shipment was harmless or accepting an unsupported demand to prove loyalty through politics.",
    "generalTitle": "Vessa Tarn — Port credentials and resident work rights face new review",
    "generalBody": "Thaloris is reviewing access badges, foreign contacts, and emergency port work. Keep a clear record of what you did and why; scrutiny should not erase the difference between evidence and suspicion."
  },
  {
    "countryCode": "SOLVEND",
    "characterKey": "character.solvend.iven-sar.v1",
    "characterName": "Iven Sar",
    "conversationKey": "relationship.solvend.iven-sar.v1",
    "choiceTitle": "Iven Sar — Emergency access is now a citizenship question",
    "choiceBody": "Your wartime work may have put you near protected systems. Reviewers are asking whether foreign-born operators should retain privileged access and what outside contacts must be disclosed. The answer should be a control model, not a nationality shortcut: least privilege, audit evidence, expiry, conflict disclosure, and an appeal path for disputed findings.",
    "generalTitle": "Iven Sar — Technical access reviews are expanding to foreign-resident staff",
    "generalBody": "Solvend operators are rechecking privileged access, outside affiliations, and emergency permissions. Strong controls can answer security questions without treating origin as a substitute for evidence."
  },
  {
    "countryCode": "ELDORAN",
    "characterKey": "character.eldoran.mera-dalen.v1",
    "characterName": "Mera Dalen",
    "conversationKey": "relationship.eldoran.mera-dalen.v1",
    "choiceTitle": "Mera Dalen — People remember who could buy during the shortage",
    "choiceBody": "The wartime work you completed changed who received scarce goods or money. That history now follows you into neighborhood and residency conversations. If you supported people in your former home, document the transfer and the need. If someone was excluded here, acknowledge it. Belonging built on a false story will not survive the next shortage.",
    "generalTitle": "Mera Dalen — Remittances and emergency allocations are under closer review",
    "generalBody": "Eldoran households are facing more questions about cross-border transfers and scarcity-era allocations. Keep receipts, explain legitimate support, and do not let ordinary family ties be recast as evidence without facts."
  },
  {
    "countryCode": "VALERION",
    "characterKey": "character.valerion.celan-mire.v1",
    "characterName": "Celan Mire",
    "conversationKey": "relationship.valerion.celan-mire.v1",
    "choiceTitle": "Celan Mire — Public-service contracts are becoming proof-of-belonging arguments",
    "choiceBody": "Because you completed wartime commercial work, some officials and contractors will treat that record as either loyalty or profiteering. Neither conclusion is automatic. Show the service delivered, the public dependency created, the exit terms, and any foreign conflicts that actually matter. Your status should not depend on pretending emergency procurement was morally simple.",
    "generalTitle": "Celan Mire — Infrastructure employers are tightening foreign-resident reviews",
    "generalBody": "Valerion utilities and contractors are reviewing foreign ties around essential systems. Document real conflicts and access needs; do not confuse origin with operational risk."
  },
  {
    "countryCode": "LUMENOR",
    "characterKey": "character.lumenor.nela-corin.v1",
    "characterName": "Nela Corin",
    "conversationKey": "relationship.lumenor.nela-corin.v1",
    "choiceTitle": "Nela Corin — The loyalty debate is mixing evidence with performance",
    "choiceBody": "Your wartime work is being cited in arguments about who deserves permanent status and who benefited from crisis. Keep the categories separate: verified conduct, legal eligibility, political opinion, and origin are not the same thing. You can make a case for belonging without endorsing an attribution claim that remains unresolved.",
    "generalTitle": "Nela Corin — Lumenor is debating tighter foreign-resident disclosure rules",
    "generalBody": "Residency, foreign-contact disclosure, and wartime-benefit reviews are moving into public debate. Civil-liberties groups are pressing for evidence standards and appeal rights alongside security checks."
  },
  {
    "countryCode": "XALVORIA",
    "characterKey": "character.xalvoria.elian-vor.v1",
    "characterName": "Elian Vor",
    "conversationKey": "relationship.xalvoria.elian-vor.v1",
    "choiceTitle": "Elian Vor — Your balance sheet is becoming a biography",
    "choiceBody": "The wartime position you completed now tells reviewers where you placed risk, who financed it, and which counterparties mattered. Banks can verify beneficial ownership and sanctioned flows; they should not invent motives from a passport. Reconcile the transactions, disclose material conflicts, and decide which foreign obligations you are actually willing to keep.",
    "generalTitle": "Elian Vor — Banks are increasing beneficial-ownership and residency checks",
    "generalBody": "Xalvorian institutions are reviewing cross-border funding, beneficiaries, and foreign-resident accounts more closely. Clean records matter as much as the size of the balance."
  },
  {
    "countryCode": "DRAVENLOK",
    "characterKey": "character.dravenlok.orsa-bren.v1",
    "characterName": "Orsa Bren",
    "conversationKey": "relationship.dravenlok.orsa-bren.v1",
    "choiceTitle": "Orsa Bren — A factory record can become a loyalty story very quickly",
    "choiceBody": "The wartime work you completed may be praised as service or attacked as profiteering depending on who is speaking. Keep the production, safety, allocation, and payment record together. If a reviewer wants political agreement instead of evidence about your conduct, make them state that distinction plainly.",
    "generalTitle": "Orsa Bren — Strategic factories are reviewing foreign-resident workers and suppliers",
    "generalBody": "Dravenlok industrial employers are increasing scrutiny of foreign ties and emergency production records. Workers and suppliers need clear standards so security review does not become arbitrary exclusion."
  },
  {
    "countryCode": "SYNDALIS",
    "characterKey": "character.syndalis.aven-sorel.v1",
    "characterName": "Aven Sorel",
    "conversationKey": "relationship.syndalis.aven-sorel.v1",
    "choiceTitle": "Aven Sorel — Recovery has made the question of home unavoidable",
    "choiceBody": "The wartime work you completed happened while people here were displaced, and that gives the decision weight. Residency offices are asking about foreign contacts while people from former homes ask for help. Decide what you will disclose, what support you can lawfully provide, and whether you are building a permanent life here. Do not promise two incompatible things just to pass one interview.",
    "generalTitle": "Aven Sorel — Displacement and residency review are colliding in Blacklight",
    "generalBody": "Syndalis residents are rebuilding while foreign-born residents face new contact and status reviews. The pressure is real, but ordinary family and former-home relationships still require evidence-based treatment."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_BELONGING_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_BELONGING_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  v_wartime_choice_condition := jsonb_build_object(
    'any', jsonb_build_array(
      jsonb_build_object('type', 'player_completed_contract', 'contractKey', 'contract.meridian.wartime-emergency-logistics-allocation.v1'),
      jsonb_build_object('type', 'player_completed_contract', 'contractKey', 'contract.meridian.wartime-strategic-manufacturing-capacity.v1'),
      jsonb_build_object('type', 'player_completed_contract', 'contractKey', 'contract.meridian.wartime-cyber-continuity-procurement.v1'),
      jsonb_build_object('type', 'player_completed_contract', 'contractKey', 'contract.meridian.wartime-essential-supply-distribution.v1'),
      jsonb_build_object('type', 'player_completed_contract', 'contractKey', 'contract.meridian.wartime-distressed-asset-memo.v1'),
      jsonb_build_object('type', 'player_completed_contract', 'contractKey', 'contract.meridian.wartime-reconstruction-finance-terms.v1')
    )
  );

  -- Stage 9 represents pressure and scrutiny through verified information,
  -- Contracts, and relationships. It deliberately does not apply an
  -- immigration_lock or fabricate a legal-status mutation that the player
  -- residency runtime has not established for this narrative choice.
  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type', 'market_news_post',
      'payload', jsonb_build_object(
        'shockKey', 'meridian-question-of-belonging-v1',
        'headline', 'Foreign-resident reviews expand as governments scrutinize wartime ties and transfers',
        'explanation', 'Governments and strategic employers are increasing review of foreign contacts, cross-border transfers, beneficial ownership, and emergency access. Standards vary by country, and civil-liberties groups are pressing for evidence thresholds, privacy limits, and appeal rights.',
        'category', 'policy',
        'scope', 'global',
        'targetKey', null,
        'sentiment', 'mixed',
        'impactStrength', 'medium',
        'durationTicks', 18,
        'metadata', jsonb_build_object(
          'phase', 'meridian_question_of_belonging',
          'stage', 9,
          'foreignResidentPressure', true,
          'standardsVaryByCountry', true,
          'evidenceRequired', true,
          'doesNotImposeUniversalLock', true,
          'playerAuthority', 'self_report_and_personal_decision'
        )
      )
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_belonging_review_window_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_foreign_contact_scrutiny_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.belonging-residency-review-response.v1',
      'label', 'Residency Review Response',
      'reason', 'War has moved foreign-resident status, former-home ties, and long-term belonging into the player’s daily economic life.',
      'payload', jsonb_build_object(
        'title', 'Residency Review Response',
        'description', 'Prepare a truthful, bounded response to a wartime residency or foreign-contact review without treating political agreement as evidence.',
        'instructions', 'List the information requested, identify what is legally relevant, disclose material foreign contacts or conflicts, distinguish unsupported accusations from verified facts, identify one privacy or due-process concern, and state any clarification or appeal you would request before signing.',
        'category', 'belonging_residency',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested decision record with evidence, constraints, and one explicit tradeoff.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 500)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 9,
            'belongingChoice', true,
            'playerAuthority', 'self_report_and_personal_decision',
            'doesNotMutateResidencyStatus', true,
            'doesNotSetNationalPolicy', true,
            'completionConsequence', 'available_to_reckoning_conditions'
          )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.belonging-former-home-support-plan.v1',
      'label', 'Former-Home Support Plan',
      'reason', 'War has moved foreign-resident status, former-home ties, and long-term belonging into the player’s daily economic life.',
      'payload', jsonb_build_object(
        'title', 'Former-Home Support Plan',
        'description', 'Design a lawful support plan for a person or obligation connected to the player’s former home while wartime transfer and travel scrutiny is elevated.',
        'instructions', 'Identify the person or obligation, amount or non-cash support needed, lawful transfer or delivery channel, documentation, sanctions or restriction check, impact on your adopted-country household or business, fallback if the channel closes, and the boundary you will not cross.',
        'category', 'belonging_former_home',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested decision record with evidence, constraints, and one explicit tradeoff.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 550)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 9,
            'belongingChoice', true,
            'playerAuthority', 'self_report_and_personal_decision',
            'doesNotMutateResidencyStatus', true,
            'doesNotSetNationalPolicy', true,
            'completionConsequence', 'available_to_reckoning_conditions'
          )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.belonging-long-term-status-decision.v1',
      'label', 'Long-Term Status Decision',
      'reason', 'War has moved foreign-resident status, former-home ties, and long-term belonging into the player’s daily economic life.',
      'payload', jsonb_build_object(
        'title', 'Long-Term Status Decision',
        'description', 'Make a personal long-term status recommendation: remain temporary, seek permanent status or citizenship where eligible, prepare to relocate, or defer the decision.',
        'instructions', 'Compare at least three factors: legal security, economic opportunity, relationships, former-home obligations, public-service expectations, travel or transfer restrictions, and personal values. State your preferred path, what evidence could change it, and one cost you accept by choosing it. This is a player decision memo; it does not itself mutate legal status.',
        'category', 'belonging_status',
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the requested decision record with evidence, constraints, and one explicit tradeoff.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 600)
        ),
        'metadata', jsonb_build_object(
            'storyArc', 'meridian_corridor',
            'stage', 9,
            'belongingChoice', true,
            'playerAuthority', 'self_report_and_personal_decision',
            'doesNotMutateResidencyStatus', true,
            'doesNotSetNationalPolicy', true,
            'completionConsequence', 'available_to_reckoning_conditions'
          )
      )
    )
  );

  v_rules := v_rules || jsonb_build_array(
    jsonb_build_object(
      'ruleKey', 'meridian_question_of_belonging_game_effects',
      'condition', jsonb_build_object(
        'type', 'player_current_country_in',
        'countryCodes', jsonb_build_array(
          'NORTHREACH','YRETHIA','THALORIS','SOLVEND','ELDORAN',
          'VALERION','LUMENOR','XALVORIA','DRAVENLOK','SYNDALIS'
        )
      ),
      'effects', v_game_effects
    )
  );

  for v_contact in select value from jsonb_array_elements(v_contacts)
  loop
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_belonging_wartime_choice',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object(
              'type', 'player_current_country_is',
              'countryCode', v_contact ->> 'countryCode'
            ),
            v_wartime_choice_condition
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type', 'character_message',
            'characterKey', v_contact ->> 'characterKey',
            'characterName', v_contact ->> 'characterName',
            'conversationKey', v_contact ->> 'conversationKey',
            'title', v_contact ->> 'choiceTitle',
            'body', v_contact ->> 'choiceBody',
            'allowPlayerReplies', true,
            'payload', jsonb_build_object(
              'phase', 'meridian_question_of_belonging',
              'stage', 9,
              'branch', 'wartime_choice_returned',
              'foreignResidentPressure', true,
              'playerAuthority', 'self_report_and_personal_decision'
            )
          )
        )
      ),
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_belonging_general',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object(
              'type', 'player_current_country_is',
              'countryCode', v_contact ->> 'countryCode'
            ),
            jsonb_build_object('not', v_wartime_choice_condition)
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type', 'character_message',
            'characterKey', v_contact ->> 'characterKey',
            'characterName', v_contact ->> 'characterName',
            'conversationKey', v_contact ->> 'conversationKey',
            'title', v_contact ->> 'generalTitle',
            'body', v_contact ->> 'generalBody',
            'allowPlayerReplies', true,
            'payload', jsonb_build_object(
              'phase', 'meridian_question_of_belonging',
              'stage', 9,
              'branch', 'general',
              'foreignResidentPressure', true,
              'playerAuthority', 'self_report_and_personal_decision'
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
    'meridian_question_of_belonging',
    'The Question of Belonging',
    'Foreign-resident scrutiny, disclosure demands, former-home obligations, and long-term status decisions force the player to decide what home and responsibility mean. Wartime commercial choices return as evidence about conduct, not as a morality score.',
    3,
    190,
    'elapsed_time',
    604800,
    '{}'::jsonb,
    jsonb_build_object(
      'notificationType', 'story_cutscene',
      'displayMode', 'modal_on_next_login',
      'videoAssetKey', 'econovaria_cutscene_meridian_question_of_belonging_v1',
      'posterAssetKey', 'econovaria_poster_meridian_question_of_belonging_v1',
      'headline', 'The war is asking where you belong',
      'summary', 'Foreign contacts, wartime transactions, residency reviews, and obligations to people from your former home are colliding. The player must document conduct, decide what support and disclosure are justified, and choose a long-term direction without receiving authority over national policy.',
      'requiresAcknowledgement', true,
      'payload', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 9,
        'tone', 'identity_under_institutional_pressure',
        'foreignResidentPressure', true,
        'doesNotMutateResidencyStatus', true,
        'doesNotRequirePoliticalEndorsement', true,
        'playerAuthority', 'self_report_and_personal_decision'
      )
    ),
    jsonb_build_object(
      'headline', 'Foreign-resident reviews expand as governments scrutinize wartime ties and transfers',
      'explanation', 'Governments and strategic employers are increasing review of foreign contacts, cross-border transfers, beneficial ownership, and emergency access. Standards vary by country, with continuing debate over evidence, privacy, and appeal rights.',
      'category', 'policy',
      'scope', 'global',
      'targetKey', null,
      'sentiment', 'mixed',
      'impactStrength', 'medium',
      'durationTicks', 18,
      'source', 'system',
      'metadata', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 9,
        'foreignResidentPressure', true,
        'standardsVaryByCountry', true,
        'doesNotImposeUniversalLock', true
      )
    ),
    v_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'major',false
  )
  on conflict (storyline_id,event_key) do update
  set title=excluded.title,
      description=excluded.description,
      act=excluded.act,
      sequence=excluded.sequence,
      trigger_type=excluded.trigger_type,
      scheduled_offset_seconds=excluded.scheduled_offset_seconds,
      trigger_condition=excluded.trigger_condition,
      reveal_payload=excluded.reveal_payload,
      public_news_payload=excluded.public_news_payload,
      player_rules=excluded.player_rules,
      policy_payloads=excluded.policy_payloads,
      flag_payloads=excluded.flag_payloads,
      contract_unlock_payloads=excluded.contract_unlock_payloads,
      priority=excluded.priority,
      is_active=false;

  get diagnostics v_upserted=row_count;
  return v_upserted;
end;
$function$;

-- Source: 20260816090500_seed_meridian_reckoning_v1.sql
create or replace function public.initialize_meridian_reckoning_v1(
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
  v_game_effects jsonb;
  v_reformer_core jsonb;
  v_community_core jsonb;
  v_builder_core jsonb;
  v_broker_core jsonb;
  v_magnate_core jsonb;
  v_citizen_core jsonb;
  v_family_copy jsonb := $families$
{
  "reformer": {
    "title": "The Reformer — evidence outlived the emergency",
    "body": "You preserved evidence when accusation was easier, then used the same discipline during residency review. Your chosen arena is institutional repair: procedures, corrections, appeal rights, and rules that still work after fear recedes. This ending is not a morality score; it describes the kind of leverage you repeatedly chose."
  },
  "community_leader": {
    "title": "The Community Leader — continuity became responsibility",
    "body": "You worked on civilian continuity and kept a lawful obligation to people connected to your former home. Your network is now more than a private advantage: other people rely on your judgment about scarce capacity, support, and who gets left out. The postwar test is whether that responsibility survives when emergency attention disappears."
  },
  "builder": {
    "title": "The Builder — the recovery has something with your fingerprints on it",
    "body": "You chose production, essential supply, or reconstruction finance and then made a long-term status plan. Your identity is tied to making systems function after disruption. The benefit is durable influence through useful infrastructure; the cost is that every design choice creates dependencies someone will live with after you move on."
  },
  "broker": {
    "title": "The Broker — broken networks taught you where value moves",
    "body": "You learned to move capacity, information, or capital through disrupted networks. Those skills can reconnect an economy, but they can also make instability profitable enough to become a dependency. Your ending keeps that tension visible: access is an asset, and the people without access still appear on the other side of the trade."
  },
  "magnate": {
    "title": "The Magnate — the crisis left you with exceptional liquidity",
    "body": "Your liquid balance crossed 8,000 and your wartime finance record shows that you took positions in distressed or reconstruction opportunities. The result is material power, not moral credit. Counterparties, public dependency, and the people who sold under pressure remain part of the same balance sheet that made you wealthy."
  },
  "citizen": {
    "title": "The Citizen — you chose to build a life here",
    "body": "You made a long-term status plan and built unusually high trust with the person who first helped you navigate this country. This is a narrative identity, not a legal citizenship grant: the residency system still controls actual status. What has changed is the direction of your commitments, relationships, and future planning."
  },
  "survivor": {
    "title": "The Survivor — no single identity owns your record",
    "body": "You reached the ceasefire without one dominant ending pattern. That is not failure. Your record shows adaptation rather than a fixed public identity, and the next economy will still give you room to become something more specific. What remains is the evidence of how you survived and which obligations you carried forward."
  }
}
$families$::jsonb;
  v_contacts jsonb := $contacts$
[
  {
    "countryCode": "NORTHREACH",
    "characterKey": "character.northreach.edda-veyr.v1",
    "characterName": "Edda Veyr",
    "conversationKey": "relationship.northreach.edda-veyr.v1",
    "countryFrame": "Frostgate is reopening under rationed Meridian access. Technical firms want continuity, workers want normal schedules back, and residents want to know which emergency rules are actually ending."
  },
  {
    "countryCode": "YRETHIA",
    "characterKey": "character.yrethia.leva-orren.v1",
    "characterName": "Leva Orren",
    "conversationKey": "relationship.yrethia.leva-orren.v1",
    "countryFrame": "Sableport banks and carriers are moving from emergency settlement controls toward audited recovery. Families still depend on cross-border payments, so the difference between a temporary control and a permanent barrier matters."
  },
  {
    "countryCode": "THALORIS",
    "characterKey": "character.thaloris.vessa-tarn.v1",
    "characterName": "Vessa Tarn",
    "conversationKey": "relationship.thaloris.vessa-tarn.v1",
    "countryFrame": "Dusk Harbor is clearing the backlog one berth at a time. Reopening trade will create winners again, but displaced cargo owners and crews still carry the cost of the closure."
  },
  {
    "countryCode": "SOLVEND",
    "characterKey": "character.solvend.iven-sar.v1",
    "characterName": "Iven Sar",
    "conversationKey": "relationship.solvend.iven-sar.v1",
    "countryFrame": "Aurora Spire is retiring some emergency access while preserving audit trails from the crisis. Recovery will test whether temporary technical powers really expire when the emergency does."
  },
  {
    "countryCode": "ELDORAN",
    "characterKey": "character.eldoran.mera-dalen.v1",
    "characterName": "Mera Dalen",
    "conversationKey": "relationship.eldoran.mera-dalen.v1",
    "countryFrame": "Crescent Bay shelves are filling again, but household balance sheets have not recovered at the same speed. The postwar economy will be judged by who can afford normal life, not only by whether shipments arrive."
  },
  {
    "countryCode": "VALERION",
    "characterKey": "character.valerion.celan-mire.v1",
    "characterName": "Celan Mire",
    "conversationKey": "relationship.valerion.celan-mire.v1",
    "countryFrame": "Glassfall utilities and contractors are shifting from emergency repair to long-horizon reconstruction. Procurement choices made now can either unwind wartime dependency or make it permanent."
  },
  {
    "countryCode": "LUMENOR",
    "characterKey": "character.lumenor.nela-corin.v1",
    "characterName": "Nela Corin",
    "conversationKey": "relationship.lumenor.nela-corin.v1",
    "countryFrame": "Starfall is reopening civic and commercial systems while arguments over wartime evidence continue. A ceasefire does not make a disputed claim true, and reconstruction money will amplify whichever institutions people still trust."
  },
  {
    "countryCode": "XALVORIA",
    "characterKey": "character.xalvoria.elian-vor.v1",
    "characterName": "Elian Vor",
    "conversationKey": "relationship.xalvoria.elian-vor.v1",
    "countryFrame": "Emberhall markets are repricing assets that survived the conflict. Banks want growth again, while regulators are deciding which emergency exposures and beneficial-ownership checks should remain."
  },
  {
    "countryCode": "DRAVENLOK",
    "characterKey": "character.dravenlok.orsa-bren.v1",
    "characterName": "Orsa Bren",
    "conversationKey": "relationship.dravenlok.orsa-bren.v1",
    "countryFrame": "Ironhold factories are converting emergency lines back toward civilian demand. Owners, workers, and suppliers are negotiating who absorbs the conversion cost after months of exceptional margins and exceptional risk."
  },
  {
    "countryCode": "SYNDALIS",
    "characterKey": "character.syndalis.aven-sorel.v1",
    "characterName": "Aven Sorel",
    "conversationKey": "relationship.syndalis.aven-sorel.v1",
    "countryFrame": "Blacklight is moving from conflict conditions into shortage and reconstruction. The Meridian Security Center remains closed for rebuilding, so the place where the crisis accelerated is still visibly unfinished."
  }
]
$contacts$::jsonb;
  v_upserted integer := 0;
begin
  if p_game_session_id is null or not exists (
    select 1 from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_RECKONING_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_RECKONING_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  -- Personal endings use only state that is already authoritative in the
  -- Story context. The ordering below is deliberate and makes the families
  -- mutually exclusive without inventing a hidden morality meter.
  v_reformer_core := jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.conflict-evidence-and-correction.v1'
      ),
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.belonging-residency-review-response.v1'
      )
    )
  );

  v_community_core := jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.war-civilian-continuity-assessment.v1'
      ),
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.belonging-former-home-support-plan.v1'
      )
    )
  );

  v_builder_core := jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object(
        'any', jsonb_build_array(
          jsonb_build_object(
            'type', 'player_completed_contract',
            'contractKey', 'contract.meridian.wartime-strategic-manufacturing-capacity.v1'
          ),
          jsonb_build_object(
            'type', 'player_completed_contract',
            'contractKey', 'contract.meridian.wartime-essential-supply-distribution.v1'
          ),
          jsonb_build_object(
            'type', 'player_completed_contract',
            'contractKey', 'contract.meridian.wartime-reconstruction-finance-terms.v1'
          )
        )
      ),
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.belonging-long-term-status-decision.v1'
      )
    )
  );

  v_broker_core := jsonb_build_object(
    'any', jsonb_build_array(
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.wartime-emergency-logistics-allocation.v1'
      ),
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.wartime-cyber-continuity-procurement.v1'
      ),
      jsonb_build_object(
        'type', 'player_completed_contract',
        'contractKey', 'contract.meridian.wartime-distressed-asset-memo.v1'
      )
    )
  );

  -- 8,000 is intentionally above the maximum seeded starting balance plus
  -- every cash reward in Stages 7-9 (7,607 at the current content values).
  -- The Magnate therefore requires gains from the wider economy, not only
  -- collecting the story Contracts in this arc.
  v_magnate_core := jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('type', 'player_cash_above', 'amount', 8000),
      jsonb_build_object(
        'any', jsonb_build_array(
          jsonb_build_object(
            'type', 'player_completed_contract',
            'contractKey', 'contract.meridian.wartime-distressed-asset-memo.v1'
          ),
          jsonb_build_object(
            'type', 'player_completed_contract',
            'contractKey', 'contract.meridian.wartime-reconstruction-finance-terms.v1'
          )
        )
      )
    )
  );

  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type', 'market_news_post',
      'payload', jsonb_build_object(
        'shockKey', 'meridian-unstable-ceasefire-reckoning-v1',
        'headline', 'Unstable ceasefire holds as Meridian reconstruction corridors begin reopening',
        'explanation', 'Governments have accepted an unstable ceasefire and technical reconstruction talks. Some Meridian routes are reopening under recovery restrictions, while the damaged Security Center remains closed for rebuilding. The original attack still lacks confirmed public attribution, and the political settlement remains unresolved.',
        'category', 'geopolitical',
        'scope', 'global',
        'targetKey', null,
        'sentiment', 'mixed',
        'impactStrength', 'high',
        'durationTicks', 24,
        'metadata', jsonb_build_object(
          'phase', 'meridian_reckoning',
          'stage', 10,
          'worldEndingFamily', 'unstable_ceasefire',
          'reconstruction', true,
          'attribution', 'unresolved',
          'worldAndPersonalOutcomesSeparate', true
        )
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array(
          'rte_meridian_syndalis_lumenor_v1',
          'rte_meridian_dravenlok_syndalis_v1'
        ),
        'status', 'restricted',
        'reason', 'recovery',
        'costMultiplierBasisPoints', 12500,
        'durationMultiplierBasisPoints', 14000
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array(
          'rte_meridian_xalvoria_syndalis_v1',
          'rte_meridian_lumenor_xalvoria_v1',
          'rte_meridian_xalvoria_dravenlok_v1'
        ),
        'status', 'open',
        'reason', 'recovery',
        'costMultiplierBasisPoints', 11000,
        'durationMultiplierBasisPoints', 11500
      )
    ),
    jsonb_build_object(
      'type', 'world_location_state_change',
      'payload', jsonb_build_object(
        'locationIds', jsonb_build_array(
          'loc_syndalis_meridian_security_center_v1'
        ),
        'availability', 'closed'
      )
    ),
    jsonb_build_object(
      'type', 'world_location_state_change',
      'payload', jsonb_build_object(
        'locationIds', jsonb_build_array(
          'loc_syndalis_blacklight_v1'
        ),
        'availability', 'shortage'
      )
    ),
    jsonb_build_object(
      'type', 'world_location_state_change',
      'payload', jsonb_build_object(
        'locationIds', jsonb_build_array(
          'loc_lumenor_starfall_v1',
          'loc_dravenlok_ironhold_v1',
          'loc_yrethia_sableport_v1',
          'loc_eldoran_crescent_bay_v1'
        ),
        'availability', 'normal'
      )
    ),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_war_outbreak_active_v1', 'value', false),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_open_conflict_status_v1', 'value', 'ceasefire'),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_mobilization_status_v1', 'value', 'deescalating'),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_route_resilience_status_v1', 'value', 'recovering'),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_world_resolution_v1', 'value', 'unstable_ceasefire'),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_reconstruction_phase_v1', 'value', true),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_wartime_opportunity_window_v1', 'value', false),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_belonging_review_window_v1', 'value', false),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_attack_attribution_status_v1', 'value', 'unresolved'),
    jsonb_build_object('type', 'story_flag_set', 'flagKey', 'meridian_reckoning_complete_v1', 'value', true)
  );

  v_rules := v_rules || jsonb_build_array(
    jsonb_build_object(
      'ruleKey', 'meridian_reckoning_world_resolution',
      'condition', jsonb_build_object(
        'type', 'player_current_country_in',
        'countryCodes', jsonb_build_array(
          'NORTHREACH','YRETHIA','THALORIS','SOLVEND','ELDORAN',
          'VALERION','LUMENOR','XALVORIA','DRAVENLOK','SYNDALIS'
        )
      ),
      'effects', v_game_effects
    )
  );

  for v_contact in select value from jsonb_array_elements(v_contacts)
  loop
    v_citizen_core := jsonb_build_object(
      'all', jsonb_build_array(
        jsonb_build_object(
          'type', 'player_completed_contract',
          'contractKey', 'contract.meridian.belonging-long-term-status-decision.v1'
        ),
        jsonb_build_object(
          'type', 'player_relationship_trust_score',
          'characterKey', v_contact ->> 'characterKey',
          'operator', 'at_least',
          'score', 20
        )
      )
    );

    -- Priority 1: The Reformer.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_reckoning_reformer',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            v_reformer_core
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_family_copy -> 'reformer' ->> 'title',
            'body',(v_family_copy -> 'reformer' ->> 'body') || ' ' || (v_contact ->> 'countryFrame'),
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_reckoning','stage',10,
              'worldEndingFamily','unstable_ceasefire',
              'personalEndingFamily','the_reformer',
              'classificationIsNotMoralScore',true,
              'worldAndPersonalOutcomesSeparate',true,
              'attackAttribution','unresolved'
            )
          )
        )
      )
    );

    -- Priority 2: The Community Leader.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_reckoning_community_leader',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            v_community_core,
            jsonb_build_object('not',v_reformer_core)
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_family_copy -> 'community_leader' ->> 'title',
            'body',(v_family_copy -> 'community_leader' ->> 'body') || ' ' || (v_contact ->> 'countryFrame'),
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_reckoning','stage',10,
              'worldEndingFamily','unstable_ceasefire',
              'personalEndingFamily','the_community_leader',
              'classificationIsNotMoralScore',true,
              'worldAndPersonalOutcomesSeparate',true,
              'attackAttribution','unresolved'
            )
          )
        )
      )
    );

    -- Priority 3: The Builder.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_reckoning_builder',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            v_builder_core,
            jsonb_build_object('not',jsonb_build_object('any',jsonb_build_array(v_reformer_core,v_community_core)))
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_family_copy -> 'builder' ->> 'title',
            'body',(v_family_copy -> 'builder' ->> 'body') || ' ' || (v_contact ->> 'countryFrame'),
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_reckoning','stage',10,
              'worldEndingFamily','unstable_ceasefire',
              'personalEndingFamily','the_builder',
              'classificationIsNotMoralScore',true,
              'worldAndPersonalOutcomesSeparate',true,
              'attackAttribution','unresolved'
            )
          )
        )
      )
    );

    -- Priority 4: The Broker.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_reckoning_broker',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            v_broker_core,
            jsonb_build_object('not',jsonb_build_object('any',jsonb_build_array(v_reformer_core,v_community_core,v_builder_core)))
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_family_copy -> 'broker' ->> 'title',
            'body',(v_family_copy -> 'broker' ->> 'body') || ' ' || (v_contact ->> 'countryFrame'),
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_reckoning','stage',10,
              'worldEndingFamily','unstable_ceasefire',
              'personalEndingFamily','the_broker',
              'classificationIsNotMoralScore',true,
              'worldAndPersonalOutcomesSeparate',true,
              'attackAttribution','unresolved'
            )
          )
        )
      )
    );

    -- Priority 5: The Magnate. Wealth does not override the prior identity
    -- families, and the threshold cannot be reached from Stage 7-9 story
    -- rewards alone at current seeded values.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_reckoning_magnate',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            v_magnate_core,
            jsonb_build_object('not',jsonb_build_object('any',jsonb_build_array(v_reformer_core,v_community_core,v_builder_core,v_broker_core)))
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_family_copy -> 'magnate' ->> 'title',
            'body',(v_family_copy -> 'magnate' ->> 'body') || ' ' || (v_contact ->> 'countryFrame'),
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_reckoning','stage',10,
              'worldEndingFamily','unstable_ceasefire',
              'personalEndingFamily','the_magnate',
              'classificationBasis','liquid_cash_plus_wartime_finance_record',
              'liquidCashThreshold',8000,
              'classificationIsNotMoralScore',true,
              'worldAndPersonalOutcomesSeparate',true,
              'attackAttribution','unresolved'
            )
          )
        )
      )
    );

    -- Priority 6: The Citizen. This is explicitly a narrative identity, not
    -- a mutation of authoritative legal residency/citizenship state.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_reckoning_citizen',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            v_citizen_core,
            jsonb_build_object('not',jsonb_build_object('any',jsonb_build_array(v_reformer_core,v_community_core,v_builder_core,v_broker_core,v_magnate_core)))
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_family_copy -> 'citizen' ->> 'title',
            'body',(v_family_copy -> 'citizen' ->> 'body') || ' ' || (v_contact ->> 'countryFrame'),
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_reckoning','stage',10,
              'worldEndingFamily','unstable_ceasefire',
              'personalEndingFamily','the_citizen',
              'narrativeIdentityNotLegalStatus',true,
              'classificationIsNotMoralScore',true,
              'worldAndPersonalOutcomesSeparate',true,
              'attackAttribution','unresolved'
            )
          )
        )
      )
    );

    -- Exhaustive fallback: The Survivor.
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_reckoning_survivor',
        'condition', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
            jsonb_build_object(
              'not', jsonb_build_object(
                'any', jsonb_build_array(
                  v_reformer_core,v_community_core,v_builder_core,
                  v_broker_core,v_magnate_core,v_citizen_core
                )
              )
            )
          )
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type','character_message',
            'characterKey',v_contact ->> 'characterKey',
            'characterName',v_contact ->> 'characterName',
            'conversationKey',v_contact ->> 'conversationKey',
            'title',v_family_copy -> 'survivor' ->> 'title',
            'body',(v_family_copy -> 'survivor' ->> 'body') || ' ' || (v_contact ->> 'countryFrame'),
            'allowPlayerReplies',true,
            'payload',jsonb_build_object(
              'phase','meridian_reckoning','stage',10,
              'worldEndingFamily','unstable_ceasefire',
              'personalEndingFamily','the_survivor',
              'classificationIsNotMoralScore',true,
              'worldAndPersonalOutcomesSeparate',true,
              'attackAttribution','unresolved'
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
    'meridian_reckoning',
    'Reckoning',
    'An unstable ceasefire moves the Meridian system from open conflict into constrained recovery. The world ending is recorded separately from a player ending derived from actual economic choices, relationship trust, and prior Contract completion.',
    3,
    200,
    'elapsed_time',
    691200,
    '{}'::jsonb,
    jsonb_build_object(
      'notificationType','story_cutscene',
      'displayMode','modal_on_next_login',
      'videoAssetKey','econovaria_cutscene_meridian_reckoning_v1',
      'posterAssetKey','econovaria_poster_meridian_reckoning_v1',
      'headline','The guns quiet. The ledger remains.',
      'summary','An unstable ceasefire has ended the current phase of open conflict. Routes reopen unevenly, reconstruction begins, and the original Meridian attack remains unresolved. Your personal ending reflects what you actually did and who came to rely on you; it is not a morality score and does not rewrite legal status.',
      'requiresAcknowledgement',true,
      'payload',jsonb_build_object(
        'storyArc','meridian_corridor','stage',10,
        'worldEndingFamily','unstable_ceasefire',
        'worldAndPersonalOutcomesSeparate',true,
        'attackAttribution','unresolved',
        'reconstruction',true,
        'personalEndingIsNarrativeClassification',true,
        'doesNotMutateResidencyStatus',true
      )
    ),
    jsonb_build_object(
      'headline','Unstable ceasefire holds as Meridian reconstruction corridors begin reopening',
      'explanation','Governments have accepted an unstable ceasefire and technical reconstruction talks. Direct Meridian links reopen only under recovery restrictions, alternate routes improve, and the damaged Security Center remains closed. The original attack remains unresolved and no side receives a mechanically fabricated moral victory.',
      'category','geopolitical',
      'scope','global',
      'targetKey',null,
      'sentiment','mixed',
      'impactStrength','high',
      'durationTicks',24,
      'source','system',
      'metadata',jsonb_build_object(
        'storyArc','meridian_corridor','stage',10,
        'worldEndingFamily','unstable_ceasefire',
        'routeRecovery',true,
        'attribution','unresolved',
        'victoryClaim','none'
      )
    ),
    v_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'critical',false
  )
  on conflict (storyline_id,event_key) do update
  set title=excluded.title,
      description=excluded.description,
      act=excluded.act,
      sequence=excluded.sequence,
      trigger_type=excluded.trigger_type,
      scheduled_offset_seconds=excluded.scheduled_offset_seconds,
      trigger_condition=excluded.trigger_condition,
      reveal_payload=excluded.reveal_payload,
      public_news_payload=excluded.public_news_payload,
      player_rules=excluded.player_rules,
      policy_payloads=excluded.policy_payloads,
      flag_payloads=excluded.flag_payloads,
      contract_unlock_payloads=excluded.contract_unlock_payloads,
      priority=excluded.priority,
      is_active=false;

  get diagnostics v_upserted=row_count;
  return v_upserted;
end;
$function$;

-- Source: 20260816090600_seed_meridian_local_friend_relationships_v1.sql
create or replace function public.initialize_meridian_local_friend_relationships_v1(
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
  v_intro_rules jsonb := '[]'::jsonb;
  v_fracture_rules jsonb := '[]'::jsonb;
  v_war_rules jsonb := '[]'::jsonb;
  v_belonging_rules jsonb := '[]'::jsonb;
  v_contacts jsonb := $contacts$
[
  {
    "country": "northreach",
    "countryCode": "NORTHREACH",
    "characterKey": "character.northreach.jonis-hale.v1",
    "characterName": "Jonis Hale",
    "conversationKey": "relationship.northreach.jonis-hale.v1",
    "intro": "Edda said you were new to Frostgate. I work on equipment around the northern yards. If you want the version of this place that does not fit in an intake packet, ask me before you sign anything tied to employer housing or overtime.",
    "fractureEngaged": "You asked what the export review feels like outside the offices. On the maintenance floor it means more rush orders, more overtime, and more people pretending fatigue is not a cost. Higher pay helps, but a broken shift schedule is still a broken shift schedule.",
    "fractureWaiting": "The export review is already changing work around Frostgate. More overtime is opening up, but so is pressure to move faster with the same crews. If you take the extra money, keep enough distance to notice when the schedule stops being safe.",
    "warEngaged": "Emergency maintenance has become the job nobody can postpone. Some crews are earning more than they ever have, while ordinary repairs wait and housing near secure sites gets tighter. If you profit from the demand, remember which work got pushed aside to make room for it.",
    "warWaiting": "Frostgate is running emergency maintenance almost continuously now. There is money in it, but civilian equipment and ordinary repair work are being delayed. That tradeoff is showing up in prices long before anyone calls it a shortage.",
    "belongingEngaged": "People keep talking as if a clean disclosure form proves loyalty. You have actually been here through the ugly part, so do not let anyone reduce your place in Frostgate to one employer or one document. Decide what you can disclose without giving away your whole life.",
    "belongingWaiting": "Foreign-worker reviews are getting stricter. Do the required paperwork, but read every request before assuming it is mandatory. Belonging should not mean handing over more of your private life than the law actually asks for."
  },
  {
    "country": "yrethia",
    "countryCode": "YRETHIA",
    "characterKey": "character.yrethia.perran-dey.v1",
    "characterName": "Perran Dey",
    "conversationKey": "relationship.yrethia.perran-dey.v1",
    "intro": "Leva gave me your name. I schedule cargo after most offices close, which means I see where the official process works and where people quietly keep it moving. If Sableport starts feeling impossible, send me the actual problem, not the rumor around it.",
    "fractureEngaged": "The capacity warnings are real. What people miss is that every extra document check becomes somebody's night shift. Stricter rules can protect the port, but if nobody funds the labor behind them, the delay just moves from one desk to another.",
    "fractureWaiting": "Sableport is tightening verification while cargo keeps arriving. Expect more delays even when nobody has done anything wrong. The port can demand better records, but it cannot pretend the extra work has no labor cost.",
    "warEngaged": "Closed routes are pushing more cargo through fewer safe windows. Overtime is up, but so are mistakes and arguments about who gets priority. Emergency logistics pays well because someone else is waiting for what you move first.",
    "warWaiting": "The wartime schedules look profitable from the outside. Inside the terminal, every priority shipment means another shipment waits. If you enter emergency logistics, keep track of whose delay is financing your opportunity.",
    "belongingEngaged": "They are asking foreign workers for more client and contact history now. You know how much a clean record matters here, but a request can still be broader than necessary. Protect your license, your people, and the distinction between suspicion and evidence.",
    "belongingWaiting": "Residency and professional reviews are expanding. Keep your records exact, but do not treat every question as proof that you or a client did something wrong. Sableport works only if verification stays different from accusation."
  },
  {
    "country": "thaloris",
    "countryCode": "THALORIS",
    "characterKey": "character.thaloris.kalen-ro.v1",
    "characterName": "Kalen Ro",
    "conversationKey": "relationship.thaloris.kalen-ro.v1",
    "intro": "Vessa told me another newcomer landed in Dusk Harbor. I am in the repair yards most days. If you want to know which jobs teach you something and which just burn through people, I can usually tell you before the contract does.",
    "fractureEngaged": "All this overflow cargo is good for the yards until someone decides speed is evidence of quality. We can keep half the region moving, but we need records and certification strong enough that other ports stop treating every Thalorian repair as a gamble.",
    "fractureWaiting": "Overflow work is rising fast. The money is real, but so is the scrutiny. If you take repair or routing work, document it well enough that the next client sees a professional job instead of just a cheap alternative.",
    "warEngaged": "The emergency routes made Dusk Harbor essential overnight. That feels good until you see small operators pushed out because they cannot absorb the new insurance costs. There is profit in recognized capacity now, and a real question about who gets excluded from it.",
    "warWaiting": "Emergency routing has made Dusk Harbor busier and more expensive. Approved operators are gaining power while smaller crews struggle with insurance and documentation. Opportunity and concentration are arriving together.",
    "belongingEngaged": "Some people are saying the safest future is to join a large recognized operator and forget the smaller shops. Maybe that is right for you. Just do not confuse acceptance by an institution with acceptance by the community that carried you before it was profitable.",
    "belongingWaiting": "Long-term status is easier through recognized firms now. Read the offer carefully. A stable future can be worth a lot, but it can also quietly require you to leave the people and businesses that helped you enter the market."
  },
  {
    "country": "solvend",
    "countryCode": "SOLVEND",
    "characterKey": "character.solvend.liora-fen.v1",
    "characterName": "Liora Fen",
    "conversationKey": "relationship.solvend.liora-fen.v1",
    "intro": "Iven said you are still sorting out how your credentials translate here. I test systems for a living, mostly on temporary contracts. If somebody tells you a training path is guaranteed, ask what happens after the subsidy ends.",
    "fractureEngaged": "The talent shortage is turning into tighter access rules. Companies are paying more while making it harder to move between teams. A higher salary can still be a worse bargain if the contract owns your next three choices.",
    "fractureWaiting": "Strategic employers are raising pay and tightening mobility at the same time. Before you accept a shortage bonus, read the confidentiality, transfer, and service clauses. Scarcity gives workers leverage only if they can still leave.",
    "warEngaged": "Secure-systems work is everywhere now, but civilian projects are being postponed and contractors are being asked to carry permanent responsibility on temporary terms. If you enter the emergency programs, price the obligation, not just the wage.",
    "warWaiting": "Wartime technical work pays because the systems cannot fail. The catch is that temporary people are being given long-term responsibility without always getting long-term security. Make sure the risk and the status move together.",
    "belongingEngaged": "Strategic-service residency sounds simple until the restrictions arrive with it. You have earned options here. Decide whether permanent status is worth limits on employers, collaborators, travel, or publication before anyone calls the tradeoff gratitude.",
    "belongingWaiting": "Permanent-status programs are expanding for strategic workers. They can be valuable, but the conditions can follow you for years. Read mobility and collaboration limits as carefully as the residency benefit."
  },
  {
    "country": "eldoran",
    "countryCode": "ELDORAN",
    "characterKey": "character.eldoran.oren-pell.v1",
    "characterName": "Oren Pell",
    "conversationKey": "relationship.eldoran.oren-pell.v1",
    "intro": "Mera said you might end up around the markets or rail offices. I track distribution schedules, so I spend most days watching a small delay become a price change three towns away. If you want to understand Eldoran, follow the shipment before the headline.",
    "fractureEngaged": "The harvest revision is pushing everyone to move inventory earlier. That can protect supply, but it also lets people with cash buy capacity before smaller shops know they need it. Efficiency looks different depending on who gets the warehouse space first.",
    "fractureWaiting": "The weaker harvest forecast is already changing storage and transport demand. Prices do not rise only because food is scarce; they also rise when everyone competes for the same rail slots and warehouses at once.",
    "warEngaged": "Emergency food distribution is paying better because every allocation decision matters more. A premium contract can keep one region supplied and make another wait. If you take the work, measure service as carefully as revenue.",
    "warWaiting": "Food logistics is one of the safest-looking wartime opportunities, but every priority list has a bottom. If you earn from emergency distribution, keep track of which households or towns absorb the delay.",
    "belongingEngaged": "People are starting to ask whether a foreign-born operator can be trusted with reserve or distribution work. Your record matters, but so does whether the system judges the work or the person. Do not accept a loyalty test disguised as an efficiency rule without examining it.",
    "belongingWaiting": "Foreign-owned and foreign-run businesses are getting more scrutiny around food supply. Keep your records clean, but remember that extra scrutiny can become a cost even when no rule was broken."
  },
  {
    "country": "valerion",
    "countryCode": "VALERION",
    "characterKey": "character.valerion.ressa-vail.v1",
    "characterName": "Ressa Vail",
    "conversationKey": "relationship.valerion.ressa-vail.v1",
    "intro": "Celan said you were deciding how much of Glassfall you can actually afford. I work customer support for the utilities, which means I hear what conservation policy sounds like after it reaches a household bill. Ask me before assuming the public brochure tells the whole story.",
    "fractureEngaged": "The reservoir warning is making every department talk about resilience. Households are already asking why they should cut more while large projects keep their commitments. Conservation can be necessary and still be distributed unfairly.",
    "fractureWaiting": "Water pressure is becoming an affordability problem as well as an environmental one. Watch who gets exceptions, who gets higher bills, and who has enough money to buy efficiency instead of simply using less.",
    "warEngaged": "Emergency energy and water work has funding now, but some projects solve strategic supply by raising costs elsewhere. If you profit from resilience, look at the bill a household receives after the project is called successful.",
    "warWaiting": "Resilience projects are expanding quickly. They can protect the grid and still make access more expensive. Wartime investment is not automatically public benefit just because the infrastructure is important.",
    "belongingEngaged": "Strategic project work may help your residency case. Just remember that a nationally important project can still hurt ordinary users. If status depends on defending every consequence of your employer's work, that is a larger obligation than employment.",
    "belongingWaiting": "Long-term status is increasingly tied to essential infrastructure work. That can be a real path forward, but check whether the commitment also expects public support for decisions you did not make."
  },
  {
    "country": "lumenor",
    "countryCode": "LUMENOR",
    "characterKey": "character.lumenor.arven-lis.v1",
    "characterName": "Arven Lis",
    "conversationKey": "relationship.lumenor.arven-lis.v1",
    "intro": "Nela said you are still learning which Starfall offices actually answer questions. I work in public records. If you ever see two official versions of the same fact, keep both. Corrections are useful only when the earlier record does not disappear.",
    "fractureEngaged": "The Forum is getting louder and the evidence is getting thinner. I am seeing claims repeated because three offices cite one another, not because three sources verified them. If you work around policy or media, trace the claim back to the first record.",
    "fractureWaiting": "Starfall is full of confident statements right now. Before you repeat one, find out whether it is evidence, inference, or simply an institution quoting another institution. The difference is becoming expensive.",
    "warEngaged": "War made verification valuable and dangerous at the same time. People will pay for certainty they do not actually have. If your work touches information, the most profitable answer may still be 'not yet verified.'",
    "warWaiting": "Verification work is booming because everyone wants a clean story about what happened. The hard part is that uncertainty has market value too. Do not let demand for an answer turn into permission to invent one.",
    "belongingEngaged": "Public-service residency can look like proof that Lumenor accepts you. I hope it does. But if the offer expects silence about failures you can document, then the price of belonging is part of the decision, not a footnote.",
    "belongingWaiting": "Some public and diplomatic roles now come with stronger residency paths. Read the discretion clauses. Stability can be worth accepting, but not if you only discover later that it required you to stop correcting the record."
  },
  {
    "country": "xalvoria",
    "countryCode": "XALVORIA",
    "characterKey": "character.xalvoria.sena-korr.v1",
    "characterName": "Sena Korr",
    "conversationKey": "relationship.xalvoria.sena-korr.v1",
    "intro": "Elian said you are getting your first look at Emberhall's project economy. I handle construction permits, so I see what every impressive financing deck leaves out: tenants, small shops, relocation dates, and the cost of a project while it is being built.",
    "fractureEngaged": "The financing disputes are making sponsors push harder for quick approvals. Speed has value, but every shortcut pushes uncertainty onto somebody else. If a project only works when nobody prices displacement or renegotiation, the model is incomplete.",
    "fractureWaiting": "Project teams are rushing to lock in terms before financing gets harder. Watch which costs remain outside the spreadsheet. Delay has a price, but so do relocation, failed assumptions, and concentrated control.",
    "warEngaged": "Distressed projects are creating real opportunities now. Restructuring can save useful infrastructure, but it also decides who absorbs the loss. If you make money restoring a project, identify whose claim was reduced to make the recovery possible.",
    "warWaiting": "Emergency finance is moving toward distressed assets and strategic projects. There is nothing automatically wrong with earning from recovery, but somebody carries every haircut, guarantee, or rent increase behind the return.",
    "belongingEngaged": "A permanent-status offer through a major institution can change your life. Just separate loyalty to people who helped you from loyalty to every deal the institution asks you to defend. Those are not the same obligation.",
    "belongingWaiting": "Professional residency pathways are expanding through major firms. Read partnership, disclosure, and conflict clauses carefully. Access to the network is valuable precisely because leaving it can become expensive."
  },
  {
    "country": "dravenlok",
    "countryCode": "DRAVENLOK",
    "characterKey": "character.dravenlok.tarek-junn.v1",
    "characterName": "Tarek Junn",
    "conversationKey": "relationship.dravenlok.tarek-junn.v1",
    "intro": "Orsa said you might end up around the works. I am an apprentice on rail equipment. The factories are good at telling you how important the output is. Ask workers how the schedule was built before you decide whether the target is realistic.",
    "fractureEngaged": "Procurement pressure is already shortening maintenance windows. Everyone likes the overtime until a missed inspection becomes the reason a whole line stops. More output is not the same thing as more capacity if the equipment and people never recover.",
    "fractureWaiting": "Factories are promising more output while inputs and maintenance time get tighter. If you take the overtime or supplier work, watch whether the schedule is using real capacity or borrowing from future breakdowns.",
    "warEngaged": "Emergency production has made every workshop valuable. It has also made it easier to call any delay disloyal. If you profit from strategic output, keep safety and quality records strong enough that urgency cannot erase them later.",
    "warWaiting": "Industrial demand is surging, but so is pressure to ignore ordinary limits. Wartime production pays well because failure is costly. That is exactly why safety and maintenance are economic variables, not obstacles.",
    "belongingEngaged": "Strategic-service status may ask you to stay with one employer longer than you planned. Stability is real, but so is dependency. Decide whether the offer gives you a home or simply makes changing jobs harder.",
    "belongingWaiting": "Permanent status is increasingly tied to strategic industrial service. Before accepting, compare the residency security with the mobility you give up. A stable contract can still concentrate too much power in one employer."
  },
  {
    "country": "syndalis",
    "countryCode": "SYNDALIS",
    "characterKey": "character.syndalis.nyra-pell.v1",
    "characterName": "Nyra Pell",
    "conversationKey": "relationship.syndalis.nyra-pell.v1",
    "intro": "Aven said you finished the first identity setup without giving every system every detail it asked for. Good. I work with people locked out by security tools. If something denies you access, save the error before anyone tells you it never happened.",
    "fractureEngaged": "Security reviews are tightening faster than the appeal process. Some extra checks are justified. The dangerous part is when temporary emergency rules become invisible defaults and nobody can explain why an account is blocked.",
    "fractureWaiting": "Account and identity reviews are getting stricter. Save notices, timestamps, and appeal references. A secure system still needs a way to show an innocent person what happened and how to correct it.",
    "warEngaged": "Payment continuity work is lucrative because people cannot wait days for an appeal while rent or payroll is due. If you enter emergency fintech or security, count false lockouts as a system cost, not just support tickets.",
    "warWaiting": "Emergency network and payment work is expanding. The systems are protecting real infrastructure, but innocent lockouts are rising too. A service is not resilient if the only way it stays secure is by making errors impossible to challenge.",
    "belongingEngaged": "Strategic digital-service status may come with broader monitoring authority and stricter foreign-contact rules. You know what those systems feel like from the user side. Decide whether access is worth becoming responsible for controls you cannot defend.",
    "belongingWaiting": "Long-term status is opening for strategic digital workers. Read the monitoring and disclosure powers attached to the role. The opportunity is real, and so is the responsibility for what those systems do to other people."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1 from public.game_sessions g where g.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_LOCAL_FRIEND_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select s.id into v_storyline_id
  from public.storylines s
  where lower(s.key) = lower('econovaria_demo_act_1')
    and s.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_LOCAL_FRIEND_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  for v_contact in select value from jsonb_array_elements(v_contacts)
  loop
    v_intro_rules := v_intro_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_local_friend_intro',
        'condition', jsonb_build_object(
          'type', 'player_current_country_is',
          'countryCode', v_contact ->> 'countryCode'
        ),
        'effects', jsonb_build_array(
          jsonb_build_object(
            'type', 'character_message',
            'characterKey', v_contact ->> 'characterKey',
            'characterName', v_contact ->> 'characterName',
            'conversationKey', v_contact ->> 'conversationKey',
            'title', (v_contact ->> 'characterName') || ' — a local introduction',
            'body', v_contact ->> 'intro',
            'allowPlayerReplies', true,
            'payload', jsonb_build_object(
              'storyArc', 'meridian_corridor',
              'phase', 'local_friend_introduction',
              'relationshipRole', 'local_friend',
              'relationshipAware', true,
              'branch', 'introduction'
            )
          )
        )
      )
    );

    v_fracture_rules := v_fracture_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_local_friend_fracture_engaged',
        'condition', jsonb_build_object('all', jsonb_build_array(
          jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
          jsonb_build_object('type','player_relationship_reply_count_at_least','characterKey',v_contact ->> 'characterKey','count',1)
        )),
        'effects', jsonb_build_array(jsonb_build_object(
          'type','character_message','characterKey',v_contact ->> 'characterKey',
          'characterName',v_contact ->> 'characterName','conversationKey',v_contact ->> 'conversationKey',
          'title',(v_contact ->> 'characterName') || ' — what the fracture looks like here',
          'body',v_contact ->> 'fractureEngaged','allowPlayerReplies',true,
          'payload',jsonb_build_object('storyArc','meridian_corridor','phase','meridian_fracture','relationshipRole','local_friend','relationshipAware',true,'branch','engaged')
        ))
      ),
      jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_local_friend_fracture_waiting',
        'condition', jsonb_build_object('all', jsonb_build_array(
          jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
          jsonb_build_object('not',jsonb_build_object('type','player_relationship_reply_count_at_least','characterKey',v_contact ->> 'characterKey','count',1))
        )),
        'effects', jsonb_build_array(jsonb_build_object(
          'type','character_message','characterKey',v_contact ->> 'characterKey',
          'characterName',v_contact ->> 'characterName','conversationKey',v_contact ->> 'conversationKey',
          'title',(v_contact ->> 'characterName') || ' — a local warning',
          'body',v_contact ->> 'fractureWaiting','allowPlayerReplies',true,
          'payload',jsonb_build_object('storyArc','meridian_corridor','phase','meridian_fracture','relationshipRole','local_friend','relationshipAware',true,'branch','waiting')
        ))
      )
    );

    v_war_rules := v_war_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_local_friend_war_engaged',
        'condition', jsonb_build_object('all', jsonb_build_array(
          jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
          jsonb_build_object('type','player_relationship_reply_count_at_least','characterKey',v_contact ->> 'characterKey','count',1)
        )),
        'effects', jsonb_build_array(jsonb_build_object(
          'type','character_message','characterKey',v_contact ->> 'characterKey',
          'characterName',v_contact ->> 'characterName','conversationKey',v_contact ->> 'conversationKey',
          'title',(v_contact ->> 'characterName') || ' — the wartime economy up close',
          'body',v_contact ->> 'warEngaged','allowPlayerReplies',true,
          'payload',jsonb_build_object('storyArc','meridian_corridor','phase','fortune_during_war','relationshipRole','local_friend','relationshipAware',true,'branch','engaged')
        ))
      ),
      jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_local_friend_war_waiting',
        'condition', jsonb_build_object('all', jsonb_build_array(
          jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
          jsonb_build_object('not',jsonb_build_object('type','player_relationship_reply_count_at_least','characterKey',v_contact ->> 'characterKey','count',1))
        )),
        'effects', jsonb_build_array(jsonb_build_object(
          'type','character_message','characterKey',v_contact ->> 'characterKey',
          'characterName',v_contact ->> 'characterName','conversationKey',v_contact ->> 'conversationKey',
          'title',(v_contact ->> 'characterName') || ' — what the opportunity is costing',
          'body',v_contact ->> 'warWaiting','allowPlayerReplies',true,
          'payload',jsonb_build_object('storyArc','meridian_corridor','phase','fortune_during_war','relationshipRole','local_friend','relationshipAware',true,'branch','waiting')
        ))
      )
    );

    v_belonging_rules := v_belonging_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_local_friend_belonging_engaged',
        'condition', jsonb_build_object('all', jsonb_build_array(
          jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
          jsonb_build_object('type','player_relationship_reply_count_at_least','characterKey',v_contact ->> 'characterKey','count',1)
        )),
        'effects', jsonb_build_array(jsonb_build_object(
          'type','character_message','characterKey',v_contact ->> 'characterKey',
          'characterName',v_contact ->> 'characterName','conversationKey',v_contact ->> 'conversationKey',
          'title',(v_contact ->> 'characterName') || ' — about belonging here',
          'body',v_contact ->> 'belongingEngaged','allowPlayerReplies',true,
          'payload',jsonb_build_object('storyArc','meridian_corridor','phase','question_of_belonging','relationshipRole','local_friend','relationshipAware',true,'branch','engaged')
        ))
      ),
      jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_local_friend_belonging_waiting',
        'condition', jsonb_build_object('all', jsonb_build_array(
          jsonb_build_object('type','player_current_country_is','countryCode',v_contact ->> 'countryCode'),
          jsonb_build_object('not',jsonb_build_object('type','player_relationship_reply_count_at_least','characterKey',v_contact ->> 'characterKey','count',1))
        )),
        'effects', jsonb_build_array(jsonb_build_object(
          'type','character_message','characterKey',v_contact ->> 'characterKey',
          'characterName',v_contact ->> 'characterName','conversationKey',v_contact ->> 'conversationKey',
          'title',(v_contact ->> 'characterName') || ' — before you sign anything permanent',
          'body',v_contact ->> 'belongingWaiting','allowPlayerReplies',true,
          'payload',jsonb_build_object('storyArc','meridian_corridor','phase','question_of_belonging','relationshipRole','local_friend','relationshipAware',true,'branch','waiting')
        ))
      )
    );
  end loop;

  insert into public.storyline_events (
    storyline_id,event_key,title,description,act,sequence,trigger_type,
    scheduled_offset_seconds,trigger_condition,reveal_payload,public_news_payload,
    player_rules,policy_payloads,flag_payloads,contract_unlock_payloads,priority,is_active
  ) values
  (v_storyline_id,'meridian_local_friend_introductions','Local Life During the Meridian Boom',
   'Introduces one non-elite local friend per adopted country through the player Messaging inbox.',
   1,125,'elapsed_time',36000,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
   v_intro_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'normal',false),
  (v_storyline_id,'meridian_local_friend_fracture_reactions','Local Friends: Fracture',
   'Local friends translate the Meridian fracture into labor, household, and community consequences and remember whether the player previously engaged.',
   2,135,'elapsed_time',108000,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
   v_fracture_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'normal',false),
  (v_storyline_id,'meridian_local_friend_wartime_reactions','Local Friends: Wartime Economy',
   'Local friends make the distributional cost of wartime opportunity visible after Fortune During War begins.',
   3,185,'elapsed_time',540000,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
   v_war_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'normal',false),
  (v_storyline_id,'meridian_local_friend_belonging_reactions','Local Friends: Belonging',
   'Local friends respond to foreign-resident scrutiny and long-term status pressure without fabricating a legal-status transition.',
   3,195,'elapsed_time',626400,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
   v_belonging_rules,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'normal',false)
  on conflict (storyline_id,event_key) do update
  set title=excluded.title,description=excluded.description,act=excluded.act,
      sequence=excluded.sequence,trigger_type=excluded.trigger_type,
      scheduled_offset_seconds=excluded.scheduled_offset_seconds,
      trigger_condition=excluded.trigger_condition,reveal_payload=excluded.reveal_payload,
      public_news_payload=excluded.public_news_payload,player_rules=excluded.player_rules,
      policy_payloads=excluded.policy_payloads,flag_payloads=excluded.flag_payloads,
      contract_unlock_payloads=excluded.contract_unlock_payloads,priority=excluded.priority,
      is_active=false;

  return 4;
end;
$function$;

commit;
