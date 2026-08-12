begin;

create or replace function public.initialize_meridian_security_center_attack_v1(
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
    "trustedTitle":"Edda Veyr — I am checking your freight links",
    "trustedBody":"The Meridian Security Operations Center in Syndalis was hit by a coordinated physical and digital attack. Injuries and cargo losses are confirmed, but investigators have not identified who carried it out. The direct Syndalis–Lumenor data route is down and northern manifests are being checked by hand. If any job, shipment, or payment you depend on touches Meridian verification, save the last confirmed record and prepare an alternate route before you make a claim about responsibility.",
    "generalTitle":"Edda Veyr — Meridian verification is under emergency controls",
    "generalBody":"A coordinated attack damaged the Meridian Security Operations Center in Syndalis. Some freight records and payments are being verified manually, and emergency route controls are in effect. Injuries are confirmed. Attribution is not. Keep copies of current manifests and payment records before changing plans."
  },
  {
    "countryCode":"YRETHIA",
    "characterKey":"character.yrethia.leva-orren.v1",
    "characterName":"Leva Orren",
    "conversationKey":"relationship.yrethia.leva-orren.v1",
    "trustedTitle":"Leva Orren — Do not let the port rumor become your evidence",
    "trustedBody":"Sableport desks are receiving conflicting claims about the attack while insurers reprice Meridian exposure. The physical damage in Syndalis is real; the names circulating in port chat are not verified. If you have cargo, work, or credit tied to clearance speed, document the delay and protect your cash before you repeat anyone's accusation.",
    "generalTitle":"Leva Orren — Sableport is repricing Meridian risk",
    "generalBody":"Insurers and customs desks are tightening review after the Syndalis Meridian attack. Clearance delays and higher documentation costs are likely. Authorities have confirmed damage and injuries, but they have not confirmed an attacker."
  },
  {
    "countryCode":"THALORIS",
    "characterKey":"character.thaloris.vessa-tarn.v1",
    "characterName":"Vessa Tarn",
    "conversationKey":"relationship.thaloris.vessa-tarn.v1",
    "trustedTitle":"Vessa Tarn — Alternate routes are not free routes",
    "trustedBody":"More cargo will try to bypass the damaged Meridian link, which means Dusk Harbor will see opportunity and pressure together. Repair yards and warehouses are already quoting emergency premiums. Check who bears the cost if a rerouted shipment is delayed again. The attack is confirmed; responsibility is not.",
    "generalTitle":"Vessa Tarn — Emergency diversions are reaching Dusk Harbor",
    "generalBody":"The Syndalis attack is pushing cargo and verification work onto alternate routes. Storage, repair, and transport demand may rise, along with insurance and security costs. Attribution remains unresolved."
  },
  {
    "countryCode":"SOLVEND",
    "characterKey":"character.solvend.iven-sar.v1",
    "characterName":"Iven Sar",
    "conversationKey":"relationship.solvend.iven-sar.v1",
    "trustedTitle":"Iven Sar — Treat every emergency access request as hostile until verified",
    "trustedBody":"Technical teams are restoring Meridian identity and payment services under time pressure. That is when legitimate emergency access and credential theft look most alike. Verify the requester, narrow privileges, preserve logs, and assume that screenshots naming an attacker are evidence only of what someone posted—not who caused the attack.",
    "generalTitle":"Iven Sar — Emergency access controls are tightening",
    "generalBody":"Solvend technical teams are supporting recovery from the Syndalis Meridian attack. Expect stricter authentication, slower approvals, and more manual verification around strategic systems. The attacker has not been confirmed."
  },
  {
    "countryCode":"ELDORAN",
    "characterKey":"character.eldoran.mera-dalen.v1",
    "characterName":"Mera Dalen",
    "conversationKey":"relationship.eldoran.mera-dalen.v1",
    "trustedTitle":"Mera Dalen — Keep enough cash for a delayed week",
    "trustedBody":"Distribution buyers are already paying more for certainty after the Meridian attack. A delayed payment or rerouted truck can become a household problem before it becomes a national shortage. Keep enough cash for a bad week, verify physical inventory before paying a panic price, and do not let an unverified attribution become your purchasing strategy.",
    "generalTitle":"Mera Dalen — Distribution costs are moving before supply does",
    "generalBody":"The Meridian attack is slowing some payment and cargo verification. Eldoran distribution costs may rise even where physical supply is still available. Separate real shortages from emergency friction and rumor."
  },
  {
    "countryCode":"VALERION",
    "characterKey":"character.valerion.celan-mire.v1",
    "characterName":"Celan Mire",
    "conversationKey":"relationship.valerion.celan-mire.v1",
    "trustedTitle":"Celan Mire — Continuity comes before a political answer",
    "trustedBody":"Utility and infrastructure teams are reviewing Meridian-linked controls because the Syndalis center coordinated payment and verification traffic. Do not shut a working system merely because it is connected to a damaged one. Isolate what evidence requires, keep essential services running, and leave attribution to the investigation.",
    "generalTitle":"Celan Mire — Infrastructure operators are isolating exposed links",
    "generalBody":"Valerion utilities and project operators are reviewing Meridian-connected systems after the Syndalis attack. Continuity measures may slow procurement and settlement. Damage is confirmed; attacker attribution is not."
  },
  {
    "countryCode":"LUMENOR",
    "characterKey":"character.lumenor.nela-corin.v1",
    "characterName":"Nela Corin",
    "conversationKey":"relationship.lumenor.nela-corin.v1",
    "trustedTitle":"Nela Corin — The direct data corridor is down",
    "trustedBody":"The Syndalis–Lumenor data corridor has been closed under emergency controls. Forum offices are switching to slower verified channels while governments issue conflicting statements. I need you to preserve the difference between confirmed damage, plausible inference, and political accusation. That distinction is going to matter very quickly.",
    "generalTitle":"Nela Corin — Forum communications are on verified fallback channels",
    "generalBody":"The direct Syndalis–Lumenor data route is closed after the Meridian attack. Lumenor institutions are using slower fallback channels while evidence is collected. Several governments have made claims, but no attacker has been confirmed."
  },
  {
    "countryCode":"XALVORIA",
    "characterKey":"character.xalvoria.elian-vor.v1",
    "characterName":"Elian Vor",
    "conversationKey":"relationship.xalvoria.elian-vor.v1",
    "trustedTitle":"Elian Vor — Liquidity is moving faster than facts",
    "trustedBody":"Payment interruption and emergency route controls are making lenders reprice risk before anyone knows the political outcome. If you are leveraged, test the case where settlement takes longer and refinancing costs more. Do not build the model around a rumored attacker; build it around the disruption we can actually measure.",
    "generalTitle":"Elian Vor — Meridian financing is repricing",
    "generalBody":"Xalvorian lenders are increasing liquidity and settlement buffers after the Syndalis attack. Currency and financing conditions may move sharply while routes are restricted. Attribution remains unresolved."
  },
  {
    "countryCode":"DRAVENLOK",
    "characterKey":"character.dravenlok.orsa-bren.v1",
    "characterName":"Orsa Bren",
    "conversationKey":"relationship.dravenlok.orsa-bren.v1",
    "trustedTitle":"Orsa Bren — The Syndalis route is restricted, not gone",
    "trustedBody":"The Ironhold–Blacklight route remains open under emergency restrictions, so factories are rationing priority slots instead of stopping everything. Protect the safety record when supervisors ask for speed. A missing component can be replaced; a hidden shortcut becomes your problem when the investigation reaches the plant.",
    "generalTitle":"Orsa Bren — Industrial shipments face emergency checks",
    "generalBody":"The Dravenlok–Syndalis corridor remains open under tighter controls after the Meridian attack. Expect slower component movement and higher verification costs. The attacker has not been established."
  },
  {
    "countryCode":"SYNDALIS",
    "characterKey":"character.syndalis.aven-sorel.v1",
    "characterName":"Aven Sorel",
    "conversationKey":"relationship.syndalis.aven-sorel.v1",
    "trustedTitle":"Aven Sorel — I am safe; the center is not",
    "trustedBody":"I am safe. Colleagues from the night shift are being treated, and parts of the Meridian Security Operations Center are unusable. We have confirmed physical damage, missing cargo records, and manipulation of digital systems. We have not confirmed who did it. The direct Lumenor data link is closed while two alternate corridors operate under restriction. If your accounts or travel depend on Meridian verification, use the last confirmed record and do not trust anyone offering certainty faster than the evidence can support it.",
    "generalTitle":"Aven Sorel — Emergency controls are active in Blacklight",
    "generalBody":"A coordinated physical and digital attack damaged the Meridian Security Operations Center in Syndalis. Injuries, infrastructure damage, and missing cargo records are confirmed. Emergency route and payment controls are active. Investigators have not confirmed an attacker."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_SECURITY_CENTER_ATTACK_GAME_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_SECURITY_CENTER_ATTACK_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type', 'market_news_post',
      'payload', jsonb_build_object(
        'shockKey', 'meridian-security-center-attack-v1',
        'headline', 'Coordinated attack damages Meridian Security Operations Center',
        'explanation', 'A coordinated physical and digital attack in Syndalis damaged Meridian verification infrastructure, interrupted payment and communications links, and triggered emergency route controls. Civilian injuries and cargo-record losses are confirmed; attribution remains unresolved.',
        'category', 'geopolitical',
        'scope', 'global',
        'targetKey', null,
        'sentiment', 'negative',
        'impactStrength', 'high',
        'durationTicks', 12,
        'metadata', jsonb_build_object(
          'phase', 'meridian_security_center_attack',
          'stage', 5,
          'attackConfirmed', true,
          'attribution', 'unresolved',
          'civilianHarmConfirmed', true
        )
      )
    ),
    jsonb_build_object(
      'type', 'world_location_state_change',
      'payload', jsonb_build_object(
        'locationIds', jsonb_build_array('loc_syndalis_meridian_security_center_v1'),
        'availability', 'conflict'
      )
    ),
    jsonb_build_object(
      'type', 'world_route_state_change',
      'payload', jsonb_build_object(
        'routeIds', jsonb_build_array('rte_meridian_syndalis_lumenor_v1'),
        'status', 'closed',
        'reason', 'meridian_disruption',
        'costMultiplierBasisPoints', 10000,
        'durationMultiplierBasisPoints', 10000
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
        'reason', 'meridian_disruption',
        'costMultiplierBasisPoints', 12500,
        'durationMultiplierBasisPoints', 16000
      )
    ),
    jsonb_build_object(
      'type', 'currency_volatility',
      'payload', jsonb_build_object(
        'adjustmentsBasisPoints', jsonb_build_object(
          'NRC', -120,
          'YRC', 90,
          'THD', 160,
          'SLV', -60,
          'ELD', 100,
          'VAL', 0,
          'LUM', 260,
          'SYN', 520,
          'XAL', 220,
          'DRV', 180
        )
      )
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_attack_occurred_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_attack_attribution_status_v1',
      'value', 'unresolved'
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_emergency_route_controls_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_payment_network_degraded_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_civilian_harm_confirmed_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.attack-continuity-and-evidence.v1',
      'label', 'Meridian Attack: Continuity and Evidence Check',
      'reason', 'The confirmed attack requires players to protect immediate continuity while separating verified facts from attribution claims.',
      'payload', jsonb_build_object(
        'title', 'Meridian Attack: Continuity and Evidence Check',
        'description', 'Document one immediate consequence of the Meridian attack, verify one primary source, and choose a continuity action without assigning unsupported blame.',
        'instructions', 'Identify one verified personal, business, travel, or payment impact. Cite the strongest available evidence for that impact. Choose one continuity action. State clearly what remains unknown about responsibility for the attack.',
        'category', 'crisis_response',
        'targetingPayload', jsonb_build_object('allPlayers', true),
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit the verified impact, evidence source, continuity action, and one sentence separating confirmed facts from unresolved attribution.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 350),
          'storyFlagsToSet', jsonb_build_array(
            jsonb_build_object(
              'flagKey', 'meridian_attack_continuity_check_submitted_v1',
              'value', true
            )
          )
        ),
        'metadata', jsonb_build_object(
          'storyArc', 'meridian_corridor',
          'stage', 5,
          'attackConfirmed', true,
          'attributionRequired', false,
          'attributionStatus', 'unresolved'
        )
      )
    )
  );

  v_rules := v_rules || jsonb_build_array(
    jsonb_build_object(
      'ruleKey', 'meridian_security_center_attack_game_effects',
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
        'ruleKey', lower(v_contact ->> 'countryCode') || '_security_center_attack_trusted',
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
              'phase', 'meridian_security_center_attack',
              'stage', 5,
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'trusted',
              'attackConfirmed', true,
              'attribution', 'unresolved'
            )
          )
        )
      ),
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_security_center_attack_general',
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
              'phase', 'meridian_security_center_attack',
              'stage', 5,
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'general',
              'attackConfirmed', true,
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
    'meridian_security_center_attack',
    'Attack on the Meridian Security Operations Center',
    'A coordinated physical and digital attack damages the Syndalis Meridian security node, harms civilians, disrupts cargo and payment verification, and triggers emergency route controls while attribution remains unresolved.',
    3,
    150,
    'elapsed_time',
    259200,
    '{}'::jsonb,
    jsonb_build_object(
      'notificationType', 'story_cutscene',
      'displayMode', 'modal_on_next_login',
      'videoAssetKey', 'econovaria_cutscene_meridian_security_center_attack_v1',
      'posterAssetKey', 'econovaria_poster_meridian_security_center_attack_v1',
      'headline', 'Attack hits the Meridian Security Operations Center',
      'summary', 'A coordinated physical and digital attack has damaged the Syndalis Meridian security node. Emergency services confirm injuries and infrastructure damage. Cargo, communications, and payment verification are disrupted. Investigators have not confirmed who carried out the attack.',
      'requiresAcknowledgement', true,
      'payload', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 5,
        'tone', 'civilian_harm_and_systemic_disruption',
        'attackConfirmed', true,
        'attribution', 'unresolved',
        'avoidSpectacle', true
      )
    ),
    jsonb_build_object(
      'headline', 'Meridian Security Operations Center attacked in Syndalis',
      'explanation', 'A coordinated physical and digital attack damaged Meridian verification infrastructure, injured civilians, interrupted payment and communications links, and triggered emergency route controls. Authorities have not confirmed an attacker.',
      'category', 'geopolitical',
      'scope', 'global',
      'targetKey', null,
      'sentiment', 'negative',
      'impactStrength', 'high',
      'durationTicks', 12,
      'source', 'system',
      'metadata', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 5,
        'attackConfirmed', true,
        'attribution', 'unresolved'
      )
    ),
    v_rules,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'critical',
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

create or replace function public.activate_meridian_security_center_attack_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_meridian_security_center_attack_v1(new.game_session_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists zzzz_activate_meridian_security_center_attack_from_full_game_v1
  on public.game_feature_activation_evidence;
create trigger zzzz_activate_meridian_security_center_attack_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_meridian_security_center_attack_from_full_game_v1();

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
    perform public.initialize_meridian_security_center_attack_v1(v_game.game_session_id);
  end loop;
end;
$backfill$;

revoke all on function public.initialize_meridian_security_center_attack_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_meridian_security_center_attack_v1(uuid)
  to service_role;

revoke all on function public.activate_meridian_security_center_attack_from_full_game_v1()
  from public, anon, authenticated;

comment on function public.initialize_meridian_security_center_attack_v1(uuid) is
  'Attaches Stage 5 of the canonical Meridian Corridor: a confirmed coordinated attack with civilian harm, real World route/location disruption, market and currency volatility, emergency response work, relationship consequences, and explicitly unresolved attribution.';

commit;
