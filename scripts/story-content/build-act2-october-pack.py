from __future__ import annotations

import json
import runpy
from pathlib import Path

aug = runpy.run_path("scripts/story-content/build-act1-august-pack.py")
sep = runpy.run_path("scripts/story-content/build-act2-september-pack.py")
COUNTRIES = aug["COUNTRIES"]
country_condition = aug["country_condition"]
choice_condition = aug["choice_condition"]
message = aug["message"]
relationship = aug["relationship"]
event = aug["event"]
SEPTEMBER_COST = sep["COST"]

OUT = Path("docs/seed-content/story/content/act2-october-content-pack-v1.json")

FINANCE = [
    {"choiceKey": "rapid-finance", "label": "Back rapid finance", "description": "Use concentrated project finance to capture the boom before costs rise further."},
    {"choiceKey": "protective-covenants", "label": "Require protective covenants", "description": "Accept fast capital only with disclosure, leverage, relocation, or exit protections."},
    {"choiceKey": "distributed-ownership", "label": "Demand distributed ownership", "description": "Give up some execution speed to limit concentrated control."},
    {"choiceKey": "reject-finance-first", "label": "Reject finance-first control", "description": "Prefer another model even if that delays current investment."},
]
MULTILATERAL = [
    {"choiceKey": "broad-review", "label": "Support broad review", "description": "Use shared audit, appeals, and transparency across the whole Corridor."},
    {"choiceKey": "targeted-review", "label": "Use targeted review", "description": "Apply shared oversight only to the highest-risk ownership, security, and public-impact questions."},
    {"choiceKey": "speed-exceptions", "label": "Allow speed exceptions", "description": "Keep multilateral rules but let urgent projects bypass part of the process."},
    {"choiceKey": "country-first-review", "label": "Keep review national", "description": "Let each country retain primary audit authority and coordinate results afterward."},
]
TRADE = [
    {"choiceKey": "strict-primary-routing", "label": "Favor strict primary routing", "description": "Use tightly verified routes even when congestion or compliance cost rises."},
    {"choiceKey": "recognized-overflow", "label": "Recognize overflow routes", "description": "Pre-approve flexible alternate operators with common minimum safeguards."},
    {"choiceKey": "emergency-flexibility", "label": "Prioritize emergency flexibility", "description": "Permit faster temporary routing during disruptions and audit afterward."},
    {"choiceKey": "local-route-control", "label": "Keep route control local", "description": "Avoid a common routing authority and accept higher interoperability costs."},
]
INDUSTRIAL = [
    {"choiceKey": "maximize-domestic-capacity", "label": "Maximize domestic capacity", "description": "Build strategic supply even where it duplicates cheaper foreign capacity."},
    {"choiceKey": "target-critical-inputs", "label": "Target only critical inputs", "description": "Reserve industrial policy for the few dependencies whose failure would stop the system."},
    {"choiceKey": "shared-reserve-network", "label": "Build shared reserves", "description": "Keep interdependence but add common inventories, spare capacity, and emergency guarantees."},
    {"choiceKey": "market-led-resilience", "label": "Keep resilience market-led", "description": "Use pricing, insurance, and supplier diversification instead of large strategic guarantees."},
]


def add_callbacks(events: list[dict], day: int, source_day: int, slug: str, options: list[dict], role: str) -> None:
    rules = []
    for code, cfg in COUNTRIES.items():
        interaction = f"interaction.story.{cfg['slug']}.d{source_day:03d}.{slug}.v1"
        for option in options:
            choice = option["choiceKey"]
            deltas = {"respect": 5}
            if choice in {"protective-covenants", "broad-review", "recognized-overflow", "shared-reserve-network", "target-critical-inputs"}:
                deltas = {"trust": 4, "respect": 6}
            if choice in {"rapid-finance", "speed-exceptions", "emergency-flexibility", "maximize-domestic-capacity"}:
                deltas = {"respect": 5, "suspicion": 2}
            rules.append({"ruleKey": f"{cfg['slug']}.d{day:03d}.{choice}", "condition": choice_condition(interaction, choice), "effects": [relationship(code, role, f"Your recorded Meridian position was {option['label'].lower()}.", **deltas)]})
    events.append(event(day, f"event.campaign.d{day:03d}.{slug}-callback.v1", ["SYSTEM"], rules, f"S4 callback for Day {source_day} {slug} choice."))


def model_message(code: str, model: str) -> str:
    cfg = COUNTRIES[code]
    return f"The {model} model changes the trade-off for {cfg['angle']}. The useful question is not whether the proposal sounds ambitious; it is what authority, risk, and cost move with it."


def build_events() -> list[dict]:
    events: list[dict] = [event(64, "event.campaign.d064.competing-models-formal.v1", ["NEWS", "COUNTRY FEED"], [], "Formal competing-model anchor. September Day 61 callbacks are carried in incomingCallbackPlans for cross-pack seed reconciliation.")]
    callback_rules = []
    for code, cfg in COUNTRIES.items():
        interaction = f"interaction.story.{cfg['slug']}.d061.boom-costs.v1"
        for index, option in enumerate(SEPTEMBER_COST):
            choice = option["choiceKey"]
            effect = relationship(code, "sponsor", f"Your September boom-cost choice was {option['label'].lower()}.", respect=4 + index)
            if choice == "target-help":
                effect = relationship(code, "sponsor", f"Your September boom-cost choice was {option['label'].lower()}.", trust=6, respect=5)
            if choice == "pass-through-cost":
                effect = relationship(code, "sponsor", f"Your September boom-cost choice was {option['label'].lower()}.", respect=5, suspicion=2)
            callback_rules.append({"ruleKey": f"{cfg['slug']}.d064.boom-costs.{choice}", "condition": choice_condition(interaction, choice), "effects": [effect]})
    events.append(event(64, "event.campaign.d064.boom-cost-callback.v1", ["SYSTEM"], callback_rules, "Executable S4 callback for the September Day 61 boom-cost choice."))

    rules = [{"ruleKey": f"{cfg['slug']}.finance-brief", "condition": country_condition(code), "effects": [message("lead", code, 65, "briefing", model_message(code, "finance-first"))]} for code, cfg in COUNTRIES.items()]
    events.append(event(65, "event.campaign.d065.finance-first-briefing.v1", ["INBOX"], rules, "Country-specific interpretation of finance-first proposal."))

    rules = []
    for code, cfg in COUNTRIES.items():
        rules.append({"ruleKey": f"{cfg['slug']}.finance-choice", "condition": country_condition(code), "effects": [message("lead", code, 69, "request", "Xalvorian capital can accelerate real projects. The question is which protections must survive the urgency.", prompt="How should the finance-first proposal be constrained?", options=FINANCE, duration_days=1, default="protective-covenants", interaction_slug="finance-first")]})
    events.append(event(69, "event.campaign.d069.finance-first-choice.v1", ["INBOX", "CHOICE"], rules, "Records finance/ownership posture."))
    add_callbacks(events, 71, 69, "finance-first", FINANCE, "lead")

    rules = [{"ruleKey": f"{cfg['slug']}.multilateral-brief", "condition": country_condition(code), "effects": [message("gatekeeper", code, 73, "briefing", model_message(code, "multilateral oversight"))]} for code, cfg in COUNTRIES.items()]
    events.append(event(73, "event.campaign.d073.multilateral-briefing.v1", ["INBOX"], rules, "Evidence-focused multilateral model briefing."))

    rules = []
    for code, cfg in COUNTRIES.items():
        rules.append({"ruleKey": f"{cfg['slug']}.multilateral-choice", "condition": country_condition(code), "effects": [message("gatekeeper", code, 76, "request", "Shared oversight can protect people and still become slow enough that nobody owns the delay. Decide where the review authority should sit.", prompt="How much shared oversight should Meridian use?", options=MULTILATERAL, duration_days=1, default="targeted-review", interaction_slug="multilateral-model")]})
    events.append(event(76, "event.campaign.d076.multilateral-choice.v1", ["INBOX", "CHOICE"], rules, "Records oversight/due-process posture."))
    add_callbacks(events, 77, 76, "multilateral-model", MULTILATERAL, "gatekeeper")

    rules = [{"ruleKey": f"{cfg['slug']}.trade-brief", "condition": country_condition(code), "effects": [message("friend", code, 78, "briefing", model_message(code, "trade-and-logistics"))]} for code, cfg in COUNTRIES.items()]
    events.append(event(78, "event.campaign.d078.trade-logistics-briefing.v1", ["INBOX"], rules, "Personal/operator view of routing and recognition."))

    rules = []
    for code, cfg in COUNTRIES.items():
        rules.append({"ruleKey": f"{cfg['slug']}.trade-choice", "condition": country_condition(code), "effects": [message("friend", code, 82, "request", "A routing system can be safe by excluding uncertain operators or resilient by recognizing more of them before a disruption. Both decisions create risk.", prompt="How should Meridian balance verified routes and flexibility?", options=TRADE, duration_days=1, default="recognized-overflow", interaction_slug="trade-logistics-model")]})
    events.append(event(82, "event.campaign.d082.trade-logistics-choice.v1", ["INBOX", "CHOICE"], rules, "Records route/compliance posture."))
    add_callbacks(events, 84, 82, "trade-logistics-model", TRADE, "friend")

    rules = [{"ruleKey": f"{cfg['slug']}.industrial-brief", "condition": country_condition(code), "effects": [message("gatekeeper", code, 87, "warning", model_message(code, "industrial-security"))]} for code, cfg in COUNTRIES.items()]
    events.append(event(87, "event.campaign.d087.industrial-security-briefing.v1", ["INBOX"], rules, "Industrial resilience brief with labor/civilian cost lens."))

    rules = []
    for code, cfg in COUNTRIES.items():
        rules.append({"ruleKey": f"{cfg['slug']}.industrial-choice", "condition": country_condition(code), "effects": [message("gatekeeper", code, 89, "request", "Strategic capacity can prevent a future shortage and also lock money, labor, and materials into duplicated production. Choose what kind of resilience is worth paying for.", prompt="How much strategic capacity should Meridian build?", options=INDUSTRIAL, duration_days=1, default="target-critical-inputs", interaction_slug="industrial-security-model")]})
    events.append(event(89, "event.campaign.d089.industrial-security-choice.v1", ["INBOX", "CHOICE"], rules, "Records strategic-capacity posture."))
    add_callbacks(events, 91, 89, "industrial-security-model", INDUSTRIAL, "gatekeeper")
    return events


def build_news() -> list[dict]:
    news: list[dict] = []
    def add(day: int, key: str, scope: str, title: str, summary: str, country: str | None = None) -> None:
        news.append({"day": day, "newsKey": key, "scope": scope, "countryCode": country, "epistemicStatus": "confirmed fact", "title": title, "summary": summary})
    def country_pack(day: int, slug: str, title: str, prefix: str) -> None:
        for code, cfg in COUNTRIES.items():
            add(day, f"news.country.{cfg['slug']}.d{day:03d}.{slug}.v1", "country", title, f"{prefix} In {code.title()}, the core exposure is {cfg['angle']}.", code)
    add(64, "news.meridian.finance-first-model.v1", "global", "Competing Meridian governance models become formal", "Xalvoria advances a finance-first proposal while Forum participants prepare alternatives around oversight, routing, and strategic capacity.")
    country_pack(68, "finance-first-proposal", "Countries assess finance-first ownership trade-offs", "Rapid capital could accelerate construction while moving leverage and control across borders.")
    country_pack(71, "multilateral-transition", "Countries prepare for shared-oversight proposal", "The finance-first debate is now producing explicit demands for transparency, appeals, and national safeguards.")
    add(72, "news.campaign.d072.multilateral-proposal.v1", "global", "Lumenor outlines multilateral Meridian oversight", "The model emphasizes distributed review, transparency, appeals, and public records at the cost of slower coordination.")
    add(80, "news.campaign.d080.trade-and-logistics-proposal.v1", "global", "Yrethia and Thaloris outline complementary route models", "The proposal combines regulated primary routing with recognized overflow and emergency logistics rather than treating one route model as sufficient.")
    country_pack(83, "trade-and-logistics-proposal", "Route proposal exposes compliance and recognition costs", "Every country gains from faster recognized routing but faces different fraud, insurance, labor, or exclusion risks.")
    add(85, "news.campaign.d085.industrial-security-proposal.v1", "global", "Northreach and Dravenlok press strategic-capacity plan", "The proposal would guarantee selected minerals, energy, machinery, rail, and industrial capacity even where duplication raises costs.")
    country_pack(88, "industrial-security-proposal", "Countries map critical dependencies under security plan", "Each economy identifies which strategic input it would localize, reserve, or continue sourcing through shared capacity.")
    return news


def build_contracts() -> list[dict]:
    values: list[dict] = []
    def add(day: int, slug: str, purpose: str) -> None:
        for code, cfg in COUNTRIES.items():
            values.append({"day": day, "contractKey": f"contract.story.{cfg['slug']}.d{day:03d}.{slug}.v1", "countryCode": code, "bindingStatus": "PLANNED_BINDING", "purpose": f"{purpose} Country context: {cfg['angle']}."})
    add(62, "boom-cost-response", "Affordability, staffing, maintenance, or small-supplier response after September boom-cost pressure.")
    add(70, "finance-first-comparison", "Financing and governance comparison work after the finance-first choice.")
    add(75, "multilateral-review", "Governance, records, public-impact, or appeal review work.")
    add(79, "route-capacity", "Route, insurance, compliance, recognition, or emergency-capacity work.")
    add(90, "production-readiness", "Production readiness, resource security, reserve, or industrial-safety work.")
    return values


def build_systems() -> list[dict]:
    return [
        {"day": 66, "bindingKey": "system.story.d066.finance-first-market-reaction.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Construction/finance optimism rises while leverage- and sovereignty-sensitive exposures diverge."},
        {"day": 74, "bindingKey": "system.story.d074.multilateral-market-reaction.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Professional services/civic technology gain while speculative project timelines cool modestly."},
        {"day": 81, "bindingKey": "system.story.d081.trade-logistics-market-reaction.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Shipping, insurance, warehousing, repair, and trade-credit expectations shift by route credibility."},
        {"day": 86, "bindingKey": "system.story.d086.industrial-security-market-reaction.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Minerals, steel, machinery, energy, and rail suppliers gain while import-dependent firms see cost pressure."},
        {"day": 92, "bindingKey": "system.story.d092.boom-peak-consolidation.v1", "bindingStatus": "PLANNED_BINDING", "purpose": "Overextended boom names cool while firms with real contracts and capacity hold value."},
    ]


def incoming_callbacks() -> list[dict]:
    values: list[dict] = []
    for code, cfg in COUNTRIES.items():
        interaction = f"interaction.story.{cfg['slug']}.d061.boom-costs.v1"
        for option in SEPTEMBER_COST:
            values.append({"sourcePack": "story.content.act2.september.v1", "sourceDay": 61, "targetDay": 64, "eventKey": "event.campaign.d064.boom-cost-callback.v1", "condition": choice_condition(interaction, option["choiceKey"]), "effectPlan": {"type": "relationship_adjust", "characterKey": cfg["sponsor"][0], "reason": f"Carry September boom-cost choice {option['choiceKey']} into the competing-model phase."}})
    return values


def main() -> None:
    pack = {
        "packId": "story.content.act2.october.v1",
        "version": "1.0.0",
        "campaign": "CEE100",
        "days": {"start": 62, "end": 92},
        "runtimeRule": "Authoring dates are reference-only. Seed adapter must use elapsed-time or another authoritative supported trigger.",
        "countries": [{"countryCode": code, "slug": cfg["slug"], "sponsorKey": cfg["sponsor"][0], "friendKey": cfg["friend"][0], "rivalKey": cfg["rival"][0], "gatekeeperKey": cfg["gatekeeper"][0], "institutionalLeadKey": cfg["lead"][0]} for code, cfg in COUNTRIES.items()],
        "incomingCallbackPlans": incoming_callbacks(),
        "storyEvents": build_events(),
        "news": build_news(),
        "contractPlans": build_contracts(),
        "systemBindingPlans": build_systems(),
        "noForcedInterruptionDays": [63, 67, 77, 84, 91],
        "acceptance": {
            "countryCount": 10,
            "requiredChoiceDays": [69, 76, 82, 89],
            "minimumCharacterMessagesPerCountry": 8,
            "minimumNewsRecords": 40,
            "expectedContractPlans": 50,
            "requireEveryChoiceCallback": True,
            "prohibitHiddenCanonTerms": True,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
