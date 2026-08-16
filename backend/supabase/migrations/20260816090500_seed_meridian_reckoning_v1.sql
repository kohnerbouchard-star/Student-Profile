begin;

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

create or replace function public.activate_meridian_reckoning_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status='active' then
    perform public.initialize_meridian_reckoning_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists zzzzzzzzz_activate_meridian_reckoning_v1
  on public.game_feature_activation_evidence;
create trigger zzzzzzzzz_activate_meridian_reckoning_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status='active')
execute function public.activate_meridian_reckoning_from_full_game_v1();

do $backfill$
declare v_game record;
begin
  for v_game in
    select distinct activation.game_session_id
    from public.game_feature_activation_evidence as activation
    where activation.story_status='active'
    order by activation.game_session_id
  loop
    perform public.initialize_meridian_reckoning_v1(v_game.game_session_id);
  end loop;
end;
$backfill$;

revoke all on function public.initialize_meridian_reckoning_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.initialize_meridian_reckoning_v1(uuid)
  to service_role;
revoke all on function public.activate_meridian_reckoning_from_full_game_v1()
  from public,anon,authenticated;

comment on function public.initialize_meridian_reckoning_v1(uuid) is
  'Attaches Stage 10 Reckoning. It records an unstable-ceasefire world outcome, applies bounded route/location recovery, keeps original attack attribution unresolved, and classifies each player into one mutually exclusive narrative ending family without mutating legal residency status or using a morality score.';

commit;
