begin;

create or replace function public.initialize_meridian_customs_security_intrusion_v1(
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
  v_contacts jsonb := $contacts$
[
  {
    "countryCode":"NORTHREACH",
    "characterKey":"character.northreach.edda-veyr.v1",
    "characterName":"Edda Veyr",
    "conversationKey":"relationship.northreach.edda-veyr.v1",
    "trustedTitle":"Edda Veyr — Keep the manifest copies",
    "trustedBody":"Strategic mineral manifests and payment confirmations are no longer matching across every checkpoint. I do not have evidence that proves who caused it. Preserve the original records, verify any rerouting order twice, and do not let urgency turn an unverified accusation into a business decision.",
    "generalTitle":"Edda Veyr — Verification is slowing",
    "generalBody":"Northreach freight offices are moving some Meridian cargo to manual verification because records are conflicting. Expect delays around strategic shipments. Keep copies of anything tied to your work or investments, and treat claims about responsibility as unconfirmed."
  },
  {
    "countryCode":"YRETHIA",
    "characterKey":"character.yrethia.leva-orren.v1",
    "characterName":"Leva Orren",
    "conversationKey":"relationship.yrethia.leva-orren.v1",
    "trustedTitle":"Leva Orren — Sableport records are diverging",
    "trustedBody":"Customs, carrier, and payment records are disagreeing on some Meridian cargo. Sableport is expanding manual checks while insurers review exposure. The cause is not established. If your income depends on clearance speed, separate confirmed delays from rumors about who is responsible.",
    "generalTitle":"Leva Orren — Expect manual clearance",
    "generalBody":"Sableport has moved selected Meridian cargo into manual verification after conflicting records appeared across customs and payment systems. Clearance and insurance review may slow. Attribution remains unresolved."
  },
  {
    "countryCode":"THALORIS",
    "characterKey":"character.thaloris.vessa-tarn.v1",
    "characterName":"Vessa Tarn",
    "conversationKey":"relationship.thaloris.vessa-tarn.v1",
    "trustedTitle":"Vessa Tarn — Alternate routes are getting scrutiny",
    "trustedBody":"Cargo is already being diverted toward alternate ports, but the same verification problem can follow a shipment if the underlying records are wrong. Dusk Harbor may gain work and scrutiny at the same time. Document every transfer, and do not sell certainty about the cause that nobody has earned yet.",
    "generalTitle":"Vessa Tarn — Diversions are increasing",
    "generalBody":"Meridian verification failures are pushing more cargo toward alternate routes. Thalorian repair, storage, and logistics demand may rise, but foreign partners are also increasing documentation checks. The source of the disruption is still unconfirmed."
  },
  {
    "countryCode":"SOLVEND",
    "characterKey":"character.solvend.iven-sar.v1",
    "characterName":"Iven Sar",
    "conversationKey":"relationship.solvend.iven-sar.v1",
    "trustedTitle":"Iven Sar — Verify access before granting it",
    "trustedBody":"Technical teams are being asked to reconcile Meridian identity, cargo, and payment records under pressure. That creates legitimate access requests and opportunistic ones. Verify who is asking, limit privileges to the task, and preserve logs. There is not enough evidence to attribute the disruption responsibly.",
    "generalTitle":"Iven Sar — Strategic systems are under review",
    "generalBody":"Solvend technical teams are supporting Meridian verification recovery and tightening access controls. Expect more authentication and credential checks around strategic projects. The cause of the record failures remains under investigation."
  },
  {
    "countryCode":"ELDORAN",
    "characterKey":"character.eldoran.mera-dalen.v1",
    "characterName":"Mera Dalen",
    "conversationKey":"relationship.eldoran.mera-dalen.v1",
    "trustedTitle":"Mera Dalen — Do not confuse delay with shortage",
    "trustedBody":"Food and distribution buyers are seeing delayed confirmations while Meridian records are checked manually. Some sellers will call that scarcity before the physical supply has changed. Keep cash flexible, verify inventory claims, and distinguish a logistics delay from a real shortage.",
    "generalTitle":"Mera Dalen — Distribution confirmations are slowing",
    "generalBody":"Meridian record conflicts are delaying some payment and cargo confirmations. Eldoran distributors may face temporary clearance costs even when physical supply is available. Avoid treating every delay as proof of a shortage or an attack."
  },
  {
    "countryCode":"VALERION",
    "characterKey":"character.valerion.celan-mire.v1",
    "characterName":"Celan Mire",
    "conversationKey":"relationship.valerion.celan-mire.v1",
    "trustedTitle":"Celan Mire — Protect continuity before blame",
    "trustedBody":"Infrastructure procurement records are among the data being rechecked. A rushed security response could interrupt water, energy, and project supply chains more than the original mismatch. Preserve continuity, narrow access where evidence supports it, and keep attribution separate from operational recovery.",
    "generalTitle":"Celan Mire — Infrastructure records are being rechecked",
    "generalBody":"Valerion project and utility suppliers are reviewing Meridian-linked procurement records after verification conflicts emerged. Some processing will slow while continuity and security teams reconcile data. Attribution is not yet established."
  },
  {
    "countryCode":"LUMENOR",
    "characterKey":"character.lumenor.nela-corin.v1",
    "characterName":"Nela Corin",
    "conversationKey":"relationship.lumenor.nela-corin.v1",
    "trustedTitle":"Nela Corin — Preserve what is actually verified",
    "trustedBody":"Forum offices are already receiving competing claims about the customs failures. The records prove that systems disagree; they do not yet prove why. Keep a clean chain between evidence, inference, and accusation. That distinction will matter when governments start demanding a public explanation.",
    "generalTitle":"Nela Corin — Claims are moving faster than evidence",
    "generalBody":"Lumenor institutions are coordinating evidence requests after conflicting Meridian customs and payment records appeared. Public claims about responsibility are already circulating, but officials have not established attribution."
  },
  {
    "countryCode":"XALVORIA",
    "characterKey":"character.xalvoria.elian-vor.v1",
    "characterName":"Elian Vor",
    "conversationKey":"relationship.xalvoria.elian-vor.v1",
    "trustedTitle":"Elian Vor — Guarantees matter when verification fails",
    "trustedBody":"Project lenders are reviewing which payment and delivery guarantees still function when records cannot be reconciled automatically. Liquidity can tighten before any project actually fails. Model slower verification and keep leverage assumptions conservative until the data is trustworthy again.",
    "generalTitle":"Elian Vor — Financing friction is rising",
    "generalBody":"Xalvorian lenders are reviewing Meridian-linked payment guarantees after verification conflicts emerged. Projects have not necessarily failed, but financing and settlement can slow while records are checked manually."
  },
  {
    "countryCode":"DRAVENLOK",
    "characterKey":"character.dravenlok.orsa-bren.v1",
    "characterName":"Orsa Bren",
    "conversationKey":"relationship.dravenlok.orsa-bren.v1",
    "trustedTitle":"Orsa Bren — Keep supplier evidence current",
    "trustedBody":"Factories are being told to verify component provenance and payment status by hand when Meridian records disagree. That will pressure schedules and working capital. Do not let production targets erase the audit trail; the same evidence that protects quality will protect you if a shipment is disputed.",
    "generalTitle":"Orsa Bren — Supplier verification is tightening",
    "generalBody":"Dravenlok manufacturers are adding manual checks to Meridian-linked component and payment records. Production schedules may slow while suppliers prove origin and settlement status. The disruption has not been reliably attributed."
  },
  {
    "countryCode":"SYNDALIS",
    "characterKey":"character.syndalis.aven-sorel.v1",
    "characterName":"Aven Sorel",
    "conversationKey":"relationship.syndalis.aven-sorel.v1",
    "trustedTitle":"Aven Sorel — Contain the problem without inventing the attacker",
    "trustedBody":"Security teams can confirm inconsistent customs and payment records across several Meridian systems. They cannot yet distinguish malicious manipulation from software or synchronization failure with enough confidence to name an attacker. Limit access, preserve logs, and resist anyone asking you to turn uncertainty into attribution.",
    "generalTitle":"Aven Sorel — Security review is expanding",
    "generalBody":"Syndalis security teams are investigating conflicting records across Meridian customs and payment systems. Access controls and manual verification are increasing. Officials have not established whether the cause is malicious activity, software failure, synchronization problems, or a combination."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'MERIDIAN_CUSTOMS_INTRUSION_GAME_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'MERIDIAN_CUSTOMS_INTRUSION_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  v_game_effects := jsonb_build_array(
    jsonb_build_object(
      'type', 'market_news_post',
      'payload', jsonb_build_object(
        'shockKey', 'meridian-customs-security-intrusion-v1',
        'headline', 'Meridian verification records diverge',
        'explanation', 'Conflicting customs, cargo, and payment records are forcing manual verification across Meridian trade flows. The source of the disruption remains unresolved.',
        'category', 'supply_chain',
        'scope', 'global',
        'targetKey', null,
        'sentiment', 'negative',
        'impactStrength', 'medium',
        'durationTicks', 6,
        'metadata', jsonb_build_object(
          'phase', 'customs_security_intrusion',
          'attribution', 'unresolved',
          'verificationConfidence', 'low',
          'stage', 4
        )
      )
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_customs_intrusion_detected_v1',
      'value', true
    ),
    jsonb_build_object(
      'type', 'story_flag_set',
      'flagKey', 'meridian_attribution_status_v1',
      'value', 'unresolved'
    ),
    jsonb_build_object(
      'type', 'contract_unlock',
      'contractKey', 'contract.meridian.respond-first-disruption.v1',
      'label', 'Meridian Disruption Response',
      'reason', 'Conflicting Meridian verification records require a continuity and security response before attribution is established.',
      'payload', jsonb_build_object(
        'title', 'Meridian Disruption Response',
        'description', 'Recommend a response to the Meridian customs and payment verification failure while the cause remains unconfirmed.',
        'instructions', 'Separate verified facts from inference. Recommend one continuity measure and one security measure, explain their tradeoffs, and do not assign blame without evidence.',
        'category', 'crisis_response',
        'targetingPayload', jsonb_build_object('allPlayers', true),
        'requirementsPayload', jsonb_build_object(
          'manualText', 'Submit a short response with one continuity measure, one security measure, the tradeoff between them, and a statement describing what is still unknown.'
        ),
        'rewardPayload', jsonb_build_object(
          'cash', jsonb_build_object('amount', 250),
          'storyFlagsToSet', jsonb_build_array(
            jsonb_build_object(
              'flagKey', 'meridian_first_disruption_response_submitted_v1',
              'value', true
            )
          )
        ),
        'metadata', jsonb_build_object(
          'storyArc', 'meridian_corridor',
          'stage', 4,
          'attributionRequired', false,
          'attributionStatus', 'unresolved'
        )
      )
    )
  );

  for v_contact in
    select value
    from jsonb_array_elements(v_contacts)
  loop
    v_rules := v_rules || jsonb_build_array(
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_customs_intrusion_trusted',
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
              'phase', 'customs_security_intrusion',
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'trusted',
              'attribution', 'unresolved'
            )
          )
        ) || v_game_effects
      ),
      jsonb_build_object(
        'ruleKey', lower(v_contact ->> 'countryCode') || '_customs_intrusion_general',
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
              'phase', 'customs_security_intrusion',
              'relationshipRole', 'sponsor',
              'relationshipAware', true,
              'branch', 'general',
              'attribution', 'unresolved'
            )
          )
        ) || v_game_effects
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
    'meridian_customs_security_intrusion',
    'Meridian Customs Verification Failure',
    'Conflicting cargo, customs, and payment verification records create a systemic trade-confidence shock while attribution remains unresolved.',
    3,
    140,
    'elapsed_time',
    172800,
    '{}'::jsonb,
    jsonb_build_object(
      'notificationType', 'story_cutscene',
      'displayMode', 'modal_on_next_login',
      'videoAssetKey', 'econovaria_cutscene_meridian_customs_intrusion_v1',
      'posterAssetKey', 'econovaria_poster_meridian_customs_intrusion_v1',
      'headline', 'Meridian verification systems disagree',
      'summary', 'Cargo and payment records no longer reconcile reliably. Trade continues under manual verification while investigators determine the cause.',
      'requiresAcknowledgement', false,
      'payload', jsonb_build_object(
        'storyArc', 'meridian_corridor',
        'stage', 4,
        'tone', 'systems_failure_under_uncertainty',
        'attribution', 'unresolved'
      )
    ),
    jsonb_build_object(
      'headline', 'Meridian verification records diverge',
      'explanation', 'Conflicting customs, cargo, and payment records are forcing manual verification across Meridian trade flows. The source of the disruption remains unresolved.',
      'category', 'supply_chain',
      'scope', 'global',
      'targetKey', null,
      'sentiment', 'negative',
      'impactStrength', 'medium',
      'durationTicks', 6,
      'source', 'system',
      'metadata', jsonb_build_object(
        'phase', 'customs_security_intrusion',
        'attribution', 'unresolved',
        'verificationConfidence', 'low',
        'stage', 4
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

  return 1;
end;
$function$;

create or replace function public.activate_meridian_customs_security_intrusion_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_meridian_customs_security_intrusion_v1(
      new.game_session_id
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists zzz_activate_meridian_customs_security_intrusion_from_full_game_v1
  on public.game_feature_activation_evidence;
create trigger zzz_activate_meridian_customs_security_intrusion_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_meridian_customs_security_intrusion_from_full_game_v1();

-- Schema replay must be safe before source content is provisioned. Existing
-- active games are backfilled only when the canonical storyline is already
-- present; fresh databases receive the event synchronously on later full-game
-- Story activation through the trigger above.
do $backfill$
declare
  v_game_session_id uuid;
begin
  if exists (
    select 1
    from public.storylines as storyline_row
    where lower(storyline_row.key) = lower('econovaria_demo_act_1')
      and storyline_row.is_active
  ) then
    for v_game_session_id in
      select distinct activation.game_session_id
      from public.game_feature_activation_evidence as activation
      where activation.story_status = 'active'
    loop
      perform public.initialize_meridian_customs_security_intrusion_v1(
        v_game_session_id
      );
    end loop;
  end if;
end;
$backfill$;

revoke all on function public.initialize_meridian_customs_security_intrusion_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_meridian_customs_security_intrusion_v1(uuid)
  to service_role;

comment on function public.initialize_meridian_customs_security_intrusion_v1(uuid) is
  'Attaches the Stage 4 Meridian customs-security intrusion to the canonical storyline once source Story content is present. Schema bootstrap remains content-agnostic; game activation is the authoritative attachment point.';

commit;
