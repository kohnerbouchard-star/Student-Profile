from __future__ import annotations

import json
import runpy
from pathlib import Path

aug = runpy.run_path("scripts/story-content/build-act1-august-pack.py")
COUNTRIES = aug["COUNTRIES"]
country_condition = aug["country_condition"]
choice_condition = aug["choice_condition"]
message = aug["message"]
relationship = aug["relationship"]
event = aug["event"]

OUT = Path("docs/seed-content/story/content/act2-september-content-pack-v1.json")

FOCUS = [
    {"choiceKey": "track-capacity", "label": "Track capacity", "description": "Focus on ports, labor, equipment, utilities, and whether the boom can physically scale."},
    {"choiceKey": "track-governance", "label": "Track governance", "description": "Focus on who controls the project, how decisions are reviewed, and what emergency authority exists."},
    {"choiceKey": "track-markets", "label": "Track markets", "description": "Focus on financing, listed firms, sector exposure, and where expectations may exceed reality."},
    {"choiceKey": "track-people", "label": "Track people", "description": "Focus on housing, migration, wages, safety, access, and who bears the boom’s first costs."},
]
BOOM = [
    {"choiceKey": "take-fast-upside", "label": "Take the fast upside", "description": "Accept more work or exposure while demand is strongest."},
    {"choiceKey": "negotiate-safeguards", "label": "Negotiate safeguards", "description": "Take the opportunity only with clearer pay, documentation, safety, or exit terms."},
    {"choiceKey": "build-buffer", "label": "Build a buffer", "description": "Use stronger income to increase cash or resilience instead of scaling immediately."},
    {"choiceKey": "decline-overexposure", "label": "Decline overexposure", "description": "Protect time, mobility, or diversification rather than chasing the boom."},
]
RECOMMEND = [
    {"choiceKey": "prioritize-speed", "label": "Prioritize speed", "description": "Accept more concentrated authority and execution risk to capture the current opportunity."},
    {"choiceKey": "prioritize-resilience", "label": "Prioritize resilience", "description": "Favor redundancy, spare capacity, and slower implementation that can absorb shocks."},
    {"choiceKey": "prioritize-shared-oversight", "label": "Prioritize shared oversight", "description": "Favor transparent review and distributed governance even when coordination takes longer."},
    {"choiceKey": "prioritize-local-control", "label": "Prioritize local control", "description": "Keep more authority in countries and existing institutions even at a higher transaction cost."},
]
OPPORTUNITY = [
    {"choiceKey": "concentrate-upside", "label": "Concentrate on the strongest opportunity", "description": "Put more work or capital behind the adopted country’s expansion."},
    {"choiceKey": "hedge-exposure", "label": "Hedge the expansion", "description": "Participate while keeping cash, diversification, or substitute suppliers."},
    {"choiceKey": "public-interest-path", "label": "Take the public-interest path", "description": "Use the expansion to strengthen access, safety, resilience, or community capacity."},
    {"choiceKey": "wait-for-data", "label": "Wait for better data", "description": "Avoid adding exposure until costs and bottlenecks are clearer."},
]
COST = [
    {"choiceKey": "absorb-cost", "label": "Absorb the cost", "description": "Protect customers, workers, or relationships at the expense of your own margin or cash."},
    {"choiceKey": "pass-through-cost", "label": "Pass the cost through", "description": "Protect your own margin by charging more or reducing what you provide."},
    {"choiceKey": "improve-efficiency", "label": "Find an efficiency", "description": "Spend time or capital reducing the underlying cost rather than shifting it."},
    {"choiceKey": "target-help", "label": "Help the most exposed", "description": "Accept selective support instead of trying to protect everyone equally."},
]


def lead_copy(code: str) -> str:
    cfg = COUNTRIES[code]
    return f"The Forum announcement is no longer abstract. For {cfg['angle']}, what you choose to watch now will determine which risks you notice before they become expensive."


def friend_copy(code: str) -> str:
    cfg = COUNTRIES[code]
    return f"The boom is real enough that people are changing plans around it. In {cfg['angle']}, the upside is showing up next to longer hours, tighter capacity, or higher living costs."


def rival_copy(code: str) -> str:
    cfg = COUNTRIES[code]
    return f"There is an obvious way to make money from {cfg['angle']} right now. The argument against it is mostly that the easy trade can become a crowded one. I would rather be early than comfortable."


def sponsor_copy(code: str) -> str:
    cfg = COUNTRIES[code]
    return f"The boom is beginning to cost people something. In {cfg['angle']}, you can protect your own position, pass the burden onward, or spend resources fixing part of the problem. None of those choices is free."


def add_callbacks(events: list[dict], day: int, source_day: int, interaction_slug: str, options: list[dict], role: str, reason_prefix: str) -> None:
    rules = []
    for code, cfg in COUNTRIES.items():
        interaction = f"interaction.story.{cfg['slug']}.d{source_day:03d}.{interaction_slug}.v1"
        for index, option in enumerate(options):
            choice = option["choiceKey"]
            delta = 4 + index
            effect = relationship(code, role, f"{reason_prefix} Your earlier choice was {option['label'].lower()}.", respect=delta)
            if choice in {"track-people", "negotiate-safeguards", "public-interest-path", "target-help"}:
                effect = relationship(code, role, f"{reason_prefix} Your earlier choice was {option['label'].lower()}.", trust=6, respect=5)
            if choice in {"take-fast-upside", "concentrate-upside", "pass-through-cost", "prioritize-speed"}:
                effect = relationship(code, role, f"{reason_prefix} Your earlier choice was {option['label'].lower()}.", respect=5, suspicion=2)
            rules.append({"ruleKey": f"{cfg['slug']}.d{day:03d}.{choice}", "condition": choice_condition(interaction, choice), "effects": [effect]})
    events.append(event(day, f"event.campaign.d{day:03d}.{interaction_slug}-callback.v1", ["SYSTEM"], rules, f"S4 callback for Day {source_day} {interaction_slug} choice."))


def build_events() -> list[dict]:
    events: list[dict] = []

    rules = []
    for code, cfg in COUNTRIES.items():
        rules.append({"ruleKey": f"{cfg['slug']}.forum-focus", "condition": country_condition(code), "effects": [message("lead", code, 33, "briefing", lead_copy(code), prompt="What part of the Meridian opportunity will you watch most closely?", options=FOCUS, duration_days=1, default="track-capacity", interaction_slug="meridian-focus")]})
    events.append(event(33, "event.campaign.d033.meridian-focus.v1", ["INBOX", "CHOICE"], rules, "First post-Forum analytical posture."))
    add_callbacks(events, 35, 33, "meridian-focus", FOCUS, "lead", "Your first Meridian briefing established what you treated as material.")

    rules = [{"ruleKey": f"{cfg['slug']}.boom-friend", "condition": country_condition(code), "effects": [message("friend", code, 38, "relationship", friend_copy(code))]} for code, cfg in COUNTRIES.items()]
    events.append(event(38, "event.campaign.d038.hiring-boom-friend.v1", ["INBOX"], rules, "Personalizes boom gains and first capacity costs."))

    rules = []
    for code, cfg in COUNTRIES.items():
        body = f"A stronger offer just appeared around {cfg['angle']}. The money is better because the exposure is higher."
        rules.append({"ruleKey": f"{cfg['slug']}.boom-exposure", "condition": country_condition(code), "effects": [message("friend", code, 42, "offer", body, prompt="How do you respond to the boom offer?", options=BOOM, duration_days=1, default="build-buffer", interaction_slug="hiring-boom")]})
    events.append(event(42, "event.campaign.d042.hiring-boom-choice.v1", ["INBOX", "CHOICE"], rules, "Creates winter exposure/resilience callback state."))

    rules = []
    for code, cfg in COUNTRIES.items():
        lead_effect = message("lead", code, 44, "briefing", f"The Forum is asking for evidence, not enthusiasm. In {cfg['angle']}, the strongest proposal is the one that names both the gain and the dependency it creates.")
        interaction = f"interaction.story.{cfg['slug']}.d042.hiring-boom.v1"
        rules.append({"ruleKey": f"{cfg['slug']}.evaluation-briefing", "condition": country_condition(code), "effects": [lead_effect]})
        for option in BOOM:
            rules.append({"ruleKey": f"{cfg['slug']}.boom.{option['choiceKey']}", "condition": choice_condition(interaction, option["choiceKey"]), "effects": [relationship(code, "friend", "Your boom decision changed how your local friend reads your appetite for risk.", trust=5 if option["choiceKey"] in {"negotiate-safeguards", "build-buffer"} else 1, respect=5)]})
    events.append(event(44, "event.campaign.d044.evaluate-corridor-briefing.v1", ["INBOX", "SYSTEM"], rules, "Institutional briefing plus Day 42 relationship callback."))

    rules = []
    for code, cfg in COUNTRIES.items():
        body = f"You have enough information now to make a real recommendation about {cfg['angle']}. The trade-off is not whether Meridian is good or bad; it is which failure you are most willing to risk."
        rules.append({"ruleKey": f"{cfg['slug']}.corridor-recommendation", "condition": country_condition(code), "effects": [message("lead", code, 48, "request", body, prompt="What should Meridian prioritize first?", options=RECOMMEND, duration_days=1, default="prioritize-resilience", interaction_slug="corridor-recommendation")]})
    events.append(event(48, "event.campaign.d048.corridor-recommendation.v1", ["INBOX", "CHOICE"], rules, "Records first meaningful governance recommendation."))
    add_callbacks(events, 49, 48, "corridor-recommendation", RECOMMEND, "lead", "Your Corridor recommendation became part of your institutional record.")

    rules = [{"ruleKey": f"{cfg['slug']}.opportunity-rival", "condition": country_condition(code), "effects": [message("rival", code, 50, "offer", rival_copy(code))]} for code, cfg in COUNTRIES.items()]
    events.append(event(50, "event.campaign.d050.country-opportunity-rival.v1", ["INBOX"], rules, "Rival frames the easiest upside and underweights its externality."))

    rules = []
    for code, cfg in COUNTRIES.items():
        body = f"The expansion around {cfg['angle']} is strong enough now that doing nothing is also a position."
        rules.append({"ruleKey": f"{cfg['slug']}.country-opportunity-choice", "condition": country_condition(code), "effects": [message("rival", code, 56, "request", body, prompt="How do you position yourself around the country expansion?", options=OPPORTUNITY, duration_days=1, default="hedge-exposure", interaction_slug="country-opportunity")]})
    events.append(event(56, "event.campaign.d056.country-opportunity-choice.v1", ["INBOX", "CHOICE"], rules, "Creates country-specific exposure and relationship posture."))
    add_callbacks(events, 57, 56, "country-opportunity", OPPORTUNITY, "rival", "Your rival noticed how you handled the country's strongest opportunity.")

    rules = [{"ruleKey": f"{cfg['slug']}.boom-cost-sponsor", "condition": country_condition(code), "effects": [message("sponsor", code, 59, "warning", sponsor_copy(code))]} for code, cfg in COUNTRIES.items()]
    events.append(event(59, "event.campaign.d059.boom-cost-sponsor.v1", ["INBOX"], rules, "Sponsor turns boom costs into a personal/local problem."))

    rules = []
    for code, cfg in COUNTRIES.items():
        body = f"The cost pressure around {cfg['angle']} has reached someone who cannot simply wait it out."
        rules.append({"ruleKey": f"{cfg['slug']}.boom-cost-choice", "condition": country_condition(code), "effects": [message("sponsor", code, 61, "request", body, prompt="Who should absorb the boom cost?", options=COST, duration_days=2, default="improve-efficiency", interaction_slug="boom-costs")]})
    events.append(event(61, "event.campaign.d061.boom-cost-choice.v1", ["INBOX", "CHOICE"], rules, "Cross-month choice; closes before Day 64 competing-model callback."))
    return events


def build_news() -> list[dict]:
    news: list[dict] = []
    def add(day: int, key: str, scope: str, title: str, summary: str, country: str | None = None, status: str = "confirmed fact") -> None:
        news.append({"day": day, "newsKey": key, "scope": scope, "countryCode": country, "epistemicStatus": status, "title": title, "summary": summary})
    def country_pack(day: int, slug: str, title: str, prefix: str) -> None:
        for code, cfg in COUNTRIES.items():
            add(day, f"news.country.{cfg['slug']}.d{day:03d}.{slug}.v1", "country", title, f"{prefix} In {code.title()}, the immediate lens is {cfg['angle']}.", code)
    country_pack(32, "meridian-priorities", "Countries define first Meridian priorities", "The Forum announcement is becoming a concrete country-level opportunity and dependency debate.")
    country_pack(37, "hiring-boom", "Hiring boom strains local capacity", "The strongest local sector is expanding work while increasing pressure on housing, labor, permits, equipment, or services.")
    add(39, "news.campaign.d039.hiring-boom.v1", "global", "Meridian hiring broadens across the ten economies", "Recruitment, subcontracting, migration inflows, and capital commitments are expanding, with the largest wage gains in genuine shortage sectors.")
    add(43, "news.campaign.d043.evaluate-the-corridor.v1", "global", "Forum releases comparable Corridor assumptions", "The evaluation package asks institutions to compare capacity, governance, risk, financing, and cross-border dependency instead of ranking countries on one metric.")
    country_pack(45, "corridor-evaluation", "Country briefings map foreign dependencies", "Each country contribution depends on at least two external systems, making the Corridor an interdependence project rather than ten separate projects.")
    add(51, "news.campaign.d051.country-opportunity.v1", "global", "Countries accelerate Meridian-linked expansion", "Expansion plans remain broadly constructive, but the pattern of gains differs across resources, logistics, repair, technology, food, water, finance, industry, and cyber infrastructure.")
    country_pack(54, "country-opportunity", "Country expansion plans reach operating stage", "Local institutions are translating Meridian expectations into actual hiring, investment, supplier, and infrastructure decisions.")
    add(57, "news.campaign.d057.boom-costs.v1", "global", "Boom costs move from anecdote to measurable pressure", "Rent, congestion, labor fatigue, permit delays, service bottlenecks, and imported equipment costs are rising fastest in areas receiving the most investment.")
    country_pack(60, "boom-costs", "Boom burdens differ by country", "The strongest local opportunity is now producing a visible cost for people or firms outside the headline growth sector.")
    return news


def build_contracts() -> list[dict]:
    values: list[dict] = []
    def add(day: int, slug: str, purpose: str) -> None:
        for code, cfg in COUNTRIES.items():
            values.append({"day": day, "contractKey": f"contract.story.{cfg['slug']}.d{day:03d}.{slug}.v1", "countryCode": code, "bindingStatus": "PLANNED_BINDING", "purpose": f"{purpose} Country context: {cfg['angle']}."})
    add(34, "meridian-evaluation-intro", "Introductory Meridian evaluation work after the Forum announcement.")
    add(40, "hiring-boom", "Country-specific boom job, supplier, or business opportunity.")
    add(46, "evaluate-corridor", "Evidence-based Corridor evaluation requiring gains, dependencies, and risks.")
    add(53, "country-development", "Country development work linked to the strongest local expansion.")
    return values


def build_systems() -> list[dict]:
    return [
        {"day": 36, "bindingKey": "system.story.d036.hiring-boom.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Selected shortage-sector wages and demand rise while rent/service costs begin following."},
        {"day": 47, "bindingKey": "system.story.d047.evaluation-market-separation.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Markets distinguish firms with credible Meridian exposure from speculative expectations."},
        {"day": 52, "bindingKey": "system.story.d052.country-opportunity.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Strongest sector per country receives demand/investment pressure with smaller complementary effects."},
        {"day": 58, "bindingKey": "system.story.d058.boom-cost-inflation.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Selective household/service inflation rises without a universal price multiplier."},
    ]


def build_deferred() -> list[dict]:
    values: list[dict] = []
    for code, cfg in COUNTRIES.items():
        interaction = f"interaction.story.{cfg['slug']}.d061.boom-costs.v1"
        for option in COST:
            values.append({
                "day": 64,
                "eventKey": "event.campaign.d064.boom-cost-callback.v1",
                "condition": choice_condition(interaction, option["choiceKey"]),
                "effectPlan": {"type": "relationship_adjust", "characterKey": cfg["sponsor"][0], "reason": f"October callback for September boom-cost choice {option['choiceKey']}."},
            })
    return values


def main() -> None:
    pack = {
        "packId": "story.content.act2.september.v1",
        "version": "1.0.0",
        "campaign": "CEE100",
        "days": {"start": 32, "end": 61},
        "runtimeRule": "Authoring dates are reference-only. Seed adapter must use elapsed-time or another authoritative supported trigger.",
        "countries": [{"countryCode": code, "slug": cfg["slug"], "sponsorKey": cfg["sponsor"][0], "friendKey": cfg["friend"][0], "rivalKey": cfg["rival"][0], "gatekeeperKey": cfg["gatekeeper"][0], "institutionalLeadKey": cfg["lead"][0]} for code, cfg in COUNTRIES.items()],
        "storyEvents": build_events(),
        "news": build_news(),
        "contractPlans": build_contracts(),
        "systemBindingPlans": build_systems(),
        "deferredCallbacks": build_deferred(),
        "noForcedInterruptionDays": [35, 41, 49, 55],
        "acceptance": {
            "countryCount": 10,
            "requiredChoiceDays": [33, 42, 48, 56, 61],
            "minimumCharacterMessagesPerCountry": 9,
            "minimumNewsRecords": 50,
            "expectedContractPlans": 40,
            "requireEveryChoiceCallback": True,
            "prohibitHiddenCanonTerms": True,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
