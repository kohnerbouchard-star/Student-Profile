begin;

create or replace function public.initialize_meridian_emergency_response_v1(
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
    "trustedTitle":"Edda Veyr — The reroute windows are becoming usable",
    "trustedBody":"Emergency teams have reopened the direct Syndalis–Lumenor data corridor under heavy manual verification, and the alternate freight links are moving again with fewer delays. That is better, not normal. Keep the last verified manifest, build extra time into anything important, and decide which temporary controls are worth their cost before people start treating emergency procedure as permanent policy.",
    "generalTitle":"Edda Veyr — Meridian freight is moving under temporary controls",
    "generalBody":"Selected Meridian routes are reopening under manual verification and audited emergency access. Freight is moving more reliably, but costs and delays remain elevated. Investigators still have not confirmed who carried out the attack."
  },
  {
    "countryCode":"YRETHIA",
    "characterKey":"character.yrethia.leva-orren.v1",
    "characterName":"Leva Orren",
    "conversationKey":"relationship.yrethia.leva-orren.v1",
    "trustedTitle":"Leva Orren — Manual verification is buying time, not certainty",
    "trustedBody":"Sableport insurers are accepting more fallback documentation now that the emergency verification rules are standardized. Premiums are still high, but the market is pricing procedures instead of pure panic. Watch the difference between a temporary control that creates trust and one that quietly becomes a permanent barrier to trade.",
    "generalTitle":"Leva Orren — Insurers are recognizing the emergency verification standard",
    "generalBody":"Emergency verification rules are reducing some Meridian settlement uncertainty. Insurance and customs costs remain above normal, and the attack investigation remains unresolved."
  },
  {
    "countryCode":"THALORIS",
    "characterKey":"character.thaloris.vessa-tarn.v1",
    "characterName":"Vessa Tarn",
    "conversationKey":"relationship.thaloris.vessa-tarn.v1",
    "trustedTitle":"Vessa Tarn — Overflow capacity is now the bottleneck",
    "trustedBody":"Dusk Harbor can absorb more diverted cargo, but every emergency route has a real capacity limit. Warehouses, repair crews, and transport slots are filling. There is money to be made in continuity work, but do not promise throughput the system cannot deliver just because customers are desperate for certainty.",
    "generalTitle":"Vessa Tarn — Emergency rerouting is stabilizing but expensive",
    "generalBody":"Alternate Meridian routes are carrying more traffic under temporary controls. Logistics demand remains elevated, along with storage, labor, and verification costs."
  },
  {
    "countryCode":"SOLVEND",
    "characterKey":"character.solvend.iven-sar.v1",
    "characterName":"Iven Sar",
    "conversationKey":"relationship.solvend.iven-sar.v1",
    "trustedTitle":"Iven Sar — Shared access now has an audit clock",
    "trustedBody":"The emergency technical-access framework is finally bounded: named teams, limited privileges, logging, and review dates. That makes recovery faster without pretending security oversight is optional. If someone asks you to support broader access because the crisis is urgent, ask when it expires and who can audit it.",
    "generalTitle":"Iven Sar — Emergency system access is now time-limited and audited",
    "generalBody":"Meridian recovery teams are using temporary shared technical access with logging and review controls. Services are improving, but normal access rules have not fully returned."
  },
  {
    "countryCode":"ELDORAN",
    "characterKey":"character.eldoran.mera-dalen.v1",
    "characterName":"Mera Dalen",
    "conversationKey":"relationship.eldoran.mera-dalen.v1",
    "trustedTitle":"Mera Dalen — Shortage risk is shifting from goods to timing",
    "trustedBody":"Food and basic goods are moving more predictably now, but the system still loses time at verification points. That means working capital and delivery windows matter as much as physical stock. Help people distinguish a genuine shortage from a slow route, and keep enough liquidity to survive another delay without panic buying.",
    "generalTitle":"Mera Dalen — Distribution is improving under manual checks",
    "generalBody":"Emergency rerouting and manual verification are reducing some delivery uncertainty. Physical supply remains uneven, and temporary delays can still create local shortages."
  },
  {
    "countryCode":"VALERION",
    "characterKey":"character.valerion.celan-mire.v1",
    "characterName":"Celan Mire",
    "conversationKey":"relationship.valerion.celan-mire.v1",
    "trustedTitle":"Celan Mire — Recovery measures need an exit condition",
    "trustedBody":"Utilities are operating through isolated links and audited fallback channels. The immediate continuity problem is smaller now, which means the next risk is leaving emergency controls in place simply because removing them requires a decision. Every temporary restriction should have an owner, a review date, and an evidence-based exit condition.",
    "generalTitle":"Celan Mire — Essential services are moving from containment to recovery",
    "generalBody":"Infrastructure operators are restoring controlled Meridian connections while preserving emergency isolation where needed. Service continuity is improving, but the system remains degraded."
  },
  {
    "countryCode":"LUMENOR",
    "characterKey":"character.lumenor.nela-corin.v1",
    "characterName":"Nela Corin",
    "conversationKey":"relationship.lumenor.nela-corin.v1",
    "trustedTitle":"Nela Corin — The first emergency controls are now reviewable",
    "trustedBody":"The direct data corridor is operating again under a restricted protocol, and the Forum is publishing the temporary access and audit rules. That gives us something concrete to evaluate: which controls protected people, which merely slowed activity, and which could become dangerous if governments keep them after the emergency. Attribution is still unresolved.",
    "generalTitle":"Nela Corin — Forum oversight has shifted to temporary-control review",
    "generalBody":"The Syndalis–Lumenor link has reopened under restricted, audited procedures. Governments are reviewing emergency controls while the attack investigation remains unresolved."
  },
  {
    "countryCode":"XALVORIA",
    "characterKey":"character.xalvoria.elian-vor.v1",
    "characterName":"Elian Vor",
    "conversationKey":"relationship.xalvoria.elian-vor.v1",
    "trustedTitle":"Elian Vor — Liquidity is returning before confidence",
    "trustedBody":"Settlement timing is becoming more predictable, which is easing the worst financing pressure. Do not confuse that with full confidence. Lenders still price route risk, political uncertainty, and the chance of another disruption. The useful question now is which emergency buffers deserve to become permanent resilience investments.",
    "generalTitle":"Elian Vor — Financing pressure is easing unevenly",
    "generalBody":"Improved verification and rerouting are reducing some Meridian liquidity stress. Financing remains more expensive than before the attack, and currency conditions are still volatile."
  },
  {
    "countryCode":"DRAVENLOK",
    "characterKey":"character.dravenlok.orsa-bren.v1",
    "characterName":"Orsa Bren",
    "conversationKey":"relationship.dravenlok.orsa-bren.v1",
    "trustedTitle":"Orsa Bren — Priority slots are replacing blanket delay",
    "trustedBody":"The Ironhold–Blacklight corridor is moving with a clearer priority system now. That helps factories plan, but it also decides whose shipment waits. If you are involved in emergency production, document why a shipment received priority and who absorbs the cost. Scarcity makes bad allocation look efficient until someone audits it later.",
    "generalTitle":"Orsa Bren — Industrial routes are operating under priority rules",
    "generalBody":"Emergency route controls are becoming more predictable for Dravenlok industry. Priority freight moves first, while lower-priority shipments still face delay and higher costs."
  },
  {
    "countryCode":"SYNDALIS",
    "characterKey":"character.syndalis.aven-sorel.v1",
    "characterName":"Aven Sorel",
    "conversationKey":"relationship.syndalis.aven-sorel.v1",
    "trustedTitle":"Aven Sorel — We are operating from the damaged center again",
    "trustedBody":"Parts of the Security Operations Center are usable again under a degraded operating plan. The direct Lumenor link is back under heavy restriction, and the two alternate corridors are carrying verified traffic. Recovery teams now have time-limited shared access with audit logs. I need you to remember that emergency access is a tool, not a new normal. We still do not have confirmed attribution.",
    "generalTitle":"Aven Sorel — The center has moved into degraded recovery",
    "generalBody":"The Meridian Security Operations Center is operating at limited capacity. Restricted routes and audited emergency access are restoring some payment and communications services. The attacker remains unconfirmed."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_EMERGENCY_RESPONSE_GAME_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_EMERGENCY_RESPONSE_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type', 'market_news_post',
      'payload', jsonb_build_object(
        'shockKey', 'meridian-emergency-response-v1',
        'headline', 'Meridian emergency response restores limited verified throughput',
        'explanation', 'Audited shared access, manual verification, and emergency rerouting are restoring part of the Meridian network. The Syndalis security center remains degraded, route costs remain elevated, and attribution for the attack is still unresolved.',
        'category', 'infrastructure',
        'scope', 'global',
        'targetKey', null,
        'sentiment', 'mixed',
        'impactStrength', 'medium',
        'durationTicks', 10,
        'metadata', jsonb_build_object(
          'phase', 'meridian_emergency_response',
          'stage', 6,
          'temporaryControls', true,
          'attribution', 'unresolved',
          'warDeclared', false
        )
      )
    ),
    jsonb_build_object(
      'type', 'world_location_state_change',
      'payload', jsonb_build_object(
        'locationIds', jsonb_build_array('loc_syndalis_meridian_security_center_v1'),
        'availability', 'shortage'
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array('rte_meridian_syndalis_lumenor_v1'),
        'status', 'restricted',
        'reason', 'recovery',
        'costMultiplierBasisPoints', 13500,
        'durationMultiplierBasisPoints', 17500
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array(
          'rte_meridian_dravenlok_syndalis_v1',
          'rte_meridian_xalvoria_syndalis_v1'
        ),
        'status', 'restricted',
        'reason', 'recovery',
        'costMultiplierBasisPoints', 11250,
        'durationMultiplierBasisPoints', 13000
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array(
          'rte_meridian_lumenor_xalvoria_v1',
          'rte_meridian_xalvoria_dravenlok_v1'
        ),
        'status', 'restricted',
        'reason', 'meridian_disruption',
        'costMultiplierBasisPoints', 11000,
        'durationMultiplierBasisPoints', 12500
      )
    ),
    jsonb_build_object(
      'type', 'currency_volatility',
      'payload', jsonb_build_object(
        'adjustmentsBasisPoints', jsonb_build_object(
          'NRC', 40,
          'YRC', -30,
          'THD', -50,
          'SLV', 20,
          'ELD', -30,
          'VAL', 0,
          'LUM', -90,
          'SYN', -180,
          'XAL', -70,
          'DRV', -60
        )
      )
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_emergency_response_active_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_shared_security_access_v1',
      'value', 'temporary_audited'
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_manual_verification_active_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_emergency_rerouting_active_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_civilian_assistance_priority_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_attack_attribution_status_v1',
      'value', 'unresolved'
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_open_conflict_status_v1',
      'value', 'not_declared'
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.emergency-response-review.v1',
      'label', 'Meridian Emergency Response Review',
      'reason', 'Temporary security access, rerouting, and manual verification are restoring continuity but creating economic and civil tradeoffs.',
      'payload', jsonb_build_object(
        'title', 'Meridian Emergency Response Review',
        'description', 'Review the temporary emergency response and decide which measures should continue, expire, or be replaced.',
        'instructions', 'Choose two emergency measures to continue and one to end or replace. For each choice, identify the economic benefit, the cost or rights risk, and the evidence you used. Do not assume authority over national systems; frame the submission as a recommendation.',
        'category', 'crisis_response',
        'targetingPayload', jsonb_build_object('allPlayers', true),
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit two measures to continue, one to end or replace, and the economic, security, and civil tradeoff for each.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 450),
          'storyFlagsToSet', jsonb_build_array(
            jsonb_build_object(
              'flagKey', 'meridian_emergency_response_review_submitted_v1',
              'value', true
            )
          )
        ),
        'metadata', jsonb_build_object(
          'storyArc', 'meridian_corridor',
          'stage', 6,
          'playerAuthority', 'recommendation_only',
          'attributionStatus', 'unresolved'
        )
      )
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.civilian-continuity-aid.v1',
      'label', 'Civilian Continuity and Supply Check',
      'reason', 'Emergency controls are moving essential traffic again, but local delays and access costs continue to affect households and small firms.',
      'payload', jsonb_build_object(
        'title', 'Civilian Continuity and Supply Check',
        'description', 'Identify one civilian or small-business continuity problem created by the attack response and propose a bounded economic remedy.',
        'instructions', 'Identify one verified local problem involving food, transport, payments, work, or essential services. Propose one bounded remedy, estimate who pays for it, and state one unintended consequence to monitor.',
        'category', 'civilian_assistance',
        'targetingPayload', jsonb_build_object('allPlayers', true),
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the verified continuity problem, proposed remedy, who bears the cost, and one unintended consequence.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 300),
          'storyFlagsToSet', jsonb_build_array(
            jsonb_build_object(
              'flagKey', 'meridian_civilian_continuity_aid_submitted_v1',
              'value', true
            )
          )
        ),
        'metadata', jsonb_build_object(
          'storyArc', 'meridian_corridor',
          'stage', 6,
          'civilianFocus', true
        )
      )
    )
  );

  v_rules := v_rules || jsonb_build_array(
    jsonb_build_object(
      'ruleKey', 'meridian_emergency_response_game_effects',
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
        'ruleKey', lower(v_contact ->> 'countryCode') || '_emergency_response_trusted',
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
              'phase', 'meridian_emergency_response',
              'stage', 6,
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'trusted',
              'attribution', 'unresolved'
            )
          )
        )
      ),
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_emergency_response_general',
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
              'phase', 'meridian_emergency_response',
              'stage', 6,
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'general',
              'attribution', 'unresolved'
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
    'meridian_emergency_response',
    'Meridian Emergency Response',
    'Audited shared access, manual verification, emergency rerouting, and bounded financial stabilization restore limited Meridian continuity while the attack investigation remains unresolved.',
    3,
    160,
    'elapsed_time',
    345600,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'headline', 'Meridian emergency response restores limited verified throughput',
      'explanation', 'Emergency rerouting, manual verification, and audited shared technical access are restoring parts of the Meridian network. Costs and delays remain elevated, the Syndalis center remains degraded, and attack attribution remains unresolved.',
      'category', 'infrastructure',
      'scope', 'global',
      'targetKey', null,
      'sentiment', 'mixed',
      'impactStrength', 'medium',
      'durationTicks', 10,
      'source', 'system',
      'metadata', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 6,
        'temporaryControls', true,
        'attribution', 'unresolved',
        'warDeclared', false
      )
    ),
    v_rules,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'major',
    true
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
      is_active = true;

  get diagnostics v_upserted = row_count;
  return v_upserted;
end;
$function$;

create or replace function public.activate_meridian_emergency_response_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_meridian_emergency_response_v1(new.game_session_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists zzzzz_activate_meridian_emergency_response_from_full_game_v1
  on public.game_feature_activation_evidence;
create trigger zzzzz_activate_meridian_emergency_response_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_meridian_emergency_response_from_full_game_v1();

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
    perform public.initialize_meridian_emergency_response_v1(v_game.game_session_id);
  end loop;
end;
$backfill$;

revoke all on function public.initialize_meridian_emergency_response_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_meridian_emergency_response_v1(uuid)
  to service_role;

revoke all on function public.activate_meridian_emergency_response_from_full_game_v1()
  from public, anon, authenticated;

comment on function public.initialize_meridian_emergency_response_v1(uuid) is
  'Attaches Stage 6 of the canonical Meridian Corridor: audited temporary access, manual verification, emergency rerouting, degraded-service recovery, bounded FX stabilization, civilian continuity work, and relationship-aware response while attack attribution remains unresolved and war is not yet declared.';

commit;