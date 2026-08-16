begin;

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

create or replace function public.activate_meridian_fortune_during_war_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_meridian_fortune_during_war_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists zzzzzzz_activate_meridian_fortune_during_war_v1
  on public.game_feature_activation_evidence;
create trigger zzzzzzz_activate_meridian_fortune_during_war_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_meridian_fortune_during_war_from_full_game_v1();

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
    perform public.initialize_meridian_fortune_during_war_v1(v_game.game_session_id);
  end loop;
end;
$backfill$;

revoke all on function public.initialize_meridian_fortune_during_war_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_meridian_fortune_during_war_v1(uuid)
  to service_role;

revoke all on function public.activate_meridian_fortune_during_war_from_full_game_v1()
  from public, anon, authenticated;

comment on function public.initialize_meridian_fortune_during_war_v1(uuid) is
  'Attaches Stage 8 of the canonical Meridian Corridor. Wartime profits are explainable responses to real bottlenecks or risks, tradeoffs remain explicit, Stage 7 Contract completion changes sponsor continuity, and Stage 8 Contract completion remains available to later personal consequence conditions.';

commit;
