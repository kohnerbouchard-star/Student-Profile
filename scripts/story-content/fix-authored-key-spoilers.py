from __future__ import annotations

from pathlib import Path


def load(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def save(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, *, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"recovery marker missing for {label}")
    return text.replace(old, new, 1)


# 1. Make author-only stable-key spoiler repair idempotent and exhaustive.
consolidated_path = "scripts/story-content/build-act3-act8-packs.py"
consolidated = load(consolidated_path)
consolidated = consolidated.replace("false-calm", "year-end-stabilization")
consolidated = consolidated.replace("pre-attack", "verification")
if "false-calm" in consolidated or "pre-attack" in consolidated:
    raise SystemExit("author-only spoiler token remains in consolidated builder")

# 2. Materialize every consolidated cross-month callback as a real Story event.
helper_marker = "def materialize_cross_month_callback"
if helper_marker not in consolidated:
    boundary = "    return deferred\n\n\ndef message_event(events: list[dict], day: int, slug: str, role: str, purpose: str, body: str, delivery: list[str] | None = None) -> None:\n"
    helper = '''    return deferred\n\n\ndef materialize_cross_month_callback(events: list[dict], source_day: int, callback_day: int, slug: str, role: str, options: list[dict], callback_role: str | None = None) -> None:\n    callback_rules = []\n    for code, cfg in COUNTRIES.items():\n        interaction = f"interaction.story.{cfg['slug']}.d{source_day:03d}.{slug}.v1"\n        for option in options:\n            callback_rules.append({\n                "ruleKey": f"{cfg['slug']}.d{callback_day:03d}.{slug}.{option['choiceKey']}",\n                "condition": choice_condition(interaction, option["choiceKey"]),\n                "effects": [relationship(code, callback_role or role, f"Your earlier choice was {option['label'].lower()}.", **callback_deltas(option["choiceKey"]))],\n            })\n    events.append(event(callback_day, f"event.campaign.d{callback_day:03d}.{slug}-callback.v1", ["SYSTEM"], callback_rules, f"Executable S4 cross-month callback for Day {source_day} {slug} choice."))\n\n\ndef message_event(events: list[dict], day: int, slug: str, role: str, purpose: str, body: str, delivery: list[str] | None = None) -> None:\n'''
    consolidated = replace_once(consolidated, boundary, helper, label="cross-month callback helper")

january_incoming = '    incoming=[{"sourcePack":"story.content.act3.december.v1","sourceDay":153,"targetDay":155,"eventKey":"event.campaign.d155.year-end-stabilization-posture-callback.v1","notes":"Resolve December year-end-stabilization posture before cargo-record escalation."}]\n'
if 'materialize_cross_month_callback(events,153,155,"year-end-stabilization-posture"' not in consolidated:
    consolidated = replace_once(
        consolidated,
        january_incoming,
        january_incoming + '    materialize_cross_month_callback(events,153,155,"year-end-stabilization-posture","sponsor",CALM)\n',
        label="December to January callback",
    )

april_incoming = '    incoming=[{"sourcePack":"story.content.act5.march.v1","sourceDay":243,"targetDay":245,"eventKey":"event.campaign.d245.wartime-evidence-disclosure-callback.v1","notes":"Resolve March evidence choice before war-economy expansion."}]\n'
if 'materialize_cross_month_callback(events,243,245,"wartime-evidence-disclosure"' not in consolidated:
    consolidated = replace_once(
        consolidated,
        april_incoming,
        april_incoming + '    materialize_cross_month_callback(events,243,245,"wartime-evidence-disclosure","gatekeeper",DISCLOSURE)\n',
        label="March to April callback",
    )

june_incoming = '    incoming=[{"sourcePack":"story.content.act7.may.v1","sourceDay":302,"targetDay":306,"eventKey":"event.campaign.d306.peace-architecture-callback.v1","notes":"Resolve May settlement preference into June advocacy/opportunity access."}]\n'
if 'materialize_cross_month_callback(events,302,306,"peace-architecture"' not in consolidated:
    consolidated = replace_once(
        consolidated,
        june_incoming,
        june_incoming + '    materialize_cross_month_callback(events,302,306,"peace-architecture","lead",PEACE)\n',
        label="May to June callback",
    )

compile(consolidated, consolidated_path, "exec")
save(consolidated_path, consolidated)

# 3. Materialize September -> October rather than leaving Day 64 as metadata only.
october_path = "scripts/story-content/build-act2-october-pack.py"
october = load(october_path)
callback_event_key = "event.campaign.d064.boom-cost-callback.v1"
if callback_event_key not in october:
    anchor = '    events: list[dict] = [event(64, "event.campaign.d064.competing-models-formal.v1", ["NEWS", "COUNTRY FEED"], [], "Formal competing-model anchor. September Day 61 callbacks are carried in incomingCallbackPlans for cross-pack seed reconciliation.")]\n'
    materialized = anchor + '''    callback_rules = []\n    for code, cfg in COUNTRIES.items():\n        interaction = f"interaction.story.{cfg['slug']}.d061.boom-costs.v1"\n        for index, option in enumerate(SEPTEMBER_COST):\n            choice = option["choiceKey"]\n            effect = relationship(code, "sponsor", f"Your September boom-cost choice was {option['label'].lower()}.", respect=4 + index)\n            if choice == "target-help":\n                effect = relationship(code, "sponsor", f"Your September boom-cost choice was {option['label'].lower()}.", trust=6, respect=5)\n            if choice == "pass-through-cost":\n                effect = relationship(code, "sponsor", f"Your September boom-cost choice was {option['label'].lower()}.", respect=5, suspicion=2)\n            callback_rules.append({"ruleKey": f"{cfg['slug']}.d064.boom-costs.{choice}", "condition": choice_condition(interaction, choice), "effects": [effect]})\n    events.append(event(64, "event.campaign.d064.boom-cost-callback.v1", ["SYSTEM"], callback_rules, "Executable S4 callback for the September Day 61 boom-cost choice."))\n'''
    october = replace_once(october, anchor, materialized, label="September to October callback")
compile(october, october_path, "exec")
save(october_path, october)

# 4. Let a monthly target pack validate only explicitly declared incoming callback events.
monthly_path = "backend/src/domains/storylines/tests/monthlyStoryContentPackContract.test.ts"
monthly = load(monthly_path)
monthly = replace_once(
    monthly,
    'type CallbackRecord = {\n  readonly day: number;\n  readonly interactionKey: string;\n  readonly choiceKey: string;\n};',
    'type CallbackRecord = {\n  readonly day: number;\n  readonly eventKey: string;\n  readonly interactionKey: string;\n  readonly choiceKey: string;\n};',
    label="callback event identity",
)
monthly = replace_once(
    monthly,
    '  const deferred = Array.isArray(pack.deferredCallbacks)\n    ? arrayOfRecords(pack.deferredCallbacks, "deferredCallbacks")\n    : [];\n\n  const interactions = new Map<string, InteractionRecord>();',
    '  const deferred = Array.isArray(pack.deferredCallbacks)\n    ? arrayOfRecords(pack.deferredCallbacks, "deferredCallbacks")\n    : [];\n  const incoming = Array.isArray(pack.incomingCallbackPlans)\n    ? arrayOfRecords(pack.incomingCallbackPlans, "incomingCallbackPlans")\n    : [];\n  const incomingEventKeys = new Set(incoming.map((item) => safePublicKey(item.eventKey, "incoming callback eventKey")));\n\n  const interactions = new Map<string, InteractionRecord>();',
    label="incoming callback declarations",
)
monthly = replace_once(
    monthly,
    '    safePublicKey(event.eventKey, `Day ${day} eventKey`);',
    '    const eventKey = safePublicKey(event.eventKey, `Day ${day} eventKey`);',
    label="event key capture",
)
monthly = replace_once(
    monthly,
    '        callbacks.push({ day, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });',
    '        callbacks.push({ day, eventKey, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });',
    label="local callback identity",
)
monthly = replace_once(
    monthly,
    '    safePublicKey(item.eventKey, "deferred eventKey");',
    '    const eventKey = safePublicKey(item.eventKey, "deferred eventKey");',
    label="deferred event key capture",
)
monthly = replace_once(
    monthly,
    '    callbacks.push({ day, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });',
    '    callbacks.push({ day, eventKey, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });',
    label="deferred callback identity",
)
monthly = replace_once(
    monthly,
    '    if (!interaction) {\n      throw new Error(`Callback references unknown interaction ${callback.interactionKey}.`);\n    }',
    '    if (!interaction) {\n      if (incomingEventKeys.has(callback.eventKey)) continue;\n      throw new Error(`Callback references unknown interaction ${callback.interactionKey}.`);\n    }',
    label="declared incoming callback allowance",
)
save(monthly_path, monthly)

# 5. Strengthen the whole-campaign test: declarations must resolve to executable target rules/effects.
campaign_path = "scripts/story-content-all-packs-contract.test.mjs"
campaign = load(campaign_path)
proof_marker = "Cross-month callback executable coverage mismatch"
if proof_marker not in campaign:
    insertion_point = '  if (!incoming) throw new Error(`${targetPackId} does not acknowledge the Day ${sourceDay} -> Day ${targetDay} callback handoff.`);\n'
    proof = insertion_point + '''\n  const eventKeys = new Set(deferred.map((item) => item.eventKey));\n  if (eventKeys.size !== 1) throw new Error(`${sourcePackId} Day ${sourceDay} callback handoff must resolve to one stable target eventKey.`);\n  const [callbackEventKey] = [...eventKeys];\n  const callbackEvent = (target.storyEvents ?? []).find((item) => item.day === targetDay && item.eventKey === callbackEventKey);\n  if (!callbackEvent) throw new Error(`${targetPackId} is missing executable callback event ${callbackEventKey} on Day ${targetDay}.`);\n  const expectedCallbacks = new Set(deferred.map((item) => `${item.condition?.interactionKey}::${item.condition?.choiceKey}`));\n  const actualCallbacks = new Set();\n  for (const rule of callbackEvent.playerRules ?? []) {\n    const condition = rule.condition ?? {};\n    if (condition.type !== "player_story_choice_is") continue;\n    const identity = `${condition.interactionKey}::${condition.choiceKey}`;\n    actualCallbacks.add(identity);\n    if (!Array.isArray(rule.effects) || rule.effects.length < 1) {\n      throw new Error(`${callbackEventKey} has a callback rule without an executable effect.`);\n    }\n    if (rule.effects.some((effect) => effect?.type !== "relationship_adjust")) {\n      throw new Error(`${callbackEventKey} cross-month callback must use the proven relationship_adjust effect contract.`);\n    }\n  }\n  if (actualCallbacks.size !== expectedCallbacks.size || [...expectedCallbacks].some((key) => !actualCallbacks.has(key))) {\n    throw new Error(`Cross-month callback executable coverage mismatch for ${sourcePackId} -> ${targetPackId}.`);\n  }\n'''
    campaign = replace_once(campaign, insertion_point, proof, label="whole-campaign executable callback proof")
save(campaign_path, campaign)

print("S5 source recovery corrections applied idempotently")
