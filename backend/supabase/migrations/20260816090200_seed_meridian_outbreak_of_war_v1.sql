begin;

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

create or replace function public.activate_meridian_outbreak_of_war_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_meridian_outbreak_of_war_v1(new.game_session_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists zzzzzz_activate_meridian_outbreak_of_war_from_full_game_v1
  on public.game_feature_activation_evidence;
create trigger zzzzzz_activate_meridian_outbreak_of_war_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_meridian_outbreak_of_war_from_full_game_v1();

do $backfill$
declare
  v_game record;
begin
  for v_game in
    select distinct activation.game_session_id
    from public.game_feature_activation_evidence as activation
    where activation.story_status = 'active'
    order by activation.game_session_id
  loop
    perform public.initialize_meridian_outbreak_of_war_v1(v_game.game_session_id);
  end loop;
end;
$backfill$;

revoke all on function public.initialize_meridian_outbreak_of_war_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_meridian_outbreak_of_war_v1(uuid)
  to service_role;

revoke all on function public.activate_meridian_outbreak_of_war_from_full_game_v1()
  from public, anon, authenticated;

comment on function public.initialize_meridian_outbreak_of_war_v1(uuid) is
  'Attaches Stage 7 of the canonical Meridian Corridor: open conflict, bounded route closures and restrictions, conflict and shortage location states, war-conflict market news, controlled FX volatility, civilian continuity and information-integrity work, and relationship-aware country guidance. The player does not decide whether war exists, does not receive national authority, and does not receive a fabricated attribution for the original attack.';

commit;
