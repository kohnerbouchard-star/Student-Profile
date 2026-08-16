begin;

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

create or replace function public.activate_meridian_question_of_belonging_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status='active' then
    perform public.initialize_meridian_question_of_belonging_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists zzzzzzzz_activate_meridian_belonging_v1
  on public.game_feature_activation_evidence;
create trigger zzzzzzzz_activate_meridian_belonging_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status='active')
execute function public.activate_meridian_question_of_belonging_from_full_game_v1();

do $backfill$
declare v_game record;
begin
  for v_game in
    select distinct activation.game_session_id
    from public.game_feature_activation_evidence as activation
    where activation.story_status='active'
    order by activation.game_session_id
  loop
    perform public.initialize_meridian_question_of_belonging_v1(v_game.game_session_id);
  end loop;
end;
$backfill$;

revoke all on function public.initialize_meridian_question_of_belonging_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.initialize_meridian_question_of_belonging_v1(uuid)
  to service_role;
revoke all on function public.activate_meridian_question_of_belonging_from_full_game_v1()
  from public,anon,authenticated;

comment on function public.initialize_meridian_question_of_belonging_v1(uuid) is
  'Attaches Stage 9 of the canonical Meridian Corridor. Wartime Contract completion returns as personal history while foreign-resident pressure, former-home obligations, and long-term status choices are represented without silently mutating residency status or granting the player national authority.';

commit;
