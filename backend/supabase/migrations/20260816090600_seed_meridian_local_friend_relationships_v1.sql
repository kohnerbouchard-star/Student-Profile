begin;

-- Adds the first non-sponsor relationship layer to the Meridian campaign.
-- Definitions stay globally dormant and are enabled only for a game after a
-- player in that game receives an arrival-phase Story character contact.
-- Existing in-progress games are intentionally not backfilled mid-campaign.

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

-- Install dormant shared definitions when Story source content already exists.
-- Do not backfill game-scoped overrides for existing campaigns: injecting four
-- historical relationship messages into an in-progress classroom would break
-- narrative timing. Existing campaigns can finish on the pre-merge relationship
-- depth; newly arriving campaigns receive the expanded layer automatically.
do $install_definitions$
declare
  v_game_session_id uuid;
begin
  if exists (
    select 1 from public.storylines s
    where lower(s.key)=lower('econovaria_demo_act_1') and s.is_active
  ) then
    select g.id into v_game_session_id
    from public.game_sessions g
    order by g.created_at asc
    limit 1;
    if v_game_session_id is not null then
      perform public.initialize_meridian_local_friend_relationships_v1(v_game_session_id);
    end if;
  end if;
end;
$install_definitions$;

revoke all on function public.initialize_meridian_local_friend_relationships_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_meridian_local_friend_relationships_v1(uuid)
  to service_role;

comment on function public.initialize_meridian_local_friend_relationships_v1(uuid) is
  'Installs four globally dormant local-friend relationship events for the canonical Meridian campaign. Game-scoped overrides are created only after that game receives an arrival Story contact.';

commit;
