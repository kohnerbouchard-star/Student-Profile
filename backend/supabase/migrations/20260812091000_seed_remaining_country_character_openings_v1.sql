begin;

create or replace function public.initialize_remaining_country_character_openings_v1(
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
  v_sequence integer := 20;
  v_inserted integer := 0;
  v_contacts jsonb := $contacts$
[
  {"country":"yrethia","countryCode":"YRETHIA","role":"sponsor","characterKey":"character.yrethia.leva-orren.v1","characterName":"Leva Orren","slug":"leva_document_check","offset":0,"title":"Leva Orren — Protect your record","body":"Before your first appointment, fix the address mismatch and keep copies of every correction. Sableport rewards a clean record, but small errors can follow you. Reply if you want me to check which document should control."},
  {"country":"yrethia","countryCode":"YRETHIA","role":"local_friend","characterKey":"character.yrethia.perran-dey.v1","characterName":"Perran Dey","slug":"perran_night_shift","offset":900,"title":"Perran Dey — What the port looks like after dark","body":"The hiring boards only show the headline rate. Ask about night transport, overtime, and where the shift actually ends. If you get an offer, send me the parts you are unsure about."},
  {"country":"yrethia","countryCode":"YRETHIA","role":"rival_peer","characterKey":"character.yrethia.alin-sorev.v1","characterName":"Alin Sorev","slug":"alin_perfect_record","offset":1800,"title":"Alin Sorev — Reputation compounds","body":"I am treating every form and review like it will be read again in five years. It probably will be. I can compare notes if you are serious about building a professional record instead of chasing the fastest opening."},
  {"country":"yrethia","countryCode":"YRETHIA","role":"gatekeeper","characterKey":"character.yrethia.nadi-oran.v1","characterName":"Nadi Oran","slug":"nadi_worker_risk","offset":3600,"title":"Nadi Oran — Do not let urgency move the risk onto you","body":"Port demand is real, but so are fatigue and unsafe schedules. Before you accept a logistics role, check who carries the cost when cargo is late. Reply if you want the worker-side questions worth asking."},

  {"country":"thaloris","countryCode":"THALORIS","role":"sponsor","characterKey":"character.thaloris.vessa-tarn.v1","characterName":"Vessa Tarn","slug":"vessa_first_shift","offset":0,"title":"Vessa Tarn — Your first room and first shift","body":"The room is temporary and the shift is real. You do not owe anyone blind loyalty for helping you arrive, but reliability matters here. Tell me whether you are choosing licensed housing or preserving cash for work."},
  {"country":"thaloris","countryCode":"THALORIS","role":"local_friend","characterKey":"character.thaloris.kalen-ro.v1","characterName":"Kalen Ro","slug":"kalen_repair_value","offset":900,"title":"Kalen Ro — Repair work is better than its reputation","body":"Half the equipment moving through Dusk Harbor works because somebody here rebuilt it instead of throwing it away. If you want practical work, I can tell you which yards actually teach people and which only need cheap hands."},
  {"country":"thaloris","countryCode":"THALORIS","role":"rival_peer","characterKey":"character.thaloris.evin-maro.v1","characterName":"Evin Maro","slug":"evin_formal_route","offset":1800,"title":"Evin Maro — Legitimacy opens better doors","body":"Flexible commerce gets you started. Recognized records get you financed. I am focusing on clients who can document everything because I do not intend to stay small. Decide whether you want access now or credibility later."},
  {"country":"thaloris","countryCode":"THALORIS","role":"gatekeeper","characterKey":"character.thaloris.maelin-noll.v1","characterName":"Maelin Noll","slug":"maelin_reform_path","offset":3600,"title":"Maelin Noll — Flexibility still needs evidence","body":"Dusk Harbor should not have to imitate Yrethia to be legitimate, but reform only works if records can survive scrutiny. If you are entering trade or repair, keep provenance, safety, and payment terms visible."},

  {"country":"solvend","countryCode":"SOLVEND","role":"sponsor","characterKey":"character.solvend.iven-sar.v1","characterName":"Iven Sar","slug":"iven_credential_route","offset":0,"title":"Iven Sar — Confirm your credential route","body":"Do not assume your foreign credential is either fully accepted or worthless. Solvend has provisional and retraining routes that lead to very different careers. Reply with the route you were assigned and I will tell you what it actually permits."},
  {"country":"solvend","countryCode":"SOLVEND","role":"local_friend","characterKey":"character.solvend.liora-fen.v1","characterName":"Liora Fen","slug":"liora_contract_work","offset":900,"title":"Liora Fen — High pay can still be unstable","body":"Aurora Spire is short on technical workers, which means companies will promise a lot. Ask whether the job converts to permanent status, who owns your training, and what happens if the project ends."},
  {"country":"solvend","countryCode":"SOLVEND","role":"rival_peer","characterKey":"character.solvend.tevan-aris.v1","characterName":"Tevan Aris","slug":"tevan_access","offset":1800,"title":"Tevan Aris — Access is the scarce asset","body":"Talent is common here. Institutional access is not. I am choosing projects that put me next to the people who decide what gets funded. If you want to move quickly, think about who will know your work six months from now."},
  {"country":"solvend","countryCode":"SOLVEND","role":"gatekeeper","characterKey":"character.solvend.amara-tey.v1","characterName":"Amara Tey","slug":"amara_mobility","offset":3600,"title":"Amara Tey — Training should not become a cage","body":"Shortage programs can open doors, but read any service obligation carefully. A good opportunity should build your mobility rather than make one employer your entire immigration strategy."},

  {"country":"eldoran","countryCode":"ELDORAN","role":"sponsor","characterKey":"character.eldoran.mera-dalen.v1","characterName":"Mera Dalen","slug":"mera_starting_cash","offset":0,"title":"Mera Dalen — Decide what your starting cash must protect","body":"Crescent Bay will tempt you to spend on either stable housing or inventory. Neither choice is automatically safer. Keep enough room to survive a bad week, and do not borrow against scarcity stories you cannot verify."},
  {"country":"eldoran","countryCode":"ELDORAN","role":"local_friend","characterKey":"character.eldoran.oren-pell.v1","characterName":"Oren Pell","slug":"oren_distribution","offset":900,"title":"Oren Pell — A late rail car becomes a higher grocery bill","body":"The market looks like prices and stalls, but the real story starts upstream. If you are choosing between logistics and retail, I can show you where small delays turn into real household costs."},
  {"country":"eldoran","countryCode":"ELDORAN","role":"rival_peer","characterKey":"character.eldoran.selka-venn.v1","characterName":"Selka Venn","slug":"selka_scale","offset":1800,"title":"Selka Venn — Scale is protection","body":"Thin margins punish hesitation. I am reinvesting almost everything because volume gives you negotiating power when prices move. If you stay small, make sure it is a deliberate strategy and not fear."},
  {"country":"eldoran","countryCode":"ELDORAN","role":"gatekeeper","characterKey":"character.eldoran.eren-calder.v1","characterName":"Eren Calder","slug":"eren_affordability","offset":3600,"title":"Eren Calder — Profit and affordability are different questions","body":"A food business can be efficient and still push costs onto households that have no alternative. If you work on supply or pricing, track who benefits and who absorbs the shock."},

  {"country":"valerion","countryCode":"VALERION","role":"sponsor","characterKey":"character.valerion.celan-mire.v1","characterName":"Celan Mire","slug":"celan_distance","offset":0,"title":"Celan Mire — Glassfall is more unequal than the skyline suggests","body":"Housing near the center buys time but consumes cash. Housing outside the city preserves money but makes every shift harder. Pick the constraint you can actually manage, not the image you want to project."},
  {"country":"valerion","countryCode":"VALERION","role":"local_friend","characterKey":"character.valerion.ressa-vail.v1","characterName":"Ressa Vail","slug":"ressa_household_access","offset":900,"title":"Ressa Vail — Conservation rules land on real households","body":"I spend my day hearing what utility policy sounds like at a kitchen table. If you enter energy or water work, remember that an efficient system can still be inaccessible to the people paying for it."},
  {"country":"valerion","countryCode":"VALERION","role":"rival_peer","characterKey":"character.valerion.joren-pahl.v1","characterName":"Joren Pahl","slug":"joren_capital","offset":1800,"title":"Joren Pahl — Capital moves before consensus","body":"The best green projects are being financed now, not after every political argument is settled. I am following the investors who can actually close. Social outcomes matter, but without capital nothing gets built."},
  {"country":"valerion","countryCode":"VALERION","role":"gatekeeper","characterKey":"character.valerion.talia-quen.v1","characterName":"Talia Quen","slug":"talia_access","offset":3600,"title":"Talia Quen — Resilience must include access","body":"Water security and energy security are not meaningful if the solution prices ordinary users out. If you evaluate a project, separate environmental performance from affordability instead of assuming one proves the other."},

  {"country":"lumenor","countryCode":"LUMENOR","role":"sponsor","characterKey":"character.lumenor.nela-corin.v1","characterName":"Nela Corin","slug":"nela_address","offset":0,"title":"Nela Corin — Get the address recognized first","body":"Starfall asks for a local address before half the systems you need will talk to each other. Fix that first. If an office sends you in a circle, reply with the requirement they cited and I will help you identify the right process."},
  {"country":"lumenor","countryCode":"LUMENOR","role":"local_friend","characterKey":"character.lumenor.arven-lis.v1","characterName":"Arven Lis","slug":"arven_records","offset":900,"title":"Arven Lis — Public records are useful because they disagree","body":"Do not be discouraged when two official documents conflict. That is often where the real question starts. I can show you how to separate a correction problem from a genuine dispute."},
  {"country":"lumenor","countryCode":"LUMENOR","role":"rival_peer","characterKey":"character.lumenor.mirael-doss.v1","characterName":"Mirael Doss","slug":"mirael_patience","offset":1800,"title":"Mirael Doss — Influence rewards patience","body":"People who demand immediate answers in Starfall usually lose access before they gain leverage. I am learning which rooms matter and when not to speak. You should decide whether you want independence or institutional influence first."},
  {"country":"lumenor","countryCode":"LUMENOR","role":"gatekeeper","characterKey":"character.lumenor.dena-holt.v1","characterName":"Dena Holt","slug":"dena_evidence","offset":3600,"title":"Dena Holt — Label what you know","body":"The Forum is already producing more claims than verified facts. In any work you take, keep fact, allegation, forecast, and opinion separate. Trust is easier to preserve than rebuild."},

  {"country":"xalvoria","countryCode":"XALVORIA","role":"sponsor","characterKey":"character.xalvoria.elian-vor.v1","characterName":"Elian Vor","slug":"elian_advance","offset":0,"title":"Elian Vor — Read the advance like a debt instrument","body":"The employer-linked advance solves your housing problem today and creates leverage over you tomorrow. That does not make it bad. It means you should know the repayment terms before comfort makes the decision for you."},
  {"country":"xalvoria","countryCode":"XALVORIA","role":"local_friend","characterKey":"character.xalvoria.sena-korr.v1","characterName":"Sena Korr","slug":"sena_permits","offset":900,"title":"Sena Korr — Every project has a neighborhood underneath it","body":"Emberhall talks about projects in billions and permits in pages. I see the tenants and shops underneath those numbers. If you enter construction or finance, learn who carries the disruption when the schedule changes."},
  {"country":"xalvoria","countryCode":"XALVORIA","role":"rival_peer","characterKey":"character.xalvoria.darin-valeo.v1","characterName":"Darin Valeo","slug":"darin_leverage","offset":1800,"title":"Darin Valeo — Hesitation has a price","body":"Capital is cheap while confidence is high. I would rather carry debt into growth than arrive late with a perfect balance sheet. If you are investing, decide how much uncertainty you can actually survive."},
  {"country":"xalvoria","countryCode":"XALVORIA","role":"gatekeeper","characterKey":"character.xalvoria.nara-esen.v1","characterName":"Nara Esen","slug":"nara_accountability","offset":3600,"title":"Nara Esen — Make ownership and assumptions visible","body":"A profitable project can still be badly governed. Before you attach your name to one, know who owns it, what assumptions support it, and who is accountable when those assumptions fail."},

  {"country":"dravenlok","countryCode":"DRAVENLOK","role":"sponsor","characterKey":"character.dravenlok.orsa-bren.v1","characterName":"Orsa Bren","slug":"orsa_housing_contract","offset":0,"title":"Orsa Bren — Employer housing is part of the contract","body":"Industrial housing can stabilize your first months, but it also ties your home to your job. Read the exit terms before you sign. Training and a reliable record should increase your options over time, not reduce them."},
  {"country":"dravenlok","countryCode":"DRAVENLOK","role":"local_friend","characterKey":"character.dravenlok.tarek-junn.v1","characterName":"Tarek Junn","slug":"tarek_shop_floor","offset":900,"title":"Tarek Junn — Learn the shop floor before the slogans","body":"Ironhold is proud of what it builds, and most of that pride is earned. But some lines are running too hard. If you take factory work, ask who can stop production when something is unsafe."},
  {"country":"dravenlok","countryCode":"DRAVENLOK","role":"rival_peer","characterKey":"character.dravenlok.vesna-raal.v1","characterName":"Vesna Raal","slug":"vesna_output","offset":1800,"title":"Vesna Raal — Output gets noticed","body":"Management remembers the people who solve capacity problems. I am positioning myself where deadlines and production targets are visible. If you want mobility, do not stay invisible just because the work is dependable."},
  {"country":"dravenlok","countryCode":"DRAVENLOK","role":"gatekeeper","characterKey":"character.dravenlok.ilya-dren.v1","characterName":"Ilya Dren","slug":"ilya_safety","offset":3600,"title":"Ilya Dren — Production pressure does not cancel safety","body":"Meridian demand is pushing every plant harder. That makes quality and worker voice more important, not less. If a supervisor tells you urgency is a reason to ignore a hazard, document it."},

  {"country":"syndalis","countryCode":"SYNDALIS","role":"sponsor","characterKey":"character.syndalis.aven-sorel.v1","characterName":"Aven Sorel","slug":"aven_identity","offset":0,"title":"Aven Sorel — Verify what is required before you share it","body":"Blacklight can make identity and banking feel seamless, which also makes it easy to surrender more information than a process needs. Complete the required verification, but ask why optional data is being requested."},
  {"country":"syndalis","countryCode":"SYNDALIS","role":"local_friend","characterKey":"character.syndalis.nyra-pell.v1","characterName":"Nyra Pell","slug":"nyra_account_access","offset":900,"title":"Nyra Pell — Systems fail people in ordinary ways","body":"Most account lockouts are not dramatic attacks. They are bad data, rigid rules, or no clear appeal path. If you work in fintech or security, pay attention to what happens to the person on the wrong side of an automated decision."},
  {"country":"syndalis","countryCode":"SYNDALIS","role":"rival_peer","characterKey":"character.syndalis.kiran-vos.v1","characterName":"Kiran Vos","slug":"kiran_access","offset":1800,"title":"Kiran Vos — Access beats privacy if nobody can use the system","body":"People criticize data collection until fraud or outages lock them out. I am building for scale and security first. We can debate privacy after the system works. You should decide what trade-off you are actually willing to defend."},
  {"country":"syndalis","countryCode":"SYNDALIS","role":"gatekeeper","characterKey":"character.syndalis.asha-coren.v1","characterName":"Asha Coren","slug":"asha_due_process","offset":3600,"title":"Asha Coren — Security still needs due process","body":"Technical access is not moral authority. If your work touches identity, payments, or private data, keep the purpose and limits explicit. Emergency logic has a habit of becoming permanent when nobody records the boundary."}
]
$contacts$::jsonb;
begin
  if p_game_session_id is null or not exists (
    select 1 from public.game_sessions g where g.id = p_game_session_id
  ) then
    raise exception 'COUNTRY_OPENINGS_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select s.id into v_storyline_id
  from public.storylines s
  where lower(s.key) = lower('econovaria_demo_act_1') and s.is_active
  limit 1;

  if v_storyline_id is null then
    perform 1 from public.initialize_demo_storyline_for_game(p_game_session_id, 'missing_only');
    select s.id into v_storyline_id
    from public.storylines s
    where lower(s.key) = lower('econovaria_demo_act_1') and s.is_active
    limit 1;
  end if;

  if v_storyline_id is null then
    raise exception 'COUNTRY_OPENINGS_CANONICAL_STORYLINE_MISSING' using errcode = 'P0001';
  end if;

  for v_contact in select value from jsonb_array_elements(v_contacts)
  loop
    insert into public.storyline_events (
      storyline_id, event_key, title, description, act, sequence,
      trigger_type, scheduled_offset_seconds, trigger_condition,
      reveal_payload, public_news_payload, player_rules,
      policy_payloads, flag_payloads, contract_unlock_payloads,
      priority, is_active
    ) values (
      v_storyline_id,
      'arrival_' || (v_contact ->> 'country') || '_' || (v_contact ->> 'slug'),
      v_contact ->> 'title',
      'Country-specific immigrant opening relationship contact for ' || (v_contact ->> 'characterName') || '.',
      1,
      v_sequence,
      'elapsed_time',
      (v_contact ->> 'offset')::integer,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'ruleKey', (v_contact ->> 'country') || '_' || (v_contact ->> 'slug'),
        'condition', jsonb_build_object(
          'type', 'player_current_country_is',
          'countryCode', v_contact ->> 'countryCode'
        ),
        'effects', jsonb_build_array(jsonb_build_object(
          'type', 'character_message',
          'characterKey', v_contact ->> 'characterKey',
          'characterName', v_contact ->> 'characterName',
          'conversationKey', 'relationship.' || (v_contact ->> 'country') || '.' || split_part(v_contact ->> 'characterKey', '.', 3) || '.v1',
          'title', v_contact ->> 'title',
          'body', v_contact ->> 'body',
          'allowPlayerReplies', true,
          'payload', jsonb_build_object(
            'phase', 'arrival',
            'relationshipRole', v_contact ->> 'role',
            'countryCode', v_contact ->> 'countryCode'
          )
        ))
      )),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      case when v_contact ->> 'role' = 'sponsor' then 'major' else 'normal' end,
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

    v_sequence := v_sequence + 1;
    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$function$;

create or replace function public.activate_remaining_country_openings_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_remaining_country_character_openings_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

create trigger activate_remaining_country_openings_from_full_game_v1
after insert or update of story_status on public.game_feature_activation_evidence
for each row
when (new.story_status = 'active')
execute function public.activate_remaining_country_openings_from_full_game_v1();

revoke all on function public.initialize_remaining_country_character_openings_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_remaining_country_character_openings_v1(uuid)
  to service_role;

comment on function public.initialize_remaining_country_character_openings_v1(uuid) is
  'Adds the nine non-Northreach immigrant-opening relationship contacts to the single canonical Econovaria storyline without creating parallel active storylines.';

commit;
