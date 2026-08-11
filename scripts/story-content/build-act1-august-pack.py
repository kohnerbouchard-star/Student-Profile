from __future__ import annotations

import json
from pathlib import Path

OUT = Path("docs/seed-content/story/content/act1-august-content-pack-v1.json")

COUNTRIES = {
    "NORTHREACH": dict(slug="northreach", sponsor=("character.northreach.edda-veyr.v1", "Edda Veyr"), friend=("character.northreach.jonis-hale.v1", "Jonis Hale"), rival=("character.northreach.mares-kovan.v1", "Mares Kovan"), gatekeeper=("character.northreach.rian-kest.v1", "Rian Kest"), lead=("character.northreach.darek-voss.v1", "Darek Voss"), angle="strategic minerals, energy, northern logistics, and worker safety"),
    "YRETHIA": dict(slug="yrethia", sponsor=("character.yrethia.leva-orren.v1", "Leva Orren"), friend=("character.yrethia.perran-dey.v1", "Perran Dey"), rival=("character.yrethia.alin-sorev.v1", "Alin Sorev"), gatekeeper=("character.yrethia.nadi-oran.v1", "Nadi Oran"), lead=("character.yrethia.mira-sen.v1", "Mira Sen"), angle="shipping, customs, insurance, freight finance, and trusted rules"),
    "THALORIS": dict(slug="thaloris", sponsor=("character.thaloris.vessa-tarn.v1", "Vessa Tarn"), friend=("character.thaloris.kalen-ro.v1", "Kalen Ro"), rival=("character.thaloris.evin-maro.v1", "Evin Maro"), gatekeeper=("character.thaloris.maelin-noll.v1", "Maelin Noll"), lead=("character.thaloris.tovan-rell.v1", "Tovan Rell"), angle="repair, overflow routing, bonded trade, and recognition of flexible operators"),
    "SOLVEND": dict(slug="solvend", sponsor=("character.solvend.iven-sar.v1", "Iven Sar"), friend=("character.solvend.liora-fen.v1", "Liora Fen"), rival=("character.solvend.tevan-aris.v1", "Tevan Aris"), gatekeeper=("character.solvend.amara-tey.v1", "Amara Tey"), lead=("character.solvend.sena-oris.v1", "Dr. Sena Oris"), angle="systems design, advanced technology, talent mobility, and institutional control"),
    "ELDORAN": dict(slug="eldoran", sponsor=("character.eldoran.mera-dalen.v1", "Mera Dalen"), friend=("character.eldoran.oren-pell.v1", "Oren Pell"), rival=("character.eldoran.selka-venn.v1", "Selka Venn"), gatekeeper=("character.eldoran.eren-calder.v1", "Eren Calder"), lead=("character.eldoran.halden-marr.v1", "Halden Marr"), angle="food, commodities, central rail, distribution, and household affordability"),
    "VALERION": dict(slug="valerion", sponsor=("character.valerion.celan-mire.v1", "Celan Mire"), friend=("character.valerion.ressa-vail.v1", "Ressa Vail"), rival=("character.valerion.joren-pahl.v1", "Joren Pahl"), gatekeeper=("character.valerion.talia-quen.v1", "Talia Quen"), lead=("character.valerion.elia-varen.v1", "Elia Varen"), angle="clean energy, water, environmental standards, and regional burden"),
    "LUMENOR": dict(slug="lumenor", sponsor=("character.lumenor.nela-corin.v1", "Nela Corin"), friend=("character.lumenor.arven-lis.v1", "Arven Lis"), rival=("character.lumenor.mirael-doss.v1", "Mirael Doss"), gatekeeper=("character.lumenor.dena-holt.v1", "Dena Holt"), lead=("character.lumenor.ila-meren.v1", "Ila Meren"), angle="diplomacy, arbitration, public information, migration coordination, and legitimacy"),
    "XALVORIA": dict(slug="xalvoria", sponsor=("character.xalvoria.elian-vor.v1", "Elian Vor"), friend=("character.xalvoria.sena-korr.v1", "Sena Korr"), rival=("character.xalvoria.darin-valeo.v1", "Darin Valeo"), gatekeeper=("character.xalvoria.nara-esen.v1", "Nara Esen"), lead=("character.xalvoria.cassian-rhyl.v1", "Cassian Rhyl"), angle="infrastructure finance, capital, project management, leverage, and displacement"),
    "DRAVENLOK": dict(slug="dravenlok", sponsor=("character.dravenlok.orsa-bren.v1", "Orsa Bren"), friend=("character.dravenlok.tarek-junn.v1", "Tarek Junn"), rival=("character.dravenlok.vesna-raal.v1", "Vesna Raal"), gatekeeper=("character.dravenlok.ilya-dren.v1", "Ilya Dren"), lead=("character.dravenlok.mara-volsk.v1", "Mara Volsk"), angle="steel, rail equipment, machinery, industrial output, and worker safety"),
    "SYNDALIS": dict(slug="syndalis", sponsor=("character.syndalis.aven-sorel.v1", "Aven Sorel"), friend=("character.syndalis.nyra-pell.v1", "Nyra Pell"), rival=("character.syndalis.kiran-vos.v1", "Kiran Vos"), gatekeeper=("character.syndalis.asha-coren.v1", "Asha Coren"), lead=("character.syndalis.neris-vale.v1", "Neris Vale"), angle="cybersecurity, payment verification, data infrastructure, privacy, and due process"),
}

COPY = {
    "NORTHREACH": dict(arrival="Frostgate rewards people who can keep equipment, freight, and resource work moving. It also remembers every shortcut. Keep your documents close, build cash before you speculate, and do not let an employer make your residency problem their leverage.", friend="I picked up another equipment shift. Good money, bad hours. Everyone keeps talking like the Corridor will solve everything, but the machines still need people standing beside them at two in the morning.", rival="I am not waiting for security to arrive as a policy. I am building enough capital that nobody gets to decide whether I belong here. Resource demand is already moving. You can be cautious if you want.", gate="Strategic demand can raise wages and still make workers disposable. If you take a fast contract, read the safety and disclosure terms before you congratulate yourself on the rate.", forum="For Northreach, Meridian means mineral access, energy commitments, and northern logistics. The upside is obvious. So is the risk of becoming the system everyone depends on and therefore everyone pressures."),
    "YRETHIA": dict(arrival="Sableport can make a newcomer useful very quickly, which is not the same as making them secure. Learn the documentation rules before somebody offers to help you around them. The people who understand the paperwork usually control the access.", friend="We cleared three late manifests today and still lost half a shift to one bad classification. Everyone wants faster trade until a mistake becomes somebody else’s claim.", rival="The fastest route upward here is simple: never give an insurer or regulator a reason to doubt you. I plan to be the person firms trust when everyone else looks risky.", gate="Compliance that only the largest operators can afford is not trusted trade. It is exclusion wearing a badge. If you want speed, make sure the cost is not just pushed down to dockworkers.", forum="Yrethia can make Meridian commercially trusted through customs, insurance, and freight finance. If the rules become a bottleneck, the same strength becomes a weakness."),
    "THALORIS": dict(arrival="Dusk Harbor works because people know which imperfect operators can still be trusted. Formal papers matter, but so does local knowledge. Do not confuse flexibility with lawlessness or a license with competence.", friend="A foreign carrier wants my repair certificate before they will recognize work they were happy to accept last week. Meridian will make that problem bigger before it makes it better.", rival="I am getting every international credential I can. I did not move here to stay inside a local network forever. Recognition is worth paying for.", gate="Emergency flexibility saves commerce only if somebody can explain who was admitted, who was excluded, and why. Due process matters most when everyone says there is no time for it.", forum="Thaloris offers repair, overflow routing, bonded trade, and emergency logistics. Meridian could validate that flexibility—or turn it into a permanent second-tier route."),
    "SOLVEND": dict(arrival="Talent moves faster than institutions admit. Solvend needs you now; that does not mean an employer should own your future. Learn which credentials, projects, and sponsorship terms can follow you when you move.", friend="My team is hiring again. I should be happy. I just wish critical talent came with a contract longer than six months.", rival="Access matters more than independence at the beginning. Get inside the right institution, take the project credit, and negotiate freedom after people need you.", gate="A talent shortage can justify mobility or justify tying people to sponsors. Read every strategic-work condition as if you may want to leave that employer later.", forum="Solvend can supply predictive systems, AI, satellites, and advanced maintenance. Meridian makes technical talent more valuable and control over that talent more political."),
    "ELDORAN": dict(arrival="Food and rail look ordinary until a delay hits dinner prices. If you build a business here, remember that efficiency on a spreadsheet can still mean an empty shelf in somebody’s neighborhood.", friend="The rail office is adding shifts again. I want the promotion, but every supervisor acts like moving more cars is the same thing as moving the right goods.", rival="Reserves are power. The firms that can hold inventory through volatility will buy from the ones that cannot. I intend to be on the first side of that trade.", gate="Producer margins matter. So does whether households can still eat. The easy policy is usually the one that pretends only one of those facts exists.", forum="Eldoran connects food, commodities, rail, and wholesale distribution. Meridian can make the system more efficient, but it also increases the number of countries that feel an Eldoran disruption."),
    "VALERION": dict(arrival="People come to Aurelis for clean infrastructure and opportunity. They discover quickly that environmental policy has bills, neighborhoods, and regional trade-offs attached to it. Learn who pays before you call something sustainable.", friend="The utility queue is full again. Everyone supports conservation in a speech. It gets harder when a household has no cheaper alternative.", rival="Green finance is still finance. Capital goes where returns are protected. Fix the social complaints after the project exists, not before.", gate="A policy can reduce emissions and still distribute pain badly. If you make the system cleaner by making one region poorer, expect that decision to come back.", forum="Valerion brings clean energy, water systems, environmental standards, and green finance. Meridian expands that influence while making drought and allocation policy everyone’s concern."),
    "LUMENOR": dict(arrival="Starfall is full of institutions that sound global until an ordinary person needs one to answer a form. Learn which office actually has authority and which one only has a podium.", friend="I have two sources telling me the same thing and neither will go on record. That is not enough to publish, even if it is enough to worry me.", rival="Influence comes from being invited back into the room. Public confrontation is satisfying; access is useful. I know which one I am building.", gate="Do not collapse fact, allegation, forecast, and opinion into one category just because the headline is moving fast. Credibility is an asset too.", forum="Lumenor can supply arbitration, public information, migration coordination, and institutional legitimacy. Meridian will test whether slower shared process can still act quickly enough."),
    "XALVORIA": dict(arrival="Capital City makes ambition feel normal. That can be useful. Just remember that every rapid project has assumptions about debt, ownership, and who has to move when the model says site cleared.", friend="The new project model passes every return threshold. The relocation assumptions are three lines at the bottom. Guess which part nobody wants to present.", rival="Speed creates its own leverage. If you control the financing before everyone else finishes debating safeguards, you get to write the terms they later complain about.", gate="Fast capital is not the problem. Hidden ownership and assumptions nobody stress-tested are the problem. If a project cannot survive an audit, it is not resilient.", forum="Xalvoria can finance and manage Meridian at scale. The central question is how much ownership and control should follow the capital."),
    "DRAVENLOK": dict(arrival="Ironvale rewards people who can build and repair real things. It also has a long memory for injuries people accepted in the name of output. Good wages are not a substitute for a safe machine.", friend="Orders are up. So are the hours. I want enough demand to justify the new workshop, not enough that somebody decides inspections are optional.", rival="Management notices the person who promises the number and hits it. I am done waiting for someone else to decide I am ready to run production.", gate="Industrial security means nothing if the workforce that creates it is treated as consumable. Pressure is exactly when safety rules are tested.", forum="Dravenlok supplies steel, rail equipment, machinery, vehicles, and heavy construction. Meridian can restart an industrial boom—and make output politically strategic."),
    "SYNDALIS": dict(arrival="In Glassline, access can disappear because one system decided your identity looked unusual. Keep copies. Use appeals. Convenience is not the same thing as due process.", friend="I spent all day helping legitimate users get out of an automated lock. The model is working according to the dashboard. That is the problem.", rival="Scale matters. Security that waits for every appeal is not security. Build the system people need first; refine the process after it is reliable.", gate="Emergency access is powerful precisely because it works. The question is who can use it, who can challenge it, and whether temporary privileges ever really disappear.", forum="Syndalis supplies cybersecurity, payment verification, data infrastructure, and emergency network access. Meridian makes those systems critical infrastructure instead of background plumbing."),
}

POSTURE = [
    {"choiceKey": "stability-first", "label": "Build stability first", "description": "Protect cash, documents, and predictable income before taking larger risks."},
    {"choiceKey": "advancement-first", "label": "Push for advancement", "description": "Prioritize a stronger role, credential, or promotion while demand is high."},
    {"choiceKey": "enterprise-first", "label": "Build something of your own", "description": "Use the opening to pursue a business or independent commercial path."},
    {"choiceKey": "market-research-first", "label": "Study the market first", "description": "Preserve flexibility while you learn where capital and demand are moving."},
]
FRICTION = [
    {"choiceKey": "follow-process", "label": "Follow the process", "description": "Accept delay or cost to preserve documentation and formal safeguards."},
    {"choiceKey": "move-fast", "label": "Move quickly", "description": "Use the fastest legitimate route and accept more execution risk."},
    {"choiceKey": "help-community", "label": "Help someone else first", "description": "Spend time or money reducing the burden on another newcomer or local contact."},
    {"choiceKey": "protect-cash", "label": "Protect your cash", "description": "Avoid taking on another person’s cost while your own position is still fragile."},
]
RIVAL = [
    {"choiceKey": "help-rival", "label": "Help them", "description": "Share useful access or information even though they may compete with you later."},
    {"choiceKey": "compete-directly", "label": "Compete directly", "description": "Keep your advantage and make it clear you intend to win the same opportunity."},
    {"choiceKey": "keep-distance", "label": "Keep your distance", "description": "Avoid a favor or rivalry and protect your independence."},
]
PATH = [
    {"choiceKey": "specialize", "label": "Specialize now", "description": "Commit to the strongest local opportunity and accept concentrated exposure."},
    {"choiceKey": "diversify", "label": "Stay diversified", "description": "Spread your work or capital across several opportunities."},
    {"choiceKey": "public-interest", "label": "Choose public-interest work", "description": "Prioritize resilience, community, oversight, or essential services over maximum upside."},
    {"choiceKey": "stay-flexible", "label": "Stay flexible", "description": "Delay commitment and keep liquidity and mobility for later information."},
]


def country_condition(code: str) -> dict:
    return {"type": "player_current_country_is", "countryCode": code}


def choice_condition(interaction: str, choice: str) -> dict:
    return {"type": "player_story_choice_is", "interactionKey": interaction, "choiceKey": choice}


def message(role: str, code: str, day: int, purpose: str, body: str, *, prompt: str | None = None, options: list[dict] | None = None, duration_days: int = 3, default: str | None = None, interaction_slug: str | None = None) -> dict:
    key, name = COUNTRIES[code][role]
    effect = {"type": "character_message", "characterKey": key, "characterName": name, "interactionKey": None, "messagePurpose": purpose, "body": body}
    if prompt is not None:
        interaction = f"interaction.story.{COUNTRIES[code]['slug']}.d{day:03d}.{interaction_slug or role}.v1"
        effect["interactionKey"] = interaction
        effect["responseWindow"] = {"prompt": prompt, "options": options, "durationSeconds": duration_days * 86400, "defaultChoiceKey": default}
    return effect


def relationship(code: str, role: str, reason: str, **deltas: int) -> dict:
    key, _ = COUNTRIES[code][role]
    return {"type": "relationship_adjust", "characterKey": key, "reason": reason, "deltas": deltas}


def event(day: int, key: str, delivery: list[str], rules: list[dict], notes: str) -> dict:
    return {"day": day, "eventKey": key, "scheduledOffsetSeconds": (day - 1) * 86400, "delivery": delivery, "playerRules": rules, "notes": notes}


def build_events() -> list[dict]:
    events: list[dict] = []
    rules = [{"ruleKey": f"{COUNTRIES[c]['slug']}.arrival", "condition": country_condition(c), "effects": [message("sponsor", c, 1, "briefing", COPY[c]["arrival"])]} for c in COUNTRIES]
    events.append(event(1, "event.campaign.d001.arrival.v1", ["INBOX"], rules, "Country-specific sponsor welcome. No global politics dump."))

    rules = []
    for c in COUNTRIES:
        body = "You do not need to solve your whole future this week. You do need to decide what you are protecting first while the opening is still favorable."
        rules.append({"ruleKey": f"{COUNTRIES[c]['slug']}.first-posture", "condition": country_condition(c), "effects": [message("sponsor", c, 7, "request", body, prompt="What do you want to build first?", options=POSTURE, duration_days=3, default="stability-first", interaction_slug="arrival")]})
    events.append(event(7, "event.campaign.d007.first-economic-posture.v1", ["INBOX", "CHOICE"], rules, "First canonical personal choice; closes before Day 11 callback."))

    rules = [{"ruleKey": f"{COUNTRIES[c]['slug']}.friend-truth", "condition": country_condition(c), "effects": [message("friend", c, 9, "relationship", COPY[c]["friend"])]} for c in COUNTRIES]
    events.append(event(9, "event.campaign.d009.local-friend-truth.v1", ["INBOX"], rules, "Local friend shows ordinary economic reality."))

    rules = []
    for c in COUNTRIES:
        s = COUNTRIES[c]["slug"]
        interaction = f"interaction.story.{s}.d007.arrival.v1"
        mapping = {
            "stability-first": relationship(c, "sponsor", "You treated early stability and documentation as assets.", trust=8, respect=2),
            "advancement-first": relationship(c, "sponsor", "You used the boom to pursue a stronger position.", respect=8, trust=2),
            "enterprise-first": relationship(c, "sponsor", "You chose independence before your position was fully secure.", respect=6, suspicion=2),
            "market-research-first": relationship(c, "sponsor", "You preserved flexibility and asked for evidence before committing.", respect=5, trust=2),
        }
        for choice, effect in mapping.items():
            rules.append({"ruleKey": f"{s}.posture.{choice}", "condition": choice_condition(interaction, choice), "effects": [effect]})
    events.append(event(11, "event.campaign.d011.first-posture-callback.v1", ["SYSTEM"], rules, "S4 callback turns Day 7 choice into durable sponsor relationship state."))

    rules = []
    for c in COUNTRIES:
        body = "A small problem has become expensive enough that somebody wants you to absorb the cost. There is no perfect answer; choose which constraint matters most."
        rules.append({"ruleKey": f"{COUNTRIES[c]['slug']}.stabilization-friction", "condition": country_condition(c), "effects": [message("friend", c, 13, "request", body, prompt="How will you handle the first real friction?", options=FRICTION, duration_days=2, default="follow-process", interaction_slug="stabilization")]})
    events.append(event(13, "event.campaign.d013.stabilization-friction.v1", ["INBOX", "CHOICE"], rules, "Minor choice around process, speed, community, and liquidity."))

    rules = []
    for c in COUNTRIES:
        s = COUNTRIES[c]["slug"]
        interaction = f"interaction.story.{s}.d013.stabilization.v1"
        mapping = {
            "follow-process": relationship(c, "friend", "You accepted friction rather than pushing risk onto someone else.", trust=6, respect=3),
            "move-fast": relationship(c, "friend", "You chose speed and accepted more execution risk.", respect=3, suspicion=3),
            "help-community": relationship(c, "friend", "You spent scarce time or money helping someone else absorb the boom.", trust=8, affinity=8, obligation=3),
            "protect-cash": relationship(c, "friend", "You protected your own runway instead of taking on another obligation.", respect=2, affinity=-2),
        }
        for choice, effect in mapping.items():
            rules.append({"ruleKey": f"{s}.friction.{choice}", "condition": choice_condition(interaction, choice), "effects": [effect]})
    events.append(event(16, "event.campaign.d016.stabilization-callback.v1", ["SYSTEM"], rules, "S4 callback resolves Day 13 choice without a forced message."))

    rules = [{"ruleKey": f"{COUNTRIES[c]['slug']}.rival-intro", "condition": country_condition(c), "effects": [message("rival", c, 17, "relationship", COPY[c]["rival"])]} for c in COUNTRIES]
    events.append(event(17, "event.campaign.d017.rival-introduction.v1", ["INBOX"], rules, "Rival presents a credible competing philosophy of success."))

    rules = []
    for c in COUNTRIES:
        body = "I found an opening that overlaps with what you are doing. I am not asking you to step aside. I am asking whether we are treating each other as useful contacts or direct competitors."
        rules.append({"ruleKey": f"{COUNTRIES[c]['slug']}.rival-posture", "condition": country_condition(c), "effects": [message("rival", c, 20, "request", body, prompt="How do you treat your rival while the boom is still young?", options=RIVAL, duration_days=1, default="keep-distance", interaction_slug="people")]})
    events.append(event(20, "event.campaign.d020.rival-choice.v1", ["INBOX", "CHOICE"], rules, "Creates rival relationship state that can return during volatility and war."))

    rules = []
    for c in COUNTRIES:
        s = COUNTRIES[c]["slug"]
        interaction = f"interaction.story.{s}.d020.people.v1"
        mapping = {
            "help-rival": relationship(c, "rival", "You shared useful access even though this person may compete with you later.", trust=9, obligation=9, affinity=3),
            "compete-directly": relationship(c, "rival", "You made the competition explicit and protected your own advantage.", respect=8, suspicion=4),
            "keep-distance": relationship(c, "rival", "You refused both a favor and a fight, preserving independence.", trust=-1, respect=2),
        }
        for choice, effect in mapping.items():
            rules.append({"ruleKey": f"{s}.rival.{choice}", "condition": choice_condition(interaction, choice), "effects": [effect]})
    events.append(event(21, "event.campaign.d021.rival-choice-callback.v1", ["SYSTEM"], rules, "Immediate relationship callback; later acts use the same relationship."))

    rules = [{"ruleKey": f"{COUNTRIES[c]['slug']}.gatekeeper-warning", "condition": country_condition(c), "effects": [message("gatekeeper", c, 22, "warning", COPY[c]["gate"])]} for c in COUNTRIES]
    events.append(event(22, "event.campaign.d022.gatekeeper-warning.v1", ["INBOX"], rules, "Introduces accountability voice before first material path decision."))

    rules = []
    for c in COUNTRIES:
        body = f"The opportunity is becoming real enough that staying completely uncommitted now has a cost. In {COUNTRIES[c]['angle']}, each path creates a different dependency."
        rules.append({"ruleKey": f"{COUNTRIES[c]['slug']}.path-commitment", "condition": country_condition(c), "effects": [message("sponsor", c, 26, "offer", body, prompt="How do you position yourself before the Meridian decision reaches the market?", options=PATH, duration_days=2, default="stay-flexible", interaction_slug="choose-a-path")]})
    events.append(event(26, "event.campaign.d026.path-commitment.v1", ["INBOX", "CHOICE"], rules, "Major Act I economic posture; callbacks affect institutional reaction after Forum announcement."))

    rules = []
    for c in COUNTRIES:
        s = COUNTRIES[c]["slug"]
        interaction = f"interaction.story.{s}.d026.choose-a-path.v1"
        mapping = {
            "specialize": [relationship(c, "sponsor", "You committed early to the adopted country’s strongest opportunity.", respect=7), relationship(c, "gatekeeper", "Your concentrated path increases both local commitment and exposure.", respect=3, suspicion=2)],
            "diversify": [relationship(c, "sponsor", "You kept several sources of income or exposure instead of betting on one boom story.", trust=4, respect=4)],
            "public-interest": [relationship(c, "gatekeeper", "You chose resilience or public-interest work over maximum short-term upside.", trust=6, respect=8)],
            "stay-flexible": [relationship(c, "sponsor", "You preserved liquidity and mobility while waiting for better information.", respect=3)],
        }
        for choice, effects in mapping.items():
            rules.append({"ruleKey": f"{s}.path.{choice}", "condition": choice_condition(interaction, choice), "effects": effects})
    events.append(event(28, "event.campaign.d028.path-commitment-callback.v1", ["SYSTEM"], rules, "Quiet callback before global Forum announcement."))

    events.append(event(29, "event.meridian.forum-announced.v1", ["INTERRUPT", "NEWS", "SYSTEM"], [], "First global cinematic beat. News/cutscene/system assets are authored separately; hidden truth remains hidden."))

    rules = []
    for c in COUNTRIES:
        lead_key, lead_name = COUNTRIES[c]["lead"]
        rules.append({"ruleKey": f"{COUNTRIES[c]['slug']}.forum-reaction", "condition": country_condition(c), "effects": [{"type": "character_message", "characterKey": lead_key, "characterName": lead_name, "interactionKey": None, "messagePurpose": "briefing", "body": COPY[c]["forum"]}]})
    events.append(event(31, "event.campaign.d031.country-forum-reaction.v1", ["INBOX"], rules, "Institutional lead explains the Corridor through adopted-country comparative advantage and risk."))
    return events


def build_news() -> list[dict]:
    news: list[dict] = []
    def add(day: int, key: str, scope: str, title: str, summary: str, country: str | None = None, status: str = "confirmed fact") -> None:
        news.append({"day": day, "newsKey": key, "scope": scope, "countryCode": country, "epistemicStatus": status, "title": title, "summary": summary})
    def country_pack(day: int, slug: str, title: str, prefix: str) -> None:
        for code, cfg in COUNTRIES.items():
            add(day, f"news.country.{cfg['slug']}.d{day:03d}.{slug}.v1", "country", title, f"{prefix} In {code.title()}, the immediate lens is {cfg['angle']}.", code)
    country_pack(3, "arrival", "Newcomer demand reshapes local services", "Arrival demand is expanding services while exposing a practical local inequality.")
    add(6, "news.campaign.d006.arrival.v1", "global", "Opportunity expands as growth slows", "CEE100 opens with positive but slowing growth, moderate inflation pressure, strong infrastructure demand, and active migration.")
    add(8, "news.campaign.d008.stabilization.v1", "global", "Hiring and housing pressures rise together", "Employers compete for labor while rents, transport, and service capacity tighten in fast-growing districts.")
    country_pack(12, "stabilization", "First administrative friction reaches newcomers", "Documents, credentials, permits, worker safety, housing, or account access are becoming the first meaningful friction for newcomers.")
    country_pack(15, "people", "Institutions publish sector readiness notices", "Institutions are publishing practical readiness notices for sectors likely to encounter Meridian-linked demand.")
    add(16, "news.campaign.d016.people.v1", "global", "Meridian feasibility work draws wider attention", "The Corridor remains a background opportunity story rather than a crisis or finalized agreement.")
    add(24, "news.campaign.d024.choose-a-path.v1", "global", "Preliminary Meridian work pulls in talent and capital", "Business press reports rising investment, hiring, and subcontracting expectations across the ten economies.")
    country_pack(27, "choose-a-path", "Country opportunity paths become clearer", "Career, enterprise, investment, and public-interest paths are becoming more concrete as preliminary work expands.")
    add(29, "news.meridian.forum-announced.v1", "global", "Starfall Meridian Forum announces CEE100 Corridor session", "The first formal shared session will evaluate financing, governance, logistics, industrial security, technology, food-energy resilience, and emergency continuity.")
    country_pack(29, "meridian-forum-announced", "Countries define their first Meridian priorities", "The Forum announcement is producing different priorities, dependencies, and safeguards across the ten economies.")
    return news


def build_contracts() -> list[dict]:
    values: list[dict] = []
    def add(day: int, slug: str, purpose: str) -> None:
        for code, cfg in COUNTRIES.items():
            values.append({"day": day, "contractKey": f"contract.story.{cfg['slug']}.d{day:03d}.{slug}.v1", "countryCode": code, "bindingStatus": "PLANNED_BINDING", "purpose": f"{purpose} Country context: {cfg['angle']}."})
    add(4, "arrival", "First low-risk job, training, or small-business lead by adopted country.")
    add(14, "stabilization", "Low-stakes path Contract after first stabilization friction.")
    add(19, "people", "Introduction to a gatekeeper or institutional contact.")
    add(23, "choose-a-path", "First material economic opportunity with a visible trade-off.")
    return values


def build_systems() -> list[dict]:
    return [
        {"day": 2, "bindingKey": "system.story.d002.arrival-baseline.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Local checking, ordinary expenses, housing, transport, Store access; no crisis restrictions."},
        {"day": 10, "bindingKey": "system.story.d010.recurring-expenses.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Recurring expenses make liquidity and savings discipline visible."},
        {"day": 18, "bindingKey": "system.story.d018.infrastructure-sector-rotation.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Mild infrastructure-linked market rotation without a global shock."},
        {"day": 25, "bindingKey": "system.story.d025.meridian-precontract-demand.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Uneven housing, service, and sector hiring gains."},
        {"day": 30, "bindingKey": "system.story.d030.forum-market-reaction.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Uneven positive market reaction across Meridian-linked sectors after the Forum announcement."},
    ]


def main() -> None:
    pack = {
        "packId": "story.content.act1.august.v1",
        "version": "1.0.0",
        "campaign": "CEE100",
        "days": {"start": 1, "end": 31},
        "runtimeRule": "Authoring dates are reference-only. Seed adapter must use elapsed-time or another authoritative supported trigger.",
        "countries": [{"countryCode": code, "slug": cfg["slug"], "sponsorKey": cfg["sponsor"][0], "friendKey": cfg["friend"][0], "rivalKey": cfg["rival"][0], "gatekeeperKey": cfg["gatekeeper"][0], "institutionalLeadKey": cfg["lead"][0]} for code, cfg in COUNTRIES.items()],
        "storyEvents": build_events(),
        "news": build_news(),
        "contractPlans": build_contracts(),
        "systemBindingPlans": build_systems(),
        "noForcedInterruptionDays": [5, 11, 21, 28],
        "acceptance": {"countryCount": 10, "requiredChoiceDays": [7, 13, 20, 26], "requiredCallbackDays": [11, 16, 21, 28], "forumAnnouncementDay": 29, "prohibitUuidShapedPublicKeys": True, "requireEveryChoiceCallback": True},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
