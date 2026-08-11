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


def opts(*rows: tuple[str, str, str]) -> list[dict]:
    return [{"choiceKey": key, "label": label, "description": description} for key, label, description in rows]

RETURN = opts(
    ("double-down", "Double down", "Increase commitment to the path that has worked so far."),
    ("rebalance", "Rebalance", "Keep the gains but reduce concentrated exposure."),
    ("change-course", "Change course", "Move away from the earlier path before its costs increase."),
    ("protect-community", "Use the gains to protect others", "Spend some upside strengthening a relationship, workplace, or local buffer."),
)
CAPACITY = opts(
    ("prioritize-throughput", "Prioritize throughput", "Keep commerce moving even if maintenance and verification queues grow."),
    ("prioritize-maintenance", "Prioritize maintenance", "Accept slower movement to protect capacity and safety."),
    ("prioritize-rerouting", "Prioritize alternate routes", "Shift traffic before the main bottleneck worsens."),
    ("prioritize-rationing", "Ration scarce capacity", "Reserve the most constrained slots for essential or highest-value movement."),
)
SCARCITY = opts(
    ("profit-from-scarcity", "Take the scarcity trade", "Use prices and shortages as an investment or commercial opportunity."),
    ("hedge-scarcity", "Hedge the exposure", "Participate while preserving substitutes, cash, or diversification."),
    ("protect-operations", "Protect operations", "Use scarce supply to keep your own work or customers functioning."),
    ("protect-safeguards", "Protect workers and mobility", "Accept lower immediate upside to preserve labor, safety, or talent safeguards."),
)
RESERVES = opts(
    ("use-market-pricing", "Use market pricing", "Let higher prices ration demand and reward additional supply."),
    ("build-reserves", "Build reserves", "Hold inventory or capacity back against a worse future shortage."),
    ("target-support", "Target support", "Protect the most exposed households or essential users rather than everyone."),
    ("invest-capacity", "Invest in capacity", "Accept current cost to increase future supply or efficiency."),
)
REVIEW = opts(
    ("protect-due-process", "Protect due process", "Accept delay so reviews remain documented and appealable."),
    ("prioritize-speed", "Prioritize speed", "Resolve more cases quickly and accept more false-positive risk."),
    ("prioritize-loss-prevention", "Prioritize loss prevention", "Lock down uncertain activity until institutions can verify it."),
    ("create-human-appeal", "Create a human appeal path", "Spend capacity reviewing people harmed by automated or emergency decisions."),
)
PRODUCTION = opts(
    ("hit-output-target", "Hit the output target", "Accept tighter schedules and more execution risk to keep supply moving."),
    ("document-risk", "Document the risk first", "Preserve evidence and responsibility before taking the faster route."),
    ("slow-for-safety", "Slow down for safety", "Accept lower output to protect workers and quality."),
    ("invest-redundancy", "Invest in redundancy", "Spend more now on spare capacity, maintenance, or alternate suppliers."),
)
AFFORD = opts(
    ("targeted-relief", "Target relief", "Concentrate support on households or firms least able to absorb the increase."),
    ("broad-relief", "Use broad relief", "Spread support widely even if it is more expensive and less targeted."),
    ("market-ration", "Let prices ration demand", "Preserve fiscal/cash resources and rely on market signals."),
    ("direct-help", "Help directly", "Use your own money, inventory, or time to protect someone you know."),
)
STOCKPILE = opts(
    ("build-buffer", "Build a buffer", "Increase prudent inventory even though it ties up cash."),
    ("operate-normally", "Keep normal inventory", "Avoid adding pressure to the market and accept more future shortage risk."),
    ("resale-position", "Build a resale position", "Accumulate inventory expecting scarcity to raise its value."),
    ("community-reserve", "Build a shared reserve", "Coordinate inventory for a group, workplace, or community need."),
)
CALM = opts(
    ("reinvest", "Reinvest in the recovery", "Use the calmer period to expand work, business, or productive assets."),
    ("save-liquidity", "Build liquidity", "Use the calmer period to strengthen checking/savings and reduce exposure."),
    ("reconnect", "Rebuild relationships", "Spend time or resources on people and obligations crowded out by the boom."),
    ("stay-alert", "Stay cautious", "Preserve flexibility because the structural warnings are not resolved."),
)
EVIDENCE = opts(
    ("escalate-record", "Escalate the record", "Send the discrepancy into a formal investigation and preserve an audit trail."),
    ("resolve-locally", "Resolve it locally", "Fix the immediate commercial problem without widening the issue."),
    ("wait-more-evidence", "Wait for more evidence", "Avoid an accusation while preserving the records you already have."),
    ("share-privately", "Share it privately", "Give the evidence to a trusted institutional contact without public escalation."),
)
ACCESS = opts(
    ("centralized-access", "Centralized emergency access", "Use one common emergency authority for faster coordinated recovery."),
    ("federated-access", "Federated verification", "Keep authority distributed but make systems interoperable during emergencies."),
    ("manual-fallback", "Manual fallback", "Limit privileged digital access and accept slower human verification."),
    ("hybrid-expiring-access", "Hybrid access with expiry", "Allow temporary common access with strict scope, audit, and expiration."),
)
CRISIS = opts(
    ("protect-safety", "Protect immediate safety", "Prioritize people and essential needs before financial recovery."),
    ("protect-liquidity", "Protect liquidity", "Preserve cash, payments, and business continuity against a longer disruption."),
    ("help-someone", "Help someone exposed", "Use resources or access to protect another person or small organization."),
    ("preserve-evidence", "Preserve evidence", "Protect logs, records, and documentation that may matter later."),
)
OBLIGATION = opts(
    ("honor-local-obligation", "Honor the local obligation", "Prioritize the people and institutions around your adopted-country life."),
    ("honor-crossborder-obligation", "Honor the cross-border obligation", "Keep faith with a person, family, or commitment beyond the new restrictions."),
    ("split-obligation", "Split what you can", "Accept that neither side gets everything but preserve both relationships."),
    ("defer-obligation", "Defer the choice", "Protect your own position and postpone a commitment you may not be able to keep."),
)
CONNECTION = opts(
    ("sever-connection", "Sever the connection", "Reduce sanctions, security, or reputational exposure by ending the relationship."),
    ("disclose-connection", "Disclose it", "Keep the relationship but make the connection visible to the relevant authority."),
    ("preserve-connection", "Preserve it quietly", "Keep a legitimate relationship alive without drawing more attention to it."),
    ("reroute-connection", "Reroute it lawfully", "Use an authorized exception, intermediary, or substitute structure."),
)
WAR_POSTURE = opts(
    ("defensive-posture", "Defensive posture", "Protect liquidity, essentials, and existing commitments rather than expand."),
    ("opportunity-posture", "Opportunity posture", "Build into wartime demand and accept greater scrutiny and exposure."),
    ("public-service-posture", "Public-service posture", "Prioritize essential services, continuity, or community work."),
    ("investigation-posture", "Investigation posture", "Spend time preserving evidence and testing claims while others focus on trade."),
)
ALIGNMENT = opts(
    ("specialize-with-alignment", "Specialize inside the alignment", "Use the adopted country’s new partnerships to deepen one economic path."),
    ("bridge-alignments", "Stay a bridge", "Preserve lawful relationships across groupings even as scrutiny and costs rise."),
    ("neutral-service", "Provide neutral services", "Focus on repair, information, finance, or humanitarian work useful across alignments."),
    ("exit-exposure", "Exit exposed activity", "Reduce cross-border and political exposure even if it costs opportunity."),
)
DISPLACEMENT = opts(
    ("market-price-displacement", "Charge market prices", "Use strong demand to allocate scarce housing, goods, or services."),
    ("cap-or-help", "Cap prices or help directly", "Give up some margin to protect displaced people or local households."),
    ("redirect-resources", "Redirect resources", "Move supply from less urgent uses into receiving areas."),
    ("expand-capacity", "Expand capacity", "Invest in additional housing, transport, services, or inventory."),
)
DISCLOSURE = opts(
    ("publish-evidence", "Publish the evidence", "Put the material into the public record despite wartime consequences."),
    ("report-privately", "Report it privately", "Give investigators the material without making it an immediate public weapon."),
    ("wait-corroboration", "Wait for corroboration", "Preserve the evidence until a second source can support it."),
    ("use-as-leverage", "Use it as leverage", "Hold the material and use its value in a negotiation or protection strategy."),
)
WAR_SCALE = opts(
    ("scale-wartime", "Scale into wartime demand", "Expand production or services while the demand and margins are strongest."),
    ("scale-with-safeguards", "Scale with safeguards", "Expand only with explicit worker, pricing, compliance, or civilian protections."),
    ("limit-wartime-exposure", "Limit wartime exposure", "Keep the business or portfolio from becoming dependent on conflict."),
    ("essential-service", "Prioritize essential service", "Use capacity for repair, food, energy, payments, logistics, or community continuity."),
)
FOOD_ALLOC = opts(
    ("release-reserves", "Release reserves", "Use stored food, energy, or capacity now to reduce immediate hardship."),
    ("price-rationing", "Use price rationing", "Preserve reserves and let higher prices suppress nonessential demand."),
    ("target-essential-users", "Target essential users", "Prioritize vulnerable households and critical services."),
    ("invest-emergency-capacity", "Invest in emergency capacity", "Accept high current cost to increase supply or reduce waste quickly."),
)
PROFIT = opts(
    ("defend-profit", "Defend the profit", "Argue that high returns compensated real risk and financed needed supply."),
    ("disclose-profit", "Disclose the exposure", "Make the sources of the windfall and related contracts transparent."),
    ("share-windfall", "Share part of the windfall", "Return value through wages, discounts, relief, or community support."),
    ("reinvest-windfall", "Reinvest in capacity", "Use the windfall to expand supply, resilience, or reconstruction."),
    ("conceal-exposure", "Keep the exposure quiet", "Protect reputation or negotiating position by avoiding voluntary disclosure."),
)
RECON = opts(
    ("restore-fast", "Restore quickly", "Return damaged systems to service using the fastest workable design."),
    ("rebuild-resilient", "Rebuild for resilience", "Accept more cost and delay to reduce future single points of failure."),
    ("local-procurement", "Use local procurement", "Keep more rebuilding income in affected communities and accept capacity constraints."),
    ("minimize-cost", "Minimize reconstruction cost", "Use the cheapest compliant mix and preserve scarce public/private capital."),
)
SAVE = opts(
    ("save-business", "Save the business", "Protect productive capacity and jobs even if other obligations wait."),
    ("save-household", "Protect the household", "Prioritize personal/family liquidity, housing, and essential needs."),
    ("save-workers", "Protect workers", "Use scarce resources to preserve wages, safety, or employment."),
    ("save-public-service", "Protect essential service", "Prioritize civic, food, energy, payment, health, or transport continuity."),
)
INVESTIGATION = opts(
    ("public-disclosure", "Disclose publicly", "Put the evidence into the public record and accept the immediate political consequences."),
    ("formal-investigation", "Use the formal investigation", "Transfer evidence through an auditable institutional channel."),
    ("protect-source", "Protect the source", "Delay or narrow disclosure to protect a person who made the evidence possible."),
    ("personal-leverage", "Keep personal leverage", "Hold some information back because it may protect you or someone close to you."),
)
BELONGING = opts(
    ("full-disclosure", "Disclose fully", "Accept scrutiny in exchange for a cleaner residency/security record."),
    ("protect-another", "Protect another person", "Refuse or narrow a disclosure that would expose someone else."),
    ("accept-service", "Accept service or restrictions", "Take on a public/strategic obligation to strengthen your claim to belonging."),
    ("challenge-process", "Challenge the process", "Use an appeal or public objection against a rule you consider unfair."),
    ("keep-exit-open", "Keep an exit open", "Avoid deeper obligations while preserving the option to leave."),
)
PEACE = opts(
    ("centralized-security", "Centralized Security Compact", "Create stronger common verification/security authority with larger control and liberty costs."),
    ("multilateral-reconstruction", "Multilateral Reconstruction", "Use distributed oversight, audit, shared repair finance, and slower common institutions."),
    ("regional-corridors", "Regional Corridor System", "Build smaller interoperable route blocs with more redundancy and transaction cost."),
    ("managed-suspension", "Managed Meridian Suspension", "Freeze the original integration plan and stabilize through bilateral or temporary arrangements."),
)
COMMIT = opts(
    ("rebuild-economy", "Rebuild the economy", "Prioritize productive reconstruction and sustainable private opportunity."),
    ("verify-settlement", "Verify the settlement", "Prioritize audit, monitoring, evidence, and compliance."),
    ("rebuild-community", "Rebuild community", "Prioritize housing, services, workers, and local institutions."),
    ("reconnect-trade", "Reconnect trade", "Prioritize lawful cross-border commerce and restoration of useful interdependence."),
)
ACCOUNTABILITY = opts(
    ("disclose-all", "Disclose everything you can prove", "Accept personal and institutional consequences for maximum transparency."),
    ("formal-route", "Use formal accountability channels", "Submit evidence to audits, courts, reviews, or authorized institutions."),
    ("protect-people", "Protect people while disclosing", "Narrow or sequence disclosure to avoid unnecessary harm to sources or dependents."),
    ("withhold-record", "Withhold part of the record", "Keep evidence private because disclosure would threaten you, an ally, or a negotiated outcome."),
)
FUTURE = opts(
    ("stay-and-commit", "Stay and commit", "Build a permanent future in the adopted country and accept deeper obligations."),
    ("leave", "Leave", "Protect mobility and start again somewhere else rather than bind your future to this settlement."),
    ("rebuild-business", "Rebuild or expand the business", "Make enterprise and reconstruction the center of your postwar life."),
    ("seek-influence", "Seek influence", "Move toward policy, institutional, financial, or public leadership."),
    ("reconnect-borders", "Reconnect across borders", "Make restoring family, trade, or civic relationships across the conflict the priority."),
)


def callback_deltas(choice: str) -> dict[str, int]:
    if any(token in choice for token in ("protect", "help", "public", "appeal", "shared", "community", "formal", "disclose", "safeguard", "target")):
        return {"trust": 6, "respect": 5}
    if any(token in choice for token in ("profit", "conceal", "fast", "scale", "market-price", "output")):
        return {"respect": 5, "suspicion": 3}
    if any(token in choice for token in ("wait", "defer", "cautious", "liquidity")):
        return {"respect": 3, "trust": 1}
    return {"respect": 5}


def choice_event(events: list[dict], day: int, slug: str, role: str, purpose: str, body: str, prompt: str, options: list[dict], callback_day: int | None, end_day: int, default: str | None = None, callback_role: str | None = None) -> list[dict]:
    rules = []
    duration_days = max(1, (callback_day - day - 1) if callback_day is not None else 2)
    for code, cfg in COUNTRIES.items():
        country_body = f"{body} In {cfg['angle']}, the consequences will not be distributed evenly."
        rules.append({"ruleKey": f"{cfg['slug']}.d{day:03d}.{slug}", "condition": country_condition(code), "effects": [message(role, code, day, purpose, country_body, prompt=prompt, options=options, duration_days=duration_days, default=default or options[0]["choiceKey"], interaction_slug=slug)]})
    events.append(event(day, f"event.campaign.d{day:03d}.{slug}.v1", ["INBOX", "CHOICE"], rules, f"Structured {slug} choice."))

    deferred: list[dict] = []
    if callback_day is None:
        return deferred
    if callback_day <= end_day:
        callback_rules = []
        for code, cfg in COUNTRIES.items():
            interaction = f"interaction.story.{cfg['slug']}.d{day:03d}.{slug}.v1"
            for option in options:
                callback_rules.append({"ruleKey": f"{cfg['slug']}.d{callback_day:03d}.{slug}.{option['choiceKey']}", "condition": choice_condition(interaction, option["choiceKey"]), "effects": [relationship(code, callback_role or role, f"Your earlier choice was {option['label'].lower()}.", **callback_deltas(option["choiceKey"]))]})
        events.append(event(callback_day, f"event.campaign.d{callback_day:03d}.{slug}-callback.v1", ["SYSTEM"], callback_rules, f"S4 callback for Day {day} {slug} choice."))
    else:
        for code, cfg in COUNTRIES.items():
            interaction = f"interaction.story.{cfg['slug']}.d{day:03d}.{slug}.v1"
            for option in options:
                deferred.append({"day": callback_day, "eventKey": f"event.campaign.d{callback_day:03d}.{slug}-callback.v1", "condition": choice_condition(interaction, option["choiceKey"]), "effectPlan": {"type": "relationship_adjust", "characterKey": cfg[callback_role or role][0], "reason": f"Cross-month callback for {option['choiceKey']}."}})
    return deferred


def message_event(events: list[dict], day: int, slug: str, role: str, purpose: str, body: str, delivery: list[str] | None = None) -> None:
    rules = []
    for code, cfg in COUNTRIES.items():
        rules.append({"ruleKey": f"{cfg['slug']}.d{day:03d}.{slug}", "condition": country_condition(code), "effects": [message(role, code, day, purpose, f"{body} For you, the immediate country context is {cfg['angle']}.")]})
    events.append(event(day, f"event.campaign.d{day:03d}.{slug}.v1", delivery or ["INBOX"], rules, body))


def anchor_event(events: list[dict], day: int, key: str, delivery: list[str], notes: str) -> None:
    events.append(event(day, key, delivery, [], notes))


def country_news(news: list[dict], day: int, slug: str, title: str, prefix: str) -> None:
    for code, cfg in COUNTRIES.items():
        news.append({"day": day, "newsKey": f"news.country.{cfg['slug']}.d{day:03d}.{slug}.v1", "scope": "country", "countryCode": code, "epistemicStatus": "confirmed fact", "title": title, "summary": f"{prefix} In {code.title()}, the immediate lens is {cfg['angle']}."})


def global_news(news: list[dict], day: int, key: str, title: str, summary: str, status: str = "confirmed fact") -> None:
    news.append({"day": day, "newsKey": key, "scope": "global", "countryCode": None, "epistemicStatus": status, "title": title, "summary": summary})


def contract_plans(days: list[tuple[int, str, str]]) -> list[dict]:
    values = []
    for day, slug, purpose in days:
        for code, cfg in COUNTRIES.items():
            values.append({"day": day, "contractKey": f"contract.story.{cfg['slug']}.d{day:03d}.{slug}.v1", "countryCode": code, "bindingStatus": "PLANNED_BINDING", "purpose": f"{purpose} Country context: {cfg['angle']}."})
    return values


def systems(rows: list[tuple[int, str, str]]) -> list[dict]:
    return [{"day": day, "bindingKey": f"system.story.d{day:03d}.{slug}.v1", "bindingStatus": "PLANNED_BINDING", "purpose": purpose} for day, slug, purpose in rows]


def base_pack(pack_id: str, start: int, end: int, events: list[dict], news: list[dict], contracts: list[dict], system_rows: list[dict], quiet: list[int], choices: list[int], min_messages: int, min_news: int, expected_contracts: int, deferred: list[dict] | None = None, incoming: list[dict] | None = None, hidden_forbidden: bool = True, extra: dict | None = None) -> dict:
    data = {
        "packId": pack_id,
        "version": "1.0.0",
        "campaign": "CEE100",
        "days": {"start": start, "end": end},
        "runtimeRule": "Authoring dates are reference-only. Seed adapter must use elapsed-time or another authoritative supported trigger.",
        "countries": [{"countryCode": code, "slug": cfg["slug"], "sponsorKey": cfg["sponsor"][0], "friendKey": cfg["friend"][0], "rivalKey": cfg["rival"][0], "gatekeeperKey": cfg["gatekeeper"][0], "institutionalLeadKey": cfg["lead"][0]} for code, cfg in COUNTRIES.items()],
        "storyEvents": events,
        "news": news,
        "contractPlans": contracts,
        "systemBindingPlans": system_rows,
        "noForcedInterruptionDays": quiet,
        "acceptance": {"countryCount": 10, "requiredChoiceDays": choices, "minimumCharacterMessagesPerCountry": min_messages, "minimumNewsRecords": min_news, "expectedContractPlans": expected_contracts, "requireEveryChoiceCallback": True, "prohibitHiddenCanonTerms": hidden_forbidden},
    }
    if deferred:
        data["deferredCallbacks"] = deferred
    if incoming:
        data["incomingCallbackPlans"] = incoming
    if extra:
        data.update(extra)
    return data


def build_november() -> dict:
    events: list[dict] = []
    news: list[dict] = []
    deferred: list[dict] = []
    country_news(news, 93, "first-return", "Earlier Meridian choices begin returning", "The boom is now rewarding some earlier positions while exposing others.")
    message_event(events, 94, "first-return-personal", "rival", "follow_up", "The gap between our choices is finally showing up in real money, access, or workload.")
    global_news(news, 95, "news.campaign.d095.first-return.v1", "Forum compares four Meridian models", "The Forum records that finance, multilateral, logistics, and industrial-security approaches solve different problems and create different dependencies.")
    deferred += choice_event(events, 97, "first-return", "sponsor", "request", "The path that looked best in August now has a visible return and a visible cost.", "Do you stay the course or change it?", RETURN, 99, 122, "rebalance")
    anchor_event(events, 99, "event.meridian.sableport-capacity-warning.v1", ["BREAKING NEWS", "SYSTEM"], "First unmistakable public Sableport capacity warning.")
    global_news(news, 99, "news.meridian.sableport-capacity-warning.v1", "Sableport issues formal capacity warning", "Yrethian port authorities report measurable congestion and throughput risk while stating that trade remains functional.")
    message_event(events, 100, "sableport-human-cost", "friend", "warning", "The Sableport delay is no longer just a line in a logistics report. Somebody is losing shifts, shelf time, or cash waiting for movement.")
    country_news(news, 101, "sableport-capacity", "Sableport warning redistributes pressure", "Yrethia bears the direct bottleneck while alternate routes, importers, insurers, and inventory-dependent firms adjust.")
    deferred += choice_event(events, 104, "capacity-response", "gatekeeper", "request", "Capacity can be protected by slowing throughput, shifting routes, or deciding whose cargo waits.", "What should receive priority?", CAPACITY, 106, 122, "prioritize-maintenance")
    message_event(events, 106, "production-talent-pressure", "friend", "warning", "The next constraint is appearing inside work itself: more demand, tighter staffing, and less tolerance for delay or error.")
    global_news(news, 107, "news.campaign.d107.export-review-and-talent-constraint.v1", "Northreach reviews strategic exports as Solvend flags talent constraint", "Resource access and advanced-skill shortages are tightening at the same time, raising costs for dependent firms.")
    country_news(news, 110, "export-talent", "Resource and talent constraints spread unevenly", "Northreach and Solvend are directly affected while equipment, component, and hiring costs move across dependent economies.")
    deferred += choice_event(events, 112, "scarcity-posture", "rival", "request", "Scarcity is creating both a profit opportunity and an operating risk.", "How do you respond to the tightening resource and talent market?", SCARCITY, 114, 122, "hedge-scarcity")
    global_news(news, 113, "news.campaign.d113.harvest-revision-and-reservoir-warning.v1", "Eldoran revises harvest outlook as Valerion reports weaker reservoirs", "Food and water-energy expectations deteriorate without yet becoming a general shortage.")
    message_event(events, 115, "household-pressure", "sponsor", "warning", "A household or small operator you know is starting to feel the price pressure before the headline numbers look dramatic.")
    country_news(news, 116, "harvest-reservoir", "Food and water risks reach every country differently", "Import dependence, storage, rail, hydropower, conservation, and household budgets translate the warnings into local effects.")
    deferred += choice_event(events, 117, "reserve-policy", "gatekeeper", "request", "Food, water, and energy pressure can be handled through prices, reserves, support, or new capacity.", "What should be protected first?", RESERVES, 119, 122, "target-support")
    message_event(events, 120, "identity-debt-personal", "friend", "warning", "A financing or identity-review problem that looked administrative has now caught a real person or project in the delay.")
    global_news(news, 122, "news.campaign.d122.debt-exposure-and-identity-anomalies.v1", "Project debt and identity anomalies widen the Meridian risk map", "Xalvorian audits report correlated project exposure while Syndalian systems report unusual verification activity; neither finding proves hostile action.")
    return base_pack("story.content.act3.november.v1", 93, 122, events, news,
        contract_plans([(96,"second-stage-opportunity","Second-stage opportunity based on earlier path and exposure."),(102,"capacity-response","Capacity, rerouting, maintenance, or inventory response."),(109,"resource-talent","Resource exposure, talent mobility, or operating-continuity work."),(118,"food-water-response","Storage, affordability, conservation, or supply response."),(121,"debt-identity-audit","Project audit, identity review, or payment resilience work.")]),
        systems([(99,"sableport-capacity","Shipping/insurance/warehouse risk reacts to formal port congestion."),(103,"alternate-route-demand","Alternate-route, warehousing, and manual logistics demand rises."),(108,"resource-talent-pricing","Resource prices and high-skill wages tighten selectively."),(114,"food-water-expectations","Food, water, hydropower, storage, and conservation expectations move.")]),
        [98,105,111,119], [97,104,112,117], 9, 40, 50, deferred)


def build_december() -> dict:
    events=[]; news=[]; deferred=[]
    deferred += choice_event(events,124,"review-process","gatekeeper","request","Debt and identity reviews are now balancing speed, loss prevention, and due process.","How should uncertain cases be handled?",REVIEW,126,153,"protect-due-process")
    country_news(news,125,"debt-identity","Debt and verification stress stays country-specific","Financing terms and identity/payment review delays are spreading through different local institutions.")
    global_news(news,127,"news.campaign.d127.structural-stress-synthesis.v1","Separate warnings now form a cross-system stress pattern","Port capacity, exports, talent, food, water, debt, identity verification, production, and labor fatigue can no longer be treated as isolated issues.")
    anchor_event(events,127,"event.campaign.d127.structural-stress-synthesis.v1",["NEWS","SYSTEM"],"Structural stress becomes visible without becoming a war/crisis cutscene.")
    message_event(events,128,"production-shortcuts","friend","warning","Output pressure is making shortcuts sound normal in workplaces that were already stretched.")
    country_news(news,131,"production-route","Production strain and route recognition collide","Industrial output, repair capacity, certification, and route legitimacy now affect lead times across the system.")
    deferred += choice_event(events,132,"production-pressure","friend","request","A faster production decision would help now and leave a weaker audit or safety trail.","What do you do under output pressure?",PRODUCTION,134,153,"document-risk")
    country_news(news,134,"affordability","Affordability pressure becomes visible in different essentials","The source of household strain differs by country rather than behaving like one universal inflation shock.")
    global_news(news,135,"news.campaign.d135.food-energy-affordability-squeeze.v1","Food and energy affordability squeeze broadens","Earlier harvest, reservoir, transport, and resource pressures are now reaching household and small-business budgets.")
    message_event(events,136,"affordability-personal","sponsor","request","Someone close to your local life can no longer absorb the latest essential-cost increase without changing something else.")
    deferred += choice_event(events,139,"affordability-response","sponsor","request","There is not enough money or supply to make every household whole.","How should affordability pressure be handled?",AFFORD,141,153,"targeted-relief")
    message_event(events,141,"stockpiling-debate","rival","follow_up","People are building inventories because they distrust the next month. That can be prudent and still make today more expensive for someone else.")
    global_news(news,143,"news.campaign.d143.stockpiling-and-social-strain.v1","Stockpiling and labor strain rise together","Firms and households are increasing inventories while protests, overtime disputes, and affordability concerns appear in selected cities.")
    deferred += choice_event(events,145,"stockpiling-posture","rival","request","A larger inventory can protect you from shortage or make you part of the shortage others face.","How much buffer do you build?",STOCKPILE,147,153,"build-buffer")
    country_news(news,146,"stockpiling","Countries distinguish reserves from hoarding","Reserve needs, storage capacity, import dependence, and household affordability make the same inventory decision look different in each economy.")
    global_news(news,148,"news.campaign.d148.false-calm.v1","Year-end measures produce a partial stabilization","Several stressed indicators improve and officials describe conditions as manageable, while structural dependencies remain unresolved.")
    message_event(events,149,"ordinary-plans","friend","relationship","For the first time in weeks, people are talking about promotion, housing, savings, holidays, and next year instead of only shortages.")
    country_news(news,152,"false-calm","Every country gets one improvement and one unresolved dependency","The calmer data is real but incomplete; local plans can resume without pretending the warnings disappeared.")
    deferred += choice_event(events,153,"false-calm-posture","sponsor","reflection","A calmer moment is an opportunity too.","What do you do with the false calm?",CALM,155,153,"save-liquidity")
    return base_pack("story.content.act3.december.v1",123,153,events,news,
        contract_plans([(133,"production-quality","Production safety, repair quality, or route-recognition work."),(138,"affordability-response","Essential-supply optimization or targeted affordability work."),(142,"inventory-buffer","Inventory, supplier, or reserve management with carrying-cost trade-offs.")]),
        systems([(123,"debt-cyber-risk","Credit spreads and cyber/security demand shift as audits and anomalies continue."),(127,"structural-stress","Multi-sector risk becomes visible but remains manageable."),(129,"production-repair-strain","Machinery, steel, and repair capacity tighten."),(137,"household-budget-pressure","Household and discretionary demand respond to affordability pressure."),(144,"inventory-demand","Inventory demand raises carrying costs and short-run prices."),(150,"false-calm-recovery","Volatility falls and selected strained sectors partially recover.")]),
        [126,130,140,147,151], [124,132,139,145,153], 9, 50, 30, deferred)


def build_january() -> dict:
    events=[]; news=[]; deferred=[]
    incoming=[{"sourcePack":"story.content.act3.december.v1","sourceDay":153,"targetDay":155,"eventKey":"event.campaign.d155.false-calm-posture-callback.v1","notes":"Resolve December false-calm posture before cargo-record escalation."}]
    country_news(news,155,"cargo-records","Cargo records begin disagreeing across systems","Yrethia, Syndalis, Thaloris, and logistics-dependent economies see the strongest immediate effects.")
    global_news(news,156,"news.campaign.d156.cargo-records-disagree.v1","Meridian cargo records disagree across verification systems","Firms and investigators report incompatible manifests and timestamps; no hostile actor is confirmed.")
    message_event(events,157,"preserve-records","gatekeeper","request","A record in your orbit does not match what another system says. Preserve what you have before anyone decides what it means.")
    deferred += choice_event(events,160,"cargo-evidence","gatekeeper","request","The discrepancy is material enough to report and weak enough to misread.","What do you do with the cargo discrepancy?",EVIDENCE,162,184,"wait-more-evidence")
    anchor_event(events,162,"event.meridian.customs-security-intrusion.v1",["INTERRUPT","BREAKING NEWS","SYSTEM"],"Customs Security Intrusion; attribution explicitly unconfirmed.")
    global_news(news,162,"news.meridian.customs-security-intrusion.v1","Customs Security Intrusion disrupts Meridian verification","Eastgate and connected verification systems enter emergency handling after deliberate data corruption; attribution is unconfirmed.")
    global_news(news,164,"news.campaign.d164.customs-security-intrusion.v1","Manual verification expands after the intrusion","Cargo, payments, and claims move more slowly while investigators compare contradictory technical indicators.")
    deferred += choice_event(events,166,"intrusion-response","gatekeeper","request","Emergency access can restore commerce faster or create a larger privilege that is hard to audit.","How much emergency access do you accept after the intrusion?",ACCESS,168,184,"hybrid-expiring-access")
    country_news(news,167,"intrusion","Countries absorb different intrusion costs","Every country feels trade friction, but exposure depends on payments, logistics, imports, and alternative capacity.")
    global_news(news,169,"news.campaign.d169.commercial-paralysis.v1","Commercial paralysis spreads through held cargo and delayed settlement","Small firms face cash-flow pressure while manual verification, warehousing, claims, and short-term finance become more valuable.")
    message_event(events,171,"failed-transaction","friend","crisis","A failed transaction, held shipment, or cancelled shift has turned the verification problem into a personal cash-flow problem.")
    country_news(news,172,"commercial-paralysis","Held commerce creates local substitutes and shortages","The mix of delayed imports, exports, working capital, and domestic substitutes differs across the ten economies.")
    deferred += choice_event(events,173,"scarce-verification","friend","request","There is not enough verification or credit capacity to clear every legitimate case immediately.","Who receives scarce verification capacity first?",RESERVES,175,184,"target-support")
    anchor_event(events,176,"event.campaign.d176.attribution-crisis.v1",["NEWS","INBOX"],"Competing explanations become a public crisis of evidence.")
    global_news(news,176,"news.campaign.d176.attribution-crisis.v1","Attribution claims outrun the evidence","Officials and media outlets advance incompatible explanations while investigators warn that technical indicators are being overstated.","official claim")
    message_event(events,176,"attribution-investigator","lead","warning","There are facts, hypotheses, and people treating hypotheses as facts. Keep those categories separate even if everyone around you has already chosen a culprit.")
    country_news(news,177,"attribution-crisis","Countries interpret the same evidence differently","Institutional history and economic exposure shape which explanation each country finds plausible.")
    message_event(events,178,"evidence-discipline","gatekeeper","request","If you share what you know, label what is confirmed, what is inference, and what you only heard from somebody else.")
    global_news(news,179,"news.campaign.d179.attribution-crisis.v1","Competing intrusion narratives harden","Public certainty rises even though the underlying record remains contradictory.","analysis")
    deferred += choice_event(events,182,"weak-lead","gatekeeper","request","A weak lead could become useful evidence or a damaging accusation depending on what happens next.","What do you do with the weak lead?",DISCLOSURE,184,184,"report-privately")
    global_news(news,183,"news.campaign.d183.the-correction.v1","Early intrusion attribution claim partially disproven","Copied signatures and compromised credentials weaken one prominent early explanation without establishing the final cause.","correction")
    message_event(events,184,"correction-reaction","rival","reflection","One of the claims people were certain about just broke. Being early was not the same as being right.")
    return base_pack("story.content.act4.january.v1",154,184,events,news,
        contract_plans([(154,"false-calm-opportunity","A small ordinary opportunity before the anomaly sequence intensifies."),(159,"records-verification","Limited cargo/records verification work."),(163,"intrusion-response","Emergency verification, cyber, logistics, or claims work."),(174,"working-capital","Emergency working-capital, substitute-supply, or verification work."),(180,"evidence-review","Public-record, evidence-comparison, or forensic review work.")]),
        systems([(158,"manual-cargo-checks","Selected shipments receive manual checks and insurance/payment delays."),(162,"customs-intrusion","Intrusion creates verification, payment, and cargo emergency state."),(165,"manual-verification","Manual verification and selected holds expand."),(170,"cashflow-stress","Small-firm cash flow stress and short-term finance demand rise.")]),
        [161,168,175,181], [160,166,173,182], 9, 40, 50, deferred, incoming)


def build_february() -> dict:
    events=[]; news=[]; deferred=[]
    country_news(news,185,"correction-reputation","Correction redistributes reputational pressure","Countries and institutions face different credibility effects after copied/compromised indicators are confirmed.")
    deferred += choice_event(events,188,"correction-accountability","gatekeeper","reflection","A public claim you relied on was weaker than it looked.","How do you respond to the correction?",EVIDENCE,190,212,"report-privately")
    anchor_event(events,190,"event.campaign.d190.emergency-access-debate.v1",["NEWS","CHOICE"],"Formal emergency-access architecture debate.")
    deferred += choice_event(events,190,"emergency-access","lead","request","The intrusion proved that continuity needs a fallback. It did not prove which authority should own it.","Which emergency-access architecture should Meridian adopt?",ACCESS,197,212,"hybrid-expiring-access")
    global_news(news,190,"news.campaign.d190.emergency-access-debate.v1","Emergency access becomes a formal Meridian decision","Centralized access, federated verification, manual fallback, and expiring hybrid authority each carry different speed, audit, and control costs.")
    global_news(news,191,"news.campaign.d191.emergency-access-debate.v1","Governments publish emergency-access safeguards and objections","The debate remains unresolved; public records preserve proposed scope, expiry, and appeal rules.")
    country_news(news,194,"emergency-access","Countries frame emergency access through local vulnerabilities","Security, trade, privacy, due process, and operating continuity produce different national preferences.")
    message_event(events,196,"access-deadline","gatekeeper","warning","The emergency-access window is closing. If you leave the decision unanswered, the authored fallback will stand and later events will remember that it was a default, not an explicit endorsement.")
    global_news(news,197,"news.campaign.d197.pre-attack-anomalies.v1","New authentication failures trigger additional manual review","Verification teams report a new anomaly cluster but no attack or culprit is known.","confirmed fact")
    anchor_event(events,199,"event.meridian.attack.v1",["INTERRUPT","BREAKING NEWS","SYSTEM","INBOX"],"Physical sabotage at Eastgate coincides with digital strike on Syndalis Meridian Security Operations Center; attribution unconfirmed.")
    global_news(news,199,"news.meridian.attack.v1","Meridian Attack hits Eastgate and Syndalis security center","Civilian harm, cargo loss, payment failure, and communication disruption are confirmed. The attacker is not confirmed.")
    message_event(events,199,"attack-personal","friend","crisis","The attack has reached ordinary work, travel, payments, or somebody you know. Do not assume the person messaging you knows who did it.",["INBOX"])
    country_news(news,200,"meridian-attack","Every country absorbs a direct attack consequence","The same attack reaches each economy through different dependencies, markets, people, and services.")
    deferred += choice_event(events,201,"attack-crisis","sponsor","crisis","You cannot protect safety, liquidity, evidence, and every person around you at the same time.","What do you prioritize immediately after the attack?",CRISIS,203,212,"protect-safety")
    global_news(news,203,"news.campaign.d203.attack-attribution-claims.v1","Conflicting post-attack claims enter the record","Officials confirm damage and emergency response while advancing incompatible attribution claims.","official claim")
    anchor_event(events,204,"event.campaign.d204.emergency-controls.v1",["BREAKING NEWS","SYSTEM"],"Emergency border, cargo, payment, travel, and security controls activate.")
    global_news(news,204,"news.campaign.d204.emergency-controls.v1","Emergency controls reshape trade, travel, and payments","Temporary orders tighten movement, cargo, settlement, and security access while humanitarian and continuity exceptions are developed.")
    message_event(events,206,"emergency-burden","sponsor","crisis","The emergency order is not an abstract rule anymore. It is deciding who can move, work, pay, or reach somebody they care about.")
    country_news(news,207,"emergency-controls","Emergency controls create different local constraints and substitutes","Each country faces a different mix of travel, trade, payment, inventory, and employment restrictions.")
    deferred += choice_event(events,208,"scarcity-obligation","sponsor","request","Scarcity and scrutiny are forcing you to choose which obligation gets protected first.","Which obligation do you honor first?",OBLIGATION,210,212,"split-obligation")
    global_news(news,211,"news.campaign.d211.retaliation.v1","Retaliatory sanctions and security measures begin","Asset freezes, export controls, inspections, and mobilization expand even while attribution remains disputed.","confirmed fact")
    message_event(events,212,"crossborder-obligation","sponsor","request","A legitimate cross-border relationship now carries legal, financial, and loyalty risk. Someone is waiting to learn whether you will keep the commitment.")
    return base_pack("story.content.act4.february.v1",185,212,events,news,
        contract_plans([(186,"forensics-followup","Audit or forensics follow-up for preserved evidence."),(193,"emergency-access-review","Governance/security architecture evaluation."),(202,"attack-response","Repair, claims, food-energy continuity, cyber, or humanitarian response."),(209,"emergency-compliance","Emergency compliance, distribution, repair, claims, or support work.")]),
        systems([(187,"trust-repricing","Risk assets rebound unevenly while verification/institutional trust remains damaged."),(192,"access-architecture-pricing","Cybersecurity, compliance, and operating-cost expectations move by proposed architecture."),(199,"meridian-attack","Attack damage, payment failure, cargo loss, and market stress activate."),(204,"emergency-controls","Emergency policy/travel/payment restrictions activate where authoritative."),(205,"emergency-liquidity","Liquidity, shortages, route access, and sector volatility intensify.")]),
        [189,195,198,210], [188,190,201,208], 8, 40, 40, deferred)


def build_march() -> dict:
    events=[]; news=[]; deferred=[]
    anchor_event(events,213,"event.campaign.d213.retaliation.v1",["BREAKING NEWS","SYSTEM","INBOX"],"Retaliation phase begins while attribution remains contested.")
    global_news(news,213,"news.campaign.d213.retaliation.v1","Retaliation phase widens sanctions, controls, and mobilization","Governments make independent post-attack choices that create new economic and political facts.")
    message_event(events,213,"retaliation-personal","sponsor","crisis","A sanction, asset review, export rule, or mobilization order has now reached your adopted-country life directly.")
    deferred += choice_event(events,216,"crossborder-connection","sponsor","request","A legitimate cross-border connection is now expensive to keep and costly to abandon.","What do you do with the exposed connection?",CONNECTION,218,243,"disclose-connection")
    message_event(events,218,"mobilization-personal","friend","crisis","Work, travel, or family plans are being reclassified around mobilization and security needs.")
    global_news(news,219,"news.campaign.d219.freight-standoff.v1","Meridian freight escort standoff worsens","Security forces confront one another during a disputed escort and seizure operation; no acknowledged exchange has yet occurred.")
    anchor_event(events,220,"event.campaign.d220.open-war.v1",["INTERRUPT","BREAKING NEWS","SYSTEM"],"Open war acknowledged after state forces exchange fire during disputed freight escort/seizure confrontation.")
    global_news(news,220,"news.campaign.d220.open-war.v1","Open war confirmed after Meridian freight confrontation","The conflict is now sustained by state decisions, sanctions, mobilization, casualties, and reciprocal commitments beyond the original attack.")
    country_news(news,222,"open-war","Countries form temporary wartime groupings without simple moral blocs","Security, trade, technical, and humanitarian alignments alter each economy differently.")
    deferred += choice_event(events,224,"wartime-posture","lead","request","Open war changes the meaning of ordinary commercial choices.","What wartime economic posture do you take?",WAR_POSTURE,226,243,"defensive-posture")
    global_news(news,225,"news.campaign.d225.alignment.v1","Temporary wartime alignments formalize","Countries coordinate security, trade, infrastructure, technology, and humanitarian access through overlapping arrangements rather than one permanent bloc system.")
    message_event(events,226,"alignment-commitment","gatekeeper","request","The institution asking for your help wants a practical commitment, not a slogan. It will also remember whether you kept your independence.")
    country_news(news,227,"alignment","Countries accept different cooperation and different red lines","The wartime alignments create real opportunities and new dependencies without erasing national disagreements.")
    deferred += choice_event(events,230,"alignment-position","gatekeeper","request","Specialization can create security and opportunity while making it harder to reconnect later.","How closely do you align your economic life?",ALIGNMENT,232,243,"neutral-service")
    message_event(events,232,"displacement-personal","sponsor","crisis","People are arriving, leaving, or crowding into safer places faster than housing and services can adjust.")
    global_news(news,234,"news.campaign.d234.displacement.v1","Civilian displacement changes labor, housing, and essential-service demand","Movement toward safer cities and functioning infrastructure is creating new pressure on receiving areas and new losses in sending areas.")
    deferred += choice_event(events,236,"displacement-response","friend","request","Strong displacement demand can make you money and also make somebody else's emergency more expensive.","How do you respond to displacement demand?",DISPLACEMENT,238,243,"expand-capacity")
    country_news(news,237,"displacement","Countries play sender, receiver, transit, and support roles","Housing, transport, labor, food, and service impacts depend on where people are moving and which infrastructure still works.")
    global_news(news,239,"news.campaign.d239.evidence-too-late.v1","Investigators challenge important pre-war claims","Evidence shows that some technical indicators and records were manipulated, incomplete, or commercially sourced; the significance remains disputed.","analysis")
    global_news(news,240,"news.campaign.d240.evidence-review-pending.v1","Technical-evidence review prepares a major correction","Institutions and markets brace for a finding that may change the pre-war attribution record without changing the existence of the war.")
    anchor_event(events,241,"event.campaign.d241.attribution-correction.v1",["BREAKING NEWS","INBOX"],"Major evidence correction weakens early attribution but does not erase later state responsibility.")
    global_news(news,241,"news.campaign.d241.attribution-correction.v1","Major correction weakens early state-attribution indicators","Copied signatures and commercially sourced records were treated as stronger evidence than they were. Later state escalation remains independently documented.","correction")
    message_event(events,241,"correction-investigator","gatekeeper","reflection","The record changed. That does not make every later action disappear. Separate responsibility for the spark from responsibility for what people chose afterward.")
    country_news(news,242,"evidence-correction","Correction creates different domestic credibility crises","Institutions that amplified weak evidence face different accountability pressures across the ten countries.")
    deferred += choice_event(events,243,"wartime-evidence-disclosure","gatekeeper","request","You have evidence that matters, but publishing it during a war can protect truth and still create immediate risk.","What do you do with the wartime evidence?",DISCLOSURE,245,243,"report-privately")
    return base_pack("story.content.act5.march.v1",213,243,events,news,
        contract_plans([(214,"retaliation-compliance","Sanctions compliance, alternate supply, emergency finance, or humanitarian exception work."),(221,"wartime-continuity","Industry, food, cyber, logistics, finance, or civic continuity work."),(228,"alignment-work","Alignment-dependent production, routing, technical, or humanitarian work."),(233,"displacement-response","Relocation, housing, transport, food, or small-business continuity work.")]),
        systems([(213,"retaliation","Sanctions, asset reviews, export controls, and mobilization reprice exposures."),(215,"crossborder-repricing","Strategic goods, finance, and cross-border holdings reprice sharply."),(220,"open-war","Wartime market/policy/contract state activates."),(229,"alignment-routing","Trade routes and procurement demand shift by wartime alignment."),(235,"displacement-demand","Housing, transport, food, services, and labor markets move in receiving areas.")]),
        [217,223,231,238], [216,224,230,236,243], 9, 40, 40, deferred)


def build_april() -> dict:
    events=[]; news=[]; deferred=[]
    incoming=[{"sourcePack":"story.content.act5.march.v1","sourceDay":243,"targetDay":245,"eventKey":"event.campaign.d245.wartime-evidence-disclosure-callback.v1","notes":"Resolve March evidence choice before war-economy expansion."}]
    message_event(events,244,"evidence-decision-reminder","gatekeeper","follow_up","The evidence decision remains open from the end of March. The issue is not whether the truth matters; it is when and through which channel it can do the least avoidable harm.")
    message_event(events,246,"war-fortune-rival","rival","reflection","Our economic paths are separating fast now. One of us may look smart because the war created demand neither of us controlled.")
    global_news(news,248,"news.campaign.d248.war-economy.v1","Strategic production and continuity spending accelerate","Governments and firms prioritize repair, logistics, finance, food, energy, industry, and cyber continuity, creating large gains and civilian opportunity costs.")
    deferred += choice_event(events,250,"war-economy-scale","rival","request","Wartime demand can make your work or portfolio more valuable very quickly.","How far do you scale into wartime demand?",WAR_SCALE,252,273,"scale-with-safeguards")
    country_news(news,251,"war-economy","Country strengths become wartime advantages and constraints","Every economy can contribute something valuable, and every contribution diverts labor, capital, or goods from another use.")
    anchor_event(events,253,"event.campaign.d253.network-pressure.v1",["BREAKING NEWS","SYSTEM"],"Second network/payment/communications emergency; February access choice becomes relevant through incoming S4 state.")
    global_news(news,253,"news.campaign.d253.network-pressure.v1","Payments and communications face renewed network pressure","Multiple attacks and outages stress verification, settlement, communications, and operational coordination; attribution remains mixed by incident.")
    message_event(events,255,"network-rights","gatekeeper","warning","Emergency access is still powerful because it works. The question is whether anyone can still explain who used it, why, and when the privilege expires.")
    country_news(news,256,"network-pressure","Network pressure reaches every economy through different dependencies","Payments, logistics, identity, communications, finance, and public services transmit the disruption differently.")
    message_event(events,257,"access-choice-return","lead","follow_up","The emergency-access position you supported in February is no longer theoretical. People are now living with its speed, blind spots, and audit burden.")
    message_event(events,262,"food-energy-personal","sponsor","crisis","The food-energy emergency has reached an ordinary household, supplier, or service you know well enough that the numbers have a name attached to them.")
    global_news(news,263,"news.campaign.d263.food-and-energy-emergency.v1","Food and energy emergency widens civilian strain","War disruption combines with earlier harvest, reservoir, resource, and transport constraints to tighten essentials.")
    country_news(news,261,"food-energy","Essential-goods pressure follows different national dependencies","Eldoran, Valerion, and Northreach are central suppliers while every country faces a different household and industrial exposure.")
    deferred += choice_event(events,266,"food-energy-allocation","friend","request","There is not enough essential supply to make every user indifferent to the shortage.","How do you allocate scarce food, energy, or essential capacity?",FOOD_ALLOC,268,273,"target-essential-users")
    anchor_event(events,267,"event.campaign.d267.profiteering-review.v1",["NEWS","INBOX","CHOICE"],"Public scrutiny turns to wartime fortunes.")
    global_news(news,267,"news.campaign.d267.profiteering-review.v1","Wartime fortunes face public scrutiny","Reporting distinguishes productive scarcity profits and repair investment from price exploitation, hidden contracts, and transferred civilian costs.","analysis")
    deferred += choice_event(events,267,"wartime-profit","gatekeeper","request","A high return can reflect real risk and still leave someone else carrying a cost you never saw on your statement.","What do you do with a wartime windfall or exposed profit?",PROFIT,272,273,"reinvest-windfall")
    message_event(events,268,"profit-relationship","rival","reflection","People are starting to judge the same profit differently depending on how it was earned and what happened afterward.")
    country_news(news,269,"profiteering","Countries debate legitimate profit and exploitation differently","Sector structure, household exposure, wartime procurement, and local scarcity determine what the public sees as fair.")
    return base_pack("story.content.act6.april.v1",244,273,events,news,
        contract_plans([(247,"war-economy","High-value wartime production or service work with explicit externality framing."),(258,"network-recovery","Network recovery, manual settlement, data-rights, or infrastructure repair."),(264,"food-energy-response","Reserve release, emergency distribution, conservation, subsidy, or supply work."),(270,"profit-review","Audit, pricing, tax, contract-review, or supply-expansion work.")]),
        systems([(249,"war-economy-demand","Strategic-sector employment/profits rise while civilian goods and services tighten."),(253,"network-pressure","Payments, communications, and verification systems enter renewed emergency."),(254,"payment-fallback","Fallback settlement, liquidity, cyber demand, and logistics coordination are stressed."),(260,"essential-goods","Essential goods, utilities, transport, budgets, and reserves tighten."),(271,"profit-scrutiny","High-profit firms face scrutiny, policy risk, or reputation effects without condemning all profit.")]),
        [245,252,259,265,273], [250,266,267], 8, 40, 40, deferred, incoming)


def build_may() -> dict:
    events=[]; news=[]; deferred=[]
    message_event(events,274,"reconstruction-personal","friend","follow_up","Reconstruction looks like hope from one street and displacement risk from the next. The work is real; so is the ownership question.")
    global_news(news,275,"news.campaign.d275.damage-and-reconstruction.v1","Reconstruction begins before the conflict fully ends","Repair work expands across infrastructure, housing, utilities, logistics, finance, and civic services while ownership and procurement choices remain unsettled.")
    country_news(news,278,"reconstruction","Countries contribute different reconstruction capabilities","Materials, finance, engineering, food, energy, logistics, cyber, and institutional services create different opportunities and dependencies.")
    deferred += choice_event(events,280,"reconstruction-design","lead","request","Rebuilding quickly is not the same thing as rebuilding the system you want to live with later.","What should reconstruction prioritize?",RECON,282,304,"rebuild-resilient")
    anchor_event(events,281,"event.campaign.d281.war-exhaustion.v1",["NEWS","INBOX"],"War exhaustion becomes undeniable.")
    global_news(news,281,"news.campaign.d281.war-exhaustion.v1","Debt, fatigue, defaults, and service strain constrain the war economy","Even successful wartime sectors face worker exhaustion, fiscal stress, casualties, and business failure around them.")
    message_event(events,281,"war-exhaustion-personal","sponsor","crisis","There is no longer enough money, time, labor, or attention to protect everything you built.")
    country_news(news,283,"war-exhaustion","Every country reaches a different exhaustion threshold","Debt, workers, public services, business failures, imports, or infrastructure place a different hard limit on each economy.")
    global_news(news,286,"news.campaign.d286.war-exhaustion.v1","War costs become harder to hide", "Defaults, worker fatigue, casualty costs, public-service strain, and business failures narrow governments' and firms' options.")
    deferred += choice_event(events,287,"what-to-save","sponsor","request","You cannot protect every balance sheet, relationship, job, and public service at once.","What do you save first?",SAVE,289,304,"save-public-service")
    anchor_event(events,288,"event.campaign.d288.continuity-compact-breakthrough.v1",["INTERRUPT","BREAKING NEWS","INBOX"],"Continuity Compact investigation breakthrough; hidden canon becomes public evidence.")
    global_news(news,288,"news.campaign.d288.continuity-compact-breakthrough.v1","Investigation identifies transnational Continuity Compact behind the Meridian spark","Financial, security, insurance, procurement, and governance records show a private network engineered the initial security crisis. The evidence does not show that the network controlled the later state war.","confirmed fact")
    message_event(events,288,"breakthrough-personal","gatekeeper","briefing","The Continuity Compact is finally an evidence-backed finding, not a rumor. That also means the record has to separate what the network did from what governments chose after the attack.")
    message_event(events,289,"breakthrough-investigator","lead","follow_up","The breakthrough came from records that looked unrelated months ago: access grants, claims structures, payments, procurement clauses, and governance drafts.")
    country_news(news,292,"continuity-compact","Countries face different domestic accountability questions","Private actors operated across borders, so no country can explain the breakthrough by assigning all responsibility elsewhere.")
    deferred += choice_event(events,293,"investigation-disclosure","gatekeeper","request","The investigation can protect the public record, expose sources, strengthen negotiations, or become personal leverage.","How do you handle the breakthrough evidence you can influence?",INVESTIGATION,295,304,"formal-investigation")
    country_news(news,295,"belonging","Belonging and accountability collide in every adopted country","Residency, service, disclosure, travel, and public trust are being reconsidered through different national institutions.")
    global_news(news,296,"news.campaign.d296.belonging-crisis.v1","Foreign-born residents face enhanced status and security reviews","Governments preparing for settlement negotiations tighten selected reviews while public debate turns to loyalty, due process, and permanent belonging.")
    message_event(events,297,"belonging-personal","sponsor","request","The review is asking what you owe the country that gave you opportunity and what the country owes you after you built a life here.")
    deferred += choice_event(events,300,"belonging-choice","sponsor","request","Belonging is no longer an abstract identity question. The choice changes mobility, obligations, and who will vouch for you.","What does belonging require from you now?",BELONGING,303,304,"challenge-process")
    anchor_event(events,302,"event.campaign.d302.peace-architectures.v1",["NEWS","CHOICE","CONTRACT"],"Four settlement architectures become Player-facing.")
    global_news(news,302,"news.campaign.d302.peace-architectures.v1","Four settlement architectures enter formal negotiation","Negotiators compare a centralized security compact, multilateral reconstruction, regional corridors, and managed Meridian suspension.")
    deferred += choice_event(events,302,"peace-architecture","lead","request","No settlement can restore the pre-war world. Each architecture chooses which failure the system will be designed to avoid next.","Which settlement architecture should receive your support?",PEACE,306,304,"multilateral-reconstruction")
    global_news(news,304,"news.campaign.d304.peace-architectures.v1","Negotiators publish costs and safeguards for four settlement models","The proposals are now detailed enough to compare authority, audit, speed, redundancy, ownership, and economic cost.")
    return base_pack("story.content.act7.may.v1",274,304,events,news,
        contract_plans([(277,"reconstruction","Repair and reconstruction work while conflict remains active."),(284,"war-exhaustion","Restructuring, worker support, fiscal trade-off, or business rescue."),(294,"investigation","Investigation, accountability, or evidence-sharing work."),(299,"belonging","Residency, service, appeal, or assistance work where authoritative."),(303,"settlement","Settlement and reconstruction comparison/implementation work.")]),
        systems([(276,"reconstruction-demand","Construction, materials, engineering, finance, logistics, and civic-service demand shift."),(282,"war-exhaustion-credit","Credit and fiscal conditions tighten even for earlier war beneficiaries."),(290,"investigation-market-reaction","Implicated contractors reprice while peace expectations improve; war policy does not vanish."),(298,"belonging-restrictions","Travel, transfers, strategic employment, and documentation tighten selectively where authoritative.")]),
        [279,285,291,301], [280,287,293,300,302], 9, 40, 50, deferred, hidden_forbidden=False)


def build_june() -> dict:
    events=[]; news=[]; deferred=[]
    incoming=[{"sourcePack":"story.content.act7.may.v1","sourceDay":302,"targetDay":306,"eventKey":"event.campaign.d306.peace-architecture-callback.v1","notes":"Resolve May settlement preference into June advocacy/opportunity access."}]
    message_event(events,306,"settlement-opportunity","lead","follow_up","Your earlier settlement position is now affecting who asks for your help and which reconstruction or verification work treats you as credible.")
    country_news(news,307,"settlement-conditions","Countries publish the concessions they need from a settlement","No country receives every security, trade, ownership, migration, or institutional demand it entered the conference with.")
    anchor_event(events,309,"event.campaign.d309.ceasefire.v1",["INTERRUPT","BREAKING NEWS","SYSTEM"],"Starfall ceasefire conference produces provisional settlement.")
    global_news(news,309,"news.campaign.d309.ceasefire.v1","Starfall conference reaches provisional ceasefire settlement","Selected restrictions can ease conditionally while reconstruction, verification, and accountability move to the foreground.")
    message_event(events,311,"postwar-intention","sponsor","reflection","The fighting slowing down does not answer what you are going to do with the life, money, and obligations you still have.")
    country_news(news,312,"ceasefire","Ceasefire creates different concessions and domestic backlash","Each country gets immediate gains, unresolved disputes, and constituencies that believe too much was conceded.")
    deferred += choice_event(events,313,"settlement-commitment","lead","request","The provisional settlement needs people and firms to turn paper into working systems.","What postwar commitment do you make?",COMMIT,315,334,"rebuild-economy")
    country_news(news,317,"accountability","Countries name local failures and institutions that held up under pressure","Accountability is distributed across private actors, state choices, institutional errors, and wartime commercial conduct.")
    message_event(events,318,"accountability-rival","rival","reflection","What we did during the boom and war looks different now that the record is being audited in peacetime.")
    global_news(news,319,"news.campaign.d319.accountability.v1","Audits and hearings turn from wartime facts to responsibility","Procurement, claims, media corrections, security access, market conduct, and public decisions enter formal review.")
    deferred += choice_event(events,322,"accountability-record","gatekeeper","request","Your evidence history can strengthen accountability and still harm people who were not responsible for the wider crisis.","How do you handle the final accountability record?",ACCOUNTABILITY,324,334,"formal-route")
    anchor_event(events,323,"event.campaign.d323.personal-future.v1",["INBOX","CHOICE"],"Personal future/ending lock begins.")
    deferred += choice_event(events,323,"personal-future","sponsor","reflection","The campaign is ending, but your economic and personal life is not.","What future do you choose after the crisis?",FUTURE,330,334,"stay-and-commit")
    message_event(events,324,"relationship-ending","friend","reflection","Whatever you choose next, the relationship between us has a history now. The ending depends on more than whether either of us became rich.")
    country_news(news,325,"personal-future","Postwar opportunity looks different in every adopted country","Each economy has a credible reason to stay and a credible unresolved cost that may make leaving rational.")
    message_event(events,328,"future-deadline","sponsor","follow_up","Your future decision is still open. If you do not answer, the authored default will stand; the ending will remember whether you chose it or allowed it to become the default.")
    anchor_event(events,330,"event.campaign.d330.final-reckoning.v1",["INTERRUPT","NEWS","REPORT"],"World architecture and personal/economic ending resolve.")
    global_news(news,330,"news.campaign.d330.final-reckoning.v1","Econovaria enters its postwar settlement", "The final public record reports the settlement architecture, reconstruction direction, unresolved risks, and major accountability findings without treating Player wealth as a moral score.")
    global_news(news,331,"news.campaign.d331.reckoning.v1","Final reporting records what changed and what remains unresolved","The Meridian system, cross-border institutions, national policies, and private actors enter a new equilibrium rather than a perfect reset.")
    anchor_event(events,333,"event.campaign.d333.reflection.v1",["REPORT"],"Final reflection/report only; no new Contract or crisis obligation.")
    return base_pack("story.content.act8.june.v1",305,334,events,news,
        contract_plans([(314,"settlement-implementation","Settlement implementation, verification, or reconstruction work."),(320,"accountability-reform","Audit, restitution, compliance reform, or institutional rebuilding work."),(326,"personal-future-opportunity","Final career, business, community, or reconstruction opportunity package.")]),
        systems([(305,"peace-repricing","Markets and businesses reprice reconstruction, sanctions, route access, and ownership expectations."),(309,"ceasefire","Conditional easing and settlement state activate."),(310,"restriction-easing","Selected restrictions ease while reconstruction and route expectations move."),(316,"accountability-pricing","Implicated firms face consequences while legitimate reconstruction firms gain under scrutiny."),(327,"peacetime-normalization","War winners and losers confront peacetime demand."),(332,"final-economic-scorecard","Final wealth, liquidity, business, investment, Contract, and systemic outcome report is assembled.")]),
        [308,315,321,329,334], [313,322,323], 8, 40, 30, deferred, incoming, hidden_forbidden=False,
        extra={"worldEndingPlans":["centralized-security","multilateral-reconstruction","regional-corridors","managed-suspension"],"personalEndingFamilies":["Citizen","Magnate","Builder","Broker","Reformer","Collaborator","Exile","Community Leader","Survivor","Stateless Financier"],"reflectionDay":333,"campaignCloseDay":334})


def main() -> None:
    packs = {
        "act3-november-content-pack-v1.json": build_november(),
        "act3-december-content-pack-v1.json": build_december(),
        "act4-january-content-pack-v1.json": build_january(),
        "act4-february-content-pack-v1.json": build_february(),
        "act5-march-content-pack-v1.json": build_march(),
        "act6-april-content-pack-v1.json": build_april(),
        "act7-may-content-pack-v1.json": build_may(),
        "act8-june-content-pack-v1.json": build_june(),
    }
    out_dir = Path("docs/seed-content/story/content")
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, data in packs.items():
        (out_dir / filename).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
