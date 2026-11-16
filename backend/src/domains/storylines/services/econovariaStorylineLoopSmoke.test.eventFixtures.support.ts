import type {
  GamePublicRealtimeEnvelope,
  GamePublicRealtimePublishResult,
} from "../../game-dashboard/publicRealtime.ts";
import type {
  StockMarketEngineInput,
  StockMarketEngineResult,
} from "../../stocks/contracts/stockMarketEngineContracts.ts";
import type { StorylineEventCandidateRecord } from "../contracts/storylineRepositoryContracts.ts";
import {
  ACTIVATION_ID,
  ASSET_ID,
  CONTRACT_UNLOCK_EVENT_ID,
  FIRST_TICK_AT,
  GAME_SESSION_ID,
  MARKET_BRIEFING_EVENT_ID,
  POLICY_PRESSURE_EVENT_ID,
  STORYLINE_ID,
} from "./econovariaStorylineLoopSmoke.test.constants.support.ts";

export class NoopPublicRealtimePublisher {
  publish<TEvent extends "stock_tick" | "market_news_posted">(
    envelope: GamePublicRealtimeEnvelope<TEvent>,
  ): Promise<GamePublicRealtimePublishResult<TEvent>> {
    return Promise.resolve({
      ok: true as const,
      message: {
        channel: envelope.channel,
        event: envelope.eventType,
        payload: envelope,
      },
    });
  }
}

export function demoMarketBriefingEvent(
  gameSessionId: string,
): StorylineEventCandidateRecord {
  return storylineEventCandidate({
    id: MARKET_BRIEFING_EVENT_ID,
    gameSessionId,
    eventKey: "act_1_market_briefing",
    title: "Market Briefing: Shipping Pressure Builds",
    description:
      "The first market tick introduces a grounded supply-chain pressure event and rewards active players with a small briefing stipend.",
    sequence: 1,
    triggerType: "market_tick",
    scheduledMarketTick: 1,
    revealPayload: {
      notificationType: "story_cutscene",
      displayMode: "modal_on_next_login",
      videoAssetKey: "econovaria_cutscene_market_briefing_v1",
      posterAssetKey: "econovaria_poster_market_briefing_v1",
      headline: "Shipping Pressure Builds",
      summary:
        "Insurance costs and port congestion are beginning to affect regional trade flows.",
      requiresAcknowledgement: false,
      payload: {
        tone: "grounded_market_intel",
        act: 1,
        sequence: 1,
      },
    },
    publicNewsPayload: {
      headline: "Regional shipping costs rise",
      summary:
        "Ports report longer clearance times as insurers reprice route risk.",
      severity: "medium",
    },
    playerRules: [{
      ruleKey: "active_player_briefing_stipend",
      condition: {
        type: "player_cash_above",
        amount: 0,
      },
      effects: [{
        type: "cash_credit",
        amount: 75,
        label: "Market briefing stipend",
        reason:
          "You received a small operating stipend after the first market briefing.",
        payload: {
          source: "econovaria_demo_act_1",
          eventKey: "act_1_market_briefing",
        },
      }, {
        type: "story_flag_set",
        flagKey: "demo_act_1_briefing_complete",
        value: true,
      }],
    }],
    flagPayloads: [{
      flagKey: "demo_act_1_briefing_complete",
      value: true,
    }],
    priority: "major",
  });
}

export function demoContractUnlockEvent(
  gameSessionId: string,
): StorylineEventCandidateRecord {
  return storylineEventCandidate({
    id: CONTRACT_UNLOCK_EVENT_ID,
    gameSessionId,
    eventKey: "act_1_contract_unlock",
    title: "Contract Unlocked: Supplier Due Diligence",
    description:
      "After the briefing flag is set, the storyline unlocks a public contract for market research.",
    sequence: 2,
    triggerType: "condition",
    triggerCondition: {
      type: "story_flag_equals",
      flagKey: "demo_act_1_briefing_complete",
      value: true,
    },
    revealPayload: {
      notificationType: "story_cutscene",
      displayMode: "modal_on_next_login",
      videoAssetKey: "econovaria_cutscene_supplier_due_diligence_v1",
      posterAssetKey: "econovaria_poster_supplier_due_diligence_v1",
      headline: "Supplier Due Diligence Opened",
      summary:
        "Players can now investigate how port disruption affects market access and supplier reliability.",
      requiresAcknowledgement: false,
      payload: {
        tone: "research_prompt",
        act: 1,
        sequence: 2,
      },
    },
    publicNewsPayload: {
      headline: "Research mandate issued",
      summary:
        "Teams are asked to identify exposure to supply-chain disruption.",
      severity: "low",
    },
    playerRules: [{
      ruleKey: "unlock_supplier_due_diligence_contract",
      condition: {
        type: "player_cash_above",
        amount: 0,
      },
      effects: [{
        type: "contract_unlock",
        contractKey: "story_supplier_due_diligence_v1",
        label: "Supplier Due Diligence",
        reason: "A market disruption created a new research contract.",
        payload: {
          title: "Supplier Due Diligence",
          description:
            "Analyze one country or sector exposed to shipping delays and explain the risk to business operations.",
          instructions:
            "Submit a short market note with one risk, one opportunity, and one recommended action.",
          category: "market_research",
          targetingPayload: {
            scope: "all_players",
          },
          requirementsPayload: {
            submissionType: "short_response",
            minimumSentences: 4,
          },
          rewardPayload: {
            cash: {
              amount: 150,
              currencyCode: "ECO",
            },
          },
          metadata: {
            storylineKey: "econovaria_demo_act_1",
            eventKey: "act_1_contract_unlock",
          },
        },
      }],
    }],
    contractUnlockPayloads: [{
      contractKey: "story_supplier_due_diligence_v1",
    }],
    priority: "major",
  });
}

export function demoPolicyPressureEvent(
  gameSessionId: string,
): StorylineEventCandidateRecord {
  return storylineEventCandidate({
    id: POLICY_PRESSURE_EVENT_ID,
    gameSessionId,
    eventKey: "act_1_policy_pressure",
    title: "Policy Shock: Temporary Import Review",
    description:
      "A later market tick applies a temporary global immigration-lock style policy as a visible policy-effect smoke test.",
    sequence: 3,
    triggerType: "market_tick",
    scheduledMarketTick: 2,
    publicNewsPayload: {
      headline: "Temporary import review begins",
      summary:
        "Regulators are reviewing high-risk shipments after early signs of congestion.",
      severity: "medium",
    },
    playerRules: [{
      ruleKey: "temporary_import_review_policy",
      condition: {
        type: "player_cash_above",
        amount: 0,
      },
      effects: [{
        type: "immigration_lock",
        policyKey: "demo_temporary_import_review_v1",
        durationSeconds: 3600,
        label: "Temporary import review",
        reason:
          "Regulators placed a temporary review on cross-border movement.",
        payload: {
          scopeType: "global",
          scopeKey: null,
          severity: "moderate",
          source: "econovaria_demo_act_1",
        },
      }],
    }],
    policyPayloads: [{
      policyKey: "demo_temporary_import_review_v1",
      policyType: "immigration_lock",
      scopeType: "global",
      scopeKey: null,
      durationSeconds: 3600,
      payload: {
        severity: "moderate",
      },
    }],
  });
}

export function storylineEventCandidate(
  overrides: Partial<StorylineEventCandidateRecord>,
): StorylineEventCandidateRecord {
  return {
    id: MARKET_BRIEFING_EVENT_ID,
    storylineId: STORYLINE_ID,
    gameSessionId: GAME_SESSION_ID,
    gameSessionStorylineId: ACTIVATION_ID,
    storyStartedAt: "2026-06-25T12:00:00.000Z",
    accumulatedPauseSeconds: 0,
    timeScale: 1,
    eventKey: "act_1_market_briefing",
    title: "Story Event",
    description: "",
    act: 1,
    sequence: 1,
    triggerType: "market_tick",
    scheduledOffsetSeconds: null,
    scheduledAt: null,
    scheduledMarketTick: null,
    triggerCondition: {},
    revealPayload: {},
    publicNewsPayload: {},
    playerRules: [],
    policyPayloads: [],
    flagPayloads: [],
    contractUnlockPayloads: [],
    priority: "normal",
    createdAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

export function calculateDeterministicTick(
  input: StockMarketEngineInput,
): StockMarketEngineResult {
  return {
    gameSessionId: input.gameSessionId,
    seed: input.seed,
    tickIndex: input.tickIndex,
    generatedAt: FIRST_TICK_AT,
    rows: [{
      gameSessionId: input.gameSessionId,
      ticker: "AURA",
      companyName: "Aurora Works",
      sector: "TECHNOLOGY",
      currentPrice: 105,
      changePct: "5.00%",
      previousClose: 100,
      openPrice: 100,
      dayHigh: 105,
      dayLow: 100,
      volume: 1000,
      marketCap: 105000000,
      beta: 1,
      history: [{
        gameSessionId: input.gameSessionId,
        tickIndex: input.tickIndex,
        timestamp: FIRST_TICK_AT,
        label: "Tick 1",
        price: 105,
        volume: 1000,
      }],
      lastUpdated: FIRST_TICK_AT,
      trend: "up",
      assetType: "Stock",
    }],
    ticks: [{
      gameSessionId: input.gameSessionId,
      tickIndex: input.tickIndex,
      assetId: ASSET_ID,
      ticker: "AURA",
      price: 105,
      previousPrice: 100,
      logReturn: 0.04879016,
      changePct: 5,
      volume: 1000,
      currentVolatility: 0.05,
      longRunVolatility: 0.05,
      createdAt: FIRST_TICK_AT,
      explanation: {
        gameSessionId: input.gameSessionId,
        tickIndex: input.tickIndex,
        ticker: "AURA",
        headline: "AURA rises",
        summary: "Market pressure moved AURA.",
        studentText: "AURA moved because modeled market factors changed.",
        components: {
          marketFactorPct: 1,
          countryFactorPct: 1,
          sectorFactorPct: 1,
          fundamentalsFactorPct: 1,
          regimeFactorPct: 0,
          shockFactorPct: 0,
          volatilityNoisePct: 1,
          momentumFactorPct: 0,
          meanReversionFactorPct: 0,
          finalReturnPct: 5,
        },
        appliedShockIds: [],
        regime: "sideways",
      },
    }],
    explanations: [],
  };
}

export function runnerRequest(body: unknown, secret?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });

  if (secret) {
    headers.set("x-stock-market-runner-secret", secret);
  }

  return new Request("https://example.test/stock-market-runner", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
