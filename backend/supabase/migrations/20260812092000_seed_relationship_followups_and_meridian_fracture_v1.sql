begin;

create or replace function public.initialize_relationship_followups_and_meridian_fracture_v1(
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
  v_sequence integer := 100;
  v_upserted integer := 0;
  v_contacts jsonb := $contacts$
[
  {
    "country":"northreach","countryCode":"NORTHREACH",
    "characterKey":"character.northreach.edda-veyr.v1","characterName":"Edda Veyr",
    "conversationKey":"relationship.northreach.edda-veyr.v1",
    "boomEngaged":"Good. Keep the lease terms and employer paperwork together. Meridian hiring is accelerating, so people who can prove where they live and who employs them will have more options when the next round of contracts opens.",
    "boomWaiting":"I have not heard back yet. The housing window is still the first thing I would stabilize. Meridian hiring is accelerating, and a rushed address or employer record can become expensive later.",
    "fractureTrusted":"I am sending this before the public notice spreads. The Strategic Resources Office is reviewing export commitments after several partners questioned supply guarantees. Do not panic, but check any job, investment, or business plan that assumes unrestricted mineral shipments.",
    "fractureEngaged":"Northreach has opened an export review. That does not mean shipments are stopping, but contracts tied to minerals and northern logistics may be repriced. Recheck any assumption that depended on smooth cross-border supply.",
    "fractureWaiting":"Public notice: Northreach is reviewing selected export commitments. If your income or investments depend on strategic minerals or northern freight, expect more uncertainty until the review is resolved."
  },
  {
    "country":"yrethia","countryCode":"YRETHIA",
    "characterKey":"character.yrethia.leva-orren.v1","characterName":"Leva Orren",
    "conversationKey":"relationship.yrethia.leva-orren.v1",
    "boomEngaged":"Your record is in better shape now. Meridian traffic is bringing more work into Sableport, but it is also making employers less patient with documentation errors. Keep copies of every correction and do not let a busy office substitute speed for accuracy.",
    "boomWaiting":"Meridian traffic is picking up quickly. Before you take advantage of the new work, make sure the address mismatch is actually closed. A temporary shortcut can become a permanent record problem in Sableport.",
    "fractureTrusted":"A capacity warning is circulating among port and insurance offices before the broader announcement. Carriers are being asked for tighter documentation and insurers are reassessing congestion risk. If you have a client or job tied to fast clearance, prepare for slower verification.",
    "fractureEngaged":"Sableport capacity is tightening. Expect stricter cargo records, longer clearance, and more questions from insurers. This is operational pressure, not proof of wrongdoing by any route or operator.",
    "fractureWaiting":"Public notice: Sableport is under capacity pressure. Cargo clearance and insurance review may slow while authorities reassess congestion and documentation risk."
  },
  {
    "country":"thaloris","countryCode":"THALORIS",
    "characterKey":"character.thaloris.vessa-tarn.v1","characterName":"Vessa Tarn",
    "conversationKey":"relationship.thaloris.vessa-tarn.v1",
    "boomEngaged":"You are getting your footing. Meridian overflow is already pushing more repair and storage work into Dusk Harbor. Take the opportunity, but keep records good enough that a future client can tell flexible commerce from careless commerce.",
    "boomWaiting":"The first Meridian overflow jobs are arriving. Dusk Harbor will give you chances quickly, but speed is not the same thing as stability. Keep your room, work, and payment terms traceable while you decide where to commit.",
    "fractureTrusted":"Foreign insurers are starting to question alternate-route exposure while Yrethian congestion pushes more cargo toward us. Recognized operators may gain work fast, but smaller firms could be excluded by changing standards. Keep evidence for every job you touch.",
    "fractureEngaged":"Dusk Harbor is getting more overflow cargo and more scrutiny at the same time. Repair and storage demand may rise, but financing and insurance can tighten even when the underlying work is legitimate.",
    "fractureWaiting":"Public notice: alternate-route demand is increasing while insurers and foreign partners review Thalorian documentation standards. Expect opportunity and scrutiny together."
  },
  {
    "country":"solvend","countryCode":"SOLVEND",
    "characterKey":"character.solvend.iven-sar.v1","characterName":"Iven Sar",
    "conversationKey":"relationship.solvend.iven-sar.v1",
    "boomEngaged":"Your credential route gives you a usable path. Meridian contractors are expanding technical hiring, so now is the time to compare training obligations, conversion terms, and who owns work produced inside a program.",
    "boomWaiting":"Technical hiring is accelerating with the Meridian buildout. Before you chase the highest salary, confirm what your credential status actually permits and whether the role improves or narrows your future mobility.",
    "fractureTrusted":"Talent offices are preparing tighter controls around strategic projects. The public explanation will focus on shortages, but the practical effect may be more confidentiality restrictions and less mobility between employers. Read any new terms before accepting them.",
    "fractureEngaged":"Solvend is tightening access around selected strategic programs as talent shortages worsen. Wages may rise, but mobility, publication, and foreign collaboration can become more restricted.",
    "fractureWaiting":"Public notice: strategic talent shortages are increasing. Selected employers and research programs may add access, mobility, or confidentiality restrictions while recruitment continues."
  },
  {
    "country":"eldoran","countryCode":"ELDORAN",
    "characterKey":"character.eldoran.mera-dalen.v1","characterName":"Mera Dalen",
    "conversationKey":"relationship.eldoran.mera-dalen.v1",
    "boomEngaged":"You have enough information now to make a deliberate choice about cash, housing, and inventory. Meridian investment is expanding distribution demand, but leave yourself room for a bad week. Growth is easier to survive when every coin is not already committed.",
    "boomWaiting":"Crescent Bay is getting busier as Meridian distribution expands. Do not let the boom convince you that every price increase is permanent or every inventory purchase is urgent. Preserve enough cash to absorb a surprise.",
    "fractureTrusted":"The harvest revision is worse than the first private estimates, though not a collapse. Wholesale buyers are already adjusting. If you hold inventory or supply contracts, separate real scarcity from people trying to profit from the headline.",
    "fractureEngaged":"Eldoran has revised the harvest outlook downward. Wholesale prices and storage demand may rise, but the size and duration of the shortage are still uncertain. Watch transport and household affordability together.",
    "fractureWaiting":"Public notice: Eldoran has lowered its harvest outlook. Food, storage, and distribution prices may face pressure while agencies reassess supply conditions."
  },
  {
    "country":"valerion","countryCode":"VALERION",
    "characterKey":"character.valerion.celan-mire.v1","characterName":"Celan Mire",
    "conversationKey":"relationship.valerion.celan-mire.v1",
    "boomEngaged":"You have chosen a workable housing constraint. Meridian investment is pulling more money toward energy and water projects, but remember that the polished central districts do not show who is paying the higher utility and commute costs outside them.",
    "boomWaiting":"Meridian investment is accelerating around Glassfall. Before you commit to central housing or a project role, calculate the recurring cost, not just the opportunity in front of you.",
    "fractureTrusted":"Reservoir readings are below the planning range used by several Meridian projects. Officials are not calling this a crisis, but export commitments and household conservation rules may collide if the trend holds. Review any plan that assumes abundant water.",
    "fractureEngaged":"Valerion has issued a reservoir warning. Energy and water projects may gain urgency while conservation rules and household costs tighten. The warning is serious, but the final seasonal outcome is still uncertain.",
    "fractureWaiting":"Public notice: reservoir levels are below planning expectations. Valerion is reviewing conservation, utility, and project assumptions as Meridian commitments expand."
  },
  {
    "country":"lumenor","countryCode":"LUMENOR",
    "characterKey":"character.lumenor.nela-corin.v1","characterName":"Nela Corin",
    "conversationKey":"relationship.lumenor.nela-corin.v1",
    "boomEngaged":"Your local records are finally starting to line up. The Meridian Forum is creating real work in Starfall, but do not confuse proximity to institutions with secure status. Keep your own paperwork current while you build a network.",
    "boomWaiting":"Forum hiring is expanding, and so are the queues at every office connected to housing and residency. Get your address recognized before the boom turns a small administrative problem into a missed opportunity.",
    "fractureTrusted":"The Forum is becoming more hostile behind closed doors. Delegations are disputing ownership, security, and responsibility, and staff are being pushed to describe uncertain claims as settled positions. If you handle information, preserve what is verified and what is only alleged.",
    "fractureEngaged":"The Meridian Forum is entering a more confrontational phase. Public statements are moving faster than verified evidence. Work tied to records, translation, or policy will become more valuable and more politically sensitive.",
    "fractureWaiting":"Public notice: Meridian negotiations have intensified as countries dispute governance, ownership, and security. Starfall institutions are preparing for a more contentious phase."
  },
  {
    "country":"xalvoria","countryCode":"XALVORIA",
    "characterKey":"character.xalvoria.elian-vor.v1","characterName":"Elian Vor",
    "conversationKey":"relationship.xalvoria.elian-vor.v1",
    "boomEngaged":"You understand the leverage in the housing advance now. Meridian finance is moving fast, and that can accelerate your career. Keep asking the same question on every deal: what obligation survives if the optimistic case fails?",
    "boomWaiting":"Meridian projects are making credit look effortless. Before you accept an advance, loan, or partnership because everyone else is moving, identify what you still owe if the project slows down.",
    "fractureTrusted":"Several foreign partners are pushing back on Xalvorian financing conditions. Projects are not collapsing, but lenders are preparing for renegotiation and ownership review. If you are exposed to project debt, model what happens when refinancing is less friendly.",
    "fractureEngaged":"Resistance to Xalvorian financing terms is increasing. Infrastructure work may continue while ownership, debt, and guarantees become politically contested. Leverage that looked harmless in the boom can matter quickly.",
    "fractureWaiting":"Public notice: several Meridian partners are seeking changes to financing and ownership terms. Xalvorian lenders and project firms are reviewing exposure."
  },
  {
    "country":"dravenlok","countryCode":"DRAVENLOK",
    "characterKey":"character.dravenlok.orsa-bren.v1","characterName":"Orsa Bren",
    "conversationKey":"relationship.dravenlok.orsa-bren.v1",
    "boomEngaged":"You are building a reliable record. Meridian orders are expanding factory and supplier demand, which can give you real mobility if training keeps pace. Do not let employer housing or one supervisor become the only thing holding your life together.",
    "boomWaiting":"Meridian orders are increasing industrial hiring. Stable work is useful, but read employer housing and training obligations as one package before you trade mobility for convenience.",
    "fractureTrusted":"Procurement offices are questioning whether current guarantees can be met without unsafe schedules or more expensive imported inputs. Output pressure will rise before the public sees the full constraint. Keep quality and safety records current.",
    "fractureEngaged":"Dravenlok is reviewing production commitments as component and energy pressures grow. Overtime and wages may rise, but so can safety, quality, and supplier-financing risk.",
    "fractureWaiting":"Public notice: industrial procurement commitments are under review as input costs and capacity pressure increase. Manufacturers are reassessing schedules and supply assumptions."
  },
  {
    "country":"syndalis","countryCode":"SYNDALIS",
    "characterKey":"character.syndalis.aven-sorel.v1","characterName":"Aven Sorel",
    "conversationKey":"relationship.syndalis.aven-sorel.v1",
    "boomEngaged":"You handled the first verification carefully. Meridian integration is creating more fintech and security work, but every new system will ask for data because it can, not always because it should. Keep separating required access from convenient access.",
    "boomWaiting":"Payment and identity work is expanding with Meridian integration. Before you accept every permission request as normal, confirm which data is actually required for the service you need.",
    "fractureTrusted":"Security teams are investigating a cluster of incidents affecting customs and payment systems. Attribution is not reliable yet. Expect stricter account review and access controls, but do not repeat claims about responsibility that the evidence does not support.",
    "fractureEngaged":"Cyber and payment incidents are increasing before attribution is clear. Security demand will rise, but so will account reviews and pressure for broader access. Keep evidence separate from accusation.",
    "fractureWaiting":"Public notice: several customs and payment systems are under heightened security review after recent incidents. Attribution remains unresolved."
  }
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1
    from public.game_sessions g
    where g.id = p_game_session_id
  ) then
    raise exception 'RELATIONSHIP_FOLLOWUP_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select storyline_row.id
  into v_storyline_id
  from public.storylines as storyline_row
  where lower(storyline_row.key) = lower('econovaria_demo_act_1')
    and storyline_row.is_active
  limit 1;

  if v_storyline_id is null then
    raise exception 'RELATIONSHIP_FOLLOWUP_CANONICAL_STORYLINE_MISSING'
      using errcode = 'P0001';
  end if;

  for v_contact in
    select value
    from jsonb_array_elements(v_contacts)
  loop
    insert into public.storyline_events (
      storyline_id, event_key, title, description, act, sequence,
      trigger_type, scheduled_offset_seconds, trigger_condition,
      reveal_payload, public_news_payload, player_rules,
      policy_payloads, flag_payloads, contract_unlock_payloads,
      priority, is_active
    ) values (
      v_storyline_id,
      'relationship_' || (v_contact ->> 'country') || '_sponsor_followup',
      (v_contact ->> 'characterName') || ': Meridian boom follow-up',
      'A relationship-aware sponsor follow-up that changes based on whether the player replied to the opening contact.',
      1,
      v_sequence,
      'elapsed_time',
      21600,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_array(
        jsonb_build_object(
          'ruleKey', (v_contact ->> 'country') || '_sponsor_followup_engaged',
          'condition', jsonb_build_object(
            'all', jsonb_build_array(
              jsonb_build_object(
                'type', 'player_current_country_is',
                'countryCode', v_contact ->> 'countryCode'
              ),
              jsonb_build_object(
                'type', 'player_relationship_reply_count_at_least',
                'characterKey', v_contact ->> 'characterKey',
                'count', 1
              )
            )
          ),
          'effects', jsonb_build_array(
            jsonb_build_object(
              'type', 'character_message',
              'characterKey', v_contact ->> 'characterKey',
              'characterName', v_contact ->> 'characterName',
              'conversationKey', v_contact ->> 'conversationKey',
              'title', (v_contact ->> 'characterName') || ' — Meridian is accelerating',
              'body', v_contact ->> 'boomEngaged',
              'allowPlayerReplies', true,
              'payload', jsonb_build_object(
                'phase', 'meridian_boom',
                'relationshipRole', 'sponsor',
                'relationshipAware', true,
                'branch', 'engaged'
              )
            )
          )
        ),
        jsonb_build_object(
          'ruleKey', (v_contact ->> 'country') || '_sponsor_followup_waiting',
          'condition', jsonb_build_object(
            'all', jsonb_build_array(
              jsonb_build_object(
                'type', 'player_current_country_is',
                'countryCode', v_contact ->> 'countryCode'
              ),
              jsonb_build_object(
                'type', 'player_relationship_stage_is',
                'characterKey', v_contact ->> 'characterKey',
                'stage', 'contacted'
              )
            )
          ),
          'effects', jsonb_build_array(
            jsonb_build_object(
              'type', 'character_message',
              'characterKey', v_contact ->> 'characterKey',
              'characterName', v_contact ->> 'characterName',
              'conversationKey', v_contact ->> 'conversationKey',
              'title', (v_contact ->> 'characterName') || ' — One more thing before the boom moves faster',
              'body', v_contact ->> 'boomWaiting',
              'allowPlayerReplies', true,
              'payload', jsonb_build_object(
                'phase', 'meridian_boom',
                'relationshipRole', 'sponsor',
                'relationshipAware', true,
                'branch', 'unanswered'
              )
            )
          )
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      'normal',
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

    v_upserted := v_upserted + 1;
    v_sequence := v_sequence + 1;

    insert into public.storyline_events (
      storyline_id, event_key, title, description, act, sequence,
      trigger_type, scheduled_offset_seconds, trigger_condition,
      reveal_payload, public_news_payload, player_rules,
      policy_payloads, flag_payloads, contract_unlock_payloads,
      priority, is_active
    ) values (
      v_storyline_id,
      'meridian_fracture_' || (v_contact ->> 'country') || '_sponsor_reaction',
      (v_contact ->> 'characterName') || ': Fracture warning',
      'A country-specific Meridian fracture reaction that reveals different information based on relationship trust and engagement.',
      2,
      v_sequence,
      'elapsed_time',
      86400,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_array(
        jsonb_build_object(
          'ruleKey', (v_contact ->> 'country') || '_fracture_trusted',
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
              'title', (v_contact ->> 'characterName') || ' — I am telling you this early',
              'body', v_contact ->> 'fractureTrusted',
              'allowPlayerReplies', true,
              'payload', jsonb_build_object(
                'phase', 'meridian_fracture',
                'relationshipRole', 'sponsor',
                'relationshipAware', true,
                'branch', 'trusted'
              )
            )
          )
        ),
        jsonb_build_object(
          'ruleKey', (v_contact ->> 'country') || '_fracture_engaged',
          'condition', jsonb_build_object(
            'all', jsonb_build_array(
              jsonb_build_object(
                'type', 'player_current_country_is',
                'countryCode', v_contact ->> 'countryCode'
              ),
              jsonb_build_object(
                'type', 'player_relationship_reply_count_at_least',
                'characterKey', v_contact ->> 'characterKey',
                'count', 1
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
              'title', (v_contact ->> 'characterName') || ' — Meridian conditions are changing',
              'body', v_contact ->> 'fractureEngaged',
              'allowPlayerReplies', true,
              'payload', jsonb_build_object(
                'phase', 'meridian_fracture',
                'relationshipRole', 'sponsor',
                'relationshipAware', true,
                'branch', 'engaged'
              )
            )
          )
        ),
        jsonb_build_object(
          'ruleKey', (v_contact ->> 'country') || '_fracture_unanswered',
          'condition', jsonb_build_object(
            'all', jsonb_build_array(
              jsonb_build_object(
                'type', 'player_current_country_is',
                'countryCode', v_contact ->> 'countryCode'
              ),
              jsonb_build_object(
                'type', 'player_relationship_stage_is',
                'characterKey', v_contact ->> 'characterKey',
                'stage', 'contacted'
              )
            )
          ),
          'effects', jsonb_build_array(
            jsonb_build_object(
              'type', 'character_message',
              'characterKey', v_contact ->> 'characterKey',
              'characterName', v_contact ->> 'characterName',
              'conversationKey', v_contact ->> 'conversationKey',
              'title', (v_contact ->> 'characterName') || ' — Public Meridian warning',
              'body', v_contact ->> 'fractureWaiting',
              'allowPlayerReplies', true,
              'payload', jsonb_build_object(
                'phase', 'meridian_fracture',
                'relationshipRole', 'sponsor',
                'relationshipAware', true,
                'branch', 'unanswered'
              )
            )
          )
        )
      ),
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

    v_upserted := v_upserted + 1;
    v_sequence := v_sequence + 1;
  end loop;

  return v_upserted;
end;
$function$;

create or replace function public.activate_relationship_followups_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_relationship_followups_and_meridian_fracture_v1(
      new.game_session_id
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists zz_activate_relationship_followups_from_full_game_v1
  on public.game_feature_activation_evidence;
create trigger zz_activate_relationship_followups_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_relationship_followups_from_full_game_v1();

revoke all on function public.initialize_relationship_followups_and_meridian_fracture_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_relationship_followups_and_meridian_fracture_v1(uuid)
  to service_role;

comment on function public.initialize_relationship_followups_and_meridian_fracture_v1(uuid) is
  'Attaches relationship-aware sponsor follow-ups and first Meridian fracture reactions to the single canonical Econovaria storyline as globally dormant definitions. Per-game overrides are the only runtime enablement authority.';

commit;
