import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  GamePublicRealtimeEnvelope,
  GamePublicRealtimePublishResult,
} from "../../game-dashboard/realtime/gamePublicRealtimePublisher.ts";
import {
  handleStockMarketRunnerRequest,
} from "../../stocks/api/stockMarketRunnerHttpHandler.ts";
import type {
  StockMarketEngineInput,
  StockMarketEngineResult,
} from "../../stocks/contracts/stockMarketEngineContracts.ts";
import type {
  StockMarketRunnerPersistencePayload,
  StockMarketRunnerRepository,
} from "../../stocks/contracts/stockMarketRunnerContracts.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  CreateNotificationDeliveriesInput,
  CreateNotificationDeliveriesResult,
  CreateStoryNotificationInput,
  CreateStoryNotificationResult,
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
  StoryNotificationDeliveryWithNotification,
  StoryNotificationRecord,
  StoryNotificationRepository,
} from "../contracts/storyNotificationContracts.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryContractCreateWriteInput,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import type {
  CreateStoryEventResolutionInput,
  CreateStoryEventResolutionResult,
  GameSessionStorylineRecord,
  ListUnresolvedActiveStorylineEventsInput,
  StoryEventResolutionRecord,
  StorylineEventCandidateRecord,
  StorylineRepository,
} from "../contracts/storylineRepositoryContracts.ts";
import { runDueStorylineEvents } from "./storylineRunner.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SECRET = "runner-secret";
const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000201";
const PLAYER_ID = "00000000-0000-4000-8000-000000000301";
const STORYLINE_ID = "00000000-0000-4000-8000-000000000401";
const ACTIVATION_ID = "00000000-0000-4000-8000-000000000402";
const MARKET_BRIEFING_EVENT_ID = "00000000-0000-4000-8000-000000000501";
const CONTRACT_UNLOCK_EVENT_ID = "00000000-0000-4000-8000-000000000502";
const POLICY_PRESSURE_EVENT_ID = "00000000-0000-4000-8000-000000000503";
const ASSET_ID = "00000000-0000-4000-8000-000000000601";
const FIRST_TICK_AT = "2026-06-25T12:00:01.000Z";

Deno.test("econovaria demo storyline loop resolves cutscene ledger and contract effects idempotently", async () => {
  const stockRepository = new InMemoryStockMarketRunnerRepository();
  const runtime = new InMemoryEconovariaRuntime();

  runtime.createGameSession(GAME_SESSION_ID);
  runtime.createPlayer({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    cashBalance: 500,
  });
  stockRepository.initializeStockMarketAssetsForGame(
    GAME_SESSION_ID,
    "missing_only",
  );

  const seedResult = runtime.initializeDemoStorylineForGame(
    GAME_SESSION_ID,
    "missing_only",
  );
  const runStorylineEventsAfterTick = createStorylineHook(runtime);

  assertEquals(seedResult.storylineKey, "econovaria_demo_act_1");
  assertEquals(seedResult.storylineEventsAvailable, 3);
  assertEquals(seedResult.gameSessionStorylinesInserted, 1);

  const firstTickResponse = await handleStockMarketRunnerRequest(
    runnerRequest({ gameSessionId: GAME_SESSION_ID, tickIndex: 1 }, SECRET),
    {
      createServiceClient: () => ({}) as never,
      readSupabaseEnv: () => ({
        ok: true as const,
        value: {
          supabaseUrl: "https://example.supabase.co",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service-role",
        },
      }),
      readRunnerSecret: () => SECRET,
      createRepository: () => stockRepository,
      calculateNextTick: calculateDeterministicTick,
      createPublicRealtimePublisher: () => new NoopPublicRealtimePublisher(),
      runStorylineEventsAfterTick,
    },
  );
  const firstTickBody = await readJson(firstTickResponse);

  assertEquals(firstTickResponse.status, 200);
  assertEquals(firstTickBody.ok, true);
  assertEquals(firstTickBody.tickIndex, 1);
  assertEquals(runtime.resolutionEventKeys(), ["act_1_market_briefing"]);
  assertEquals(runtime.storyFlagsForGame(GAME_SESSION_ID), {
    demo_act_1_briefing_complete: true,
  });

  const briefingNotification = runtime.notificationForEvent(
    "act_1_market_briefing",
  );
  const briefingDeliveries = runtime.deliveriesForNotification(
    briefingNotification?.id ?? "",
  );

  assertEquals(briefingNotification?.notificationType, "story_cutscene");
  assertEquals(briefingNotification?.displayMode, "modal_on_next_login");
  assertEquals(briefingDeliveries.map((delivery) => delivery.playerId), [
    PLAYER_ID,
  ]);
  assertEquals(
    runtime.ledgerEntries.map((entry) => ({
      functionName: entry.functionName,
      playerId: entry.input.playerId,
      signedAmount: entry.input.signedAmount,
      sourceAction: entry.args.p_source_action,
    })),
    [{
      functionName: "record_player_ledger_entry",
      playerId: PLAYER_ID,
      signedAmount: 75,
      sourceAction: "cash_credit",
    }],
  );
  assertEquals(runtime.playerCashBalance(PLAYER_ID), 500);

  await runStorylineEventsAfterTick({
    gameSessionId: GAME_SESSION_ID,
    currentMarketTick: 1,
    generatedAt: "2026-06-25T12:00:02.000Z",
  });

  assertEquals(runtime.resolutionEventKeys(), [
    "act_1_market_briefing",
    "act_1_contract_unlock",
  ]);
  assertEquals(runtime.contractKeys(), [
    "story_supplier_due_diligence_v1",
  ]);

  const countsBeforeRerun = runtime.snapshotCounts();

  await runStorylineEventsAfterTick({
    gameSessionId: GAME_SESSION_ID,
    currentMarketTick: 1,
    generatedAt: "2026-06-25T12:00:03.000Z",
  });

  assertEquals(runtime.snapshotCounts(), countsBeforeRerun);
  assertEquals(runtime.resolutionEventKeys(), [
    "act_1_market_briefing",
    "act_1_contract_unlock",
  ]);
  assertEquals(runtime.notificationEventKeys(), [
    "act_1_market_briefing",
    "act_1_contract_unlock",
  ]);
  assertEquals(runtime.contractKeys(), [
    "story_supplier_due_diligence_v1",
  ]);
  assertEquals(runtime.ledgerEntries.length, 1);
});

function createStorylineHook(runtime: InMemoryEconovariaRuntime): (
  input: {
    readonly gameSessionId: string;
    readonly currentMarketTick: number;
    readonly generatedAt: string;
  },
) => Promise<void> {
  return async (input) => {
    const playerContexts = await runtime.listPlayerStoryContexts(
      input.gameSessionId,
    );

    await runDueStorylineEvents({
      gameSessionId: input.gameSessionId,
      now: input.generatedAt,
      currentMarketTick: input.currentMarketTick,
      playerContexts,
      repository: runtime,
      notificationRepository: runtime,
      effectDependencies: {
        ledger: runtime,
        policies: runtime,
        flags: runtime,
        impacts: runtime,
        contracts: runtime,
      },
    });
  };
}

class InMemoryStockMarketRunnerRepository
  implements StockMarketRunnerRepository {
  private readonly initializedGameSessionIds = new Set<string>();
  readonly appliedPayloads: StockMarketRunnerPersistencePayload[] = [];

  initializeStockMarketAssetsForGame(
    gameSessionId: string,
    mode: "missing_only" | "reset_empty_only",
  ): void {
    if (
      mode === "reset_empty_only" && this.initializedGameSessionIds.has(
        gameSessionId,
      )
    ) {
      throw new Error("STOCK_MARKET_RESET_EMPTY_ONLY_CONFLICT");
    }

    this.initializedGameSessionIds.add(gameSessionId);
  }

  load(
    input: { readonly gameSessionId: string; readonly tickIndex?: number },
  ) {
    if (!this.initializedGameSessionIds.has(input.gameSessionId)) {
      throw new Error("Stock market assets were not initialized.");
    }

    return Promise.resolve({
      gameSessionId: input.gameSessionId,
      tickIndex: input.tickIndex ?? 1,
      assets: [{
        gameSessionId: input.gameSessionId,
        assetId: ASSET_ID,
        ticker: "AURA",
        companyName: "Aurora Works",
        sector: "TECHNOLOGY",
        countryCode: "SOLVEND",
        currentPrice: 100,
        beta: 1,
        liquidity: 0.8,
        currentVolatility: 0.05,
        longRunVolatility: 0.05,
        recentReturns: [],
      }],
      macro: { gameSessionId: input.gameSessionId },
      countries: [],
      sectors: [],
      shocks: [],
    });
  }

  apply(payload: StockMarketRunnerPersistencePayload) {
    this.appliedPayloads.push(payload);

    return Promise.resolve({
      assetsUpdated: payload.assetUpdates.length,
      ticksInserted: payload.tickRows.length,
    });
  }
}

class InMemoryEconovariaRuntime
  implements StorylineRepository, StoryNotificationRepository {
  private readonly gameSessionIds = new Set<string>();
  private readonly activations: GameSessionStorylineRecord[] = [];
  private readonly events: StorylineEventCandidateRecord[] = [];
  private readonly players = new Map<string, PlayerStoryContext>();
  private readonly resolutions: StoryEventResolutionRecord[] = [];
  private readonly impacts: StoryPlayerImpactWriteInput[] = [];
  private readonly policies: StoryPolicyWriteInput[] = [];
  private readonly flags: {
    readonly id: string;
    readonly gameSessionId: string;
    readonly flagKey: string;
    readonly value: JsonValue;
  }[] = [];
  private readonly notifications: StoryNotificationRecord[] = [];
  private readonly deliveries: StoryNotificationDeliveryRecord[] = [];
  private readonly contracts: {
    readonly id: string;
    readonly input: StoryContractCreateWriteInput;
  }[] = [];
  readonly ledgerEntries: {
    readonly id: string;
    readonly functionName: "record_player_ledger_entry";
    readonly input: StoryCashAdjustmentWriteInput;
    readonly args: Record<string, JsonValue>;
  }[] = [];

  createGameSession(gameSessionId: string): void {
    this.gameSessionIds.add(gameSessionId);
  }

  createPlayer(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly cashBalance: number;
  }): void {
    this.players.set(input.playerId, {
      playerId: input.playerId,
      gameSessionId: input.gameSessionId,
      homeCountryId: null,
      homeCountryCode: null,
      currentCountryId: null,
      currentCountryCode: "SOLVEND",
      cashBalance: input.cashBalance,
      resources: {},
      sectorExposurePct: {},
      countryExposurePct: {},
      activeContractKeys: [],
      completedContractKeys: [],
      storyFlags: {},
    });
  }

  initializeDemoStorylineForGame(
    gameSessionId: string,
    mode: "missing_only" | "reset_empty_only",
  ): {
    readonly gameSessionId: string;
    readonly storylineKey: string;
    readonly storylineEventsAvailable: number;
    readonly gameSessionStorylinesBefore: number;
    readonly gameSessionStorylinesInserted: number;
    readonly gameSessionStorylinesAfter: number;
  } {
    if (!this.gameSessionIds.has(gameSessionId)) {
      throw new Error("GAME_SESSION_NOT_FOUND");
    }

    const before =
      this.activations.filter((activation) =>
        activation.gameSessionId === gameSessionId &&
        activation.storylineId === STORYLINE_ID
      ).length;

    if (mode === "reset_empty_only" && before > 0) {
      throw new Error("DEMO_STORYLINE_RESET_EMPTY_ONLY_CONFLICT");
    }

    this.upsertDemoEvents(gameSessionId);

    if (before === 0) {
      this.activations.push({
        id: ACTIVATION_ID,
        gameSessionId,
        storylineId: STORYLINE_ID,
        status: "active",
        storyStartedAt: "2026-06-25T12:00:00.000Z",
        pausedAt: null,
        accumulatedPauseSeconds: 0,
        timeScale: 1,
        createdAt: "2026-06-25T12:00:00.000Z",
      });
    }

    const after =
      this.activations.filter((activation) =>
        activation.gameSessionId === gameSessionId &&
        activation.storylineId === STORYLINE_ID &&
        activation.status === "active"
      ).length;

    return {
      gameSessionId,
      storylineKey: "econovaria_demo_act_1",
      storylineEventsAvailable:
        this.events.filter((event) => event.storylineId === STORYLINE_ID)
          .length,
      gameSessionStorylinesBefore: before,
      gameSessionStorylinesInserted: before === 0 ? 1 : 0,
      gameSessionStorylinesAfter: after,
    };
  }

  listPlayerStoryContexts(
    gameSessionId: string,
  ): Promise<readonly PlayerStoryContext[]> {
    const storyFlags = this.storyFlagsForGame(gameSessionId);

    return Promise.resolve(
      [...this.players.values()]
        .filter((player) => player.gameSessionId === gameSessionId)
        .map((player) => ({
          ...player,
          activeContractKeys: this.contractKeys(),
          storyFlags,
        })),
    );
  }

  listActiveGameSessionStorylines(
    gameSessionId: string,
  ): Promise<readonly GameSessionStorylineRecord[]> {
    return Promise.resolve(
      this.activations.filter((activation) =>
        activation.gameSessionId === gameSessionId &&
        activation.status === "active"
      ),
    );
  }

  listUnresolvedActiveStorylineEvents(
    input: ListUnresolvedActiveStorylineEventsInput,
  ): Promise<readonly StorylineEventCandidateRecord[]> {
    const resolvedEventIds = new Set(
      this.resolutions
        .filter((resolution) =>
          resolution.gameSessionId === input.gameSessionId
        )
        .map((resolution) => resolution.storylineEventId),
    );

    return Promise.resolve(
      this.events
        .filter((event) =>
          event.gameSessionId === input.gameSessionId &&
          !resolvedEventIds.has(event.id)
        )
        .sort(compareEventOrder),
    );
  }

  createStoryEventResolution(
    input: CreateStoryEventResolutionInput,
  ): Promise<CreateStoryEventResolutionResult> {
    const existing = this.resolutions.find((resolution) =>
      resolution.gameSessionId === input.gameSessionId &&
      resolution.storylineEventId === input.storylineEventId
    );

    if (existing) {
      return Promise.resolve({
        status: "existing",
        resolution: existing,
      });
    }

    const resolution: StoryEventResolutionRecord = {
      id: `resolution-${this.resolutions.length + 1}`,
      gameSessionId: input.gameSessionId,
      storylineEventId: input.storylineEventId,
      resolvedAt: input.resolvedAt,
      resolvedMarketTick: input.resolvedMarketTick ?? null,
      status: input.status ?? "resolved",
      resultPayload: input.resultPayload ?? {},
      createdAt: input.resolvedAt,
    };
    this.resolutions.push(resolution);

    return Promise.resolve({
      status: "inserted",
      resolution,
    });
  }

  createPlayerStoryImpact(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult> {
    return this.createPlayerImpact(input);
  }

  createPlayerImpact(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult> {
    this.impacts.push(input);
    return Promise.resolve({ id: `impact-${this.impacts.length}` });
  }

  upsertGameSessionPolicy(
    input: StoryPolicyWriteInput,
  ): Promise<StoryWriteResult> {
    return this.upsertPolicy(input);
  }

  upsertPolicy(input: StoryPolicyWriteInput): Promise<StoryWriteResult> {
    const existingIndex = this.policies.findIndex((policy) =>
      policy.gameSessionId === input.gameSessionId &&
      policy.policyKey === input.policyKey
    );

    if (existingIndex >= 0) {
      this.policies.splice(existingIndex, 1, input);
      return Promise.resolve({ id: `policy-${existingIndex + 1}` });
    }

    this.policies.push(input);
    return Promise.resolve({ id: `policy-${this.policies.length}` });
  }

  setGameSessionStoryFlag(
    input: StoryFlagWriteInput,
  ): Promise<StoryWriteResult> {
    return this.setStoryFlag(input);
  }

  setStoryFlag(input: StoryFlagWriteInput): Promise<StoryWriteResult> {
    const existing = this.flags.find((flag) =>
      flag.gameSessionId === input.gameSessionId &&
      flag.flagKey === input.flagKey
    );

    if (existing) {
      this.flags.splice(this.flags.indexOf(existing), 1, {
        ...existing,
        value: input.value,
      });
      return Promise.resolve({ id: existing.id });
    }

    const flag = {
      id: `flag-${this.flags.length + 1}`,
      gameSessionId: input.gameSessionId,
      flagKey: input.flagKey,
      value: input.value,
    };
    this.flags.push(flag);

    return Promise.resolve({ id: flag.id });
  }

  listGameSessionStoryFlags(
    gameSessionId: string,
  ): Promise<Record<string, JsonValue>> {
    return Promise.resolve(this.storyFlagsForGame(gameSessionId));
  }

  recordCashAdjustment(
    input: StoryCashAdjustmentWriteInput,
  ): Promise<StoryWriteResult> {
    const existing = this.ledgerEntries.find((entry) =>
      entry.input.idempotencyKey === input.idempotencyKey
    );

    if (existing) {
      return Promise.resolve({ id: existing.id });
    }

    const entry = {
      id: `ledger-${this.ledgerEntries.length + 1}`,
      functionName: "record_player_ledger_entry" as const,
      input,
      args: {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
        p_account_type: "cash",
        p_amount: input.signedAmount,
        p_currency_code: "ECO",
        p_entry_type: input.signedAmount >= 0 ? "credit" : "debit",
        p_source_domain: "storylines",
        p_source_action: input.effectType,
        p_source_id: input.storylineEventId,
        p_created_by_type: "system",
        p_created_by_id: null,
        p_audit_metadata: {
          idempotencyKey: input.idempotencyKey,
          storylineEventId: input.storylineEventId,
          effectType: input.effectType,
          label: input.label,
          reason: input.reason,
          amount: input.amount,
          signedAmount: input.signedAmount,
          payload: input.payload,
          source: "classroom_api_edge_storyline_effect",
        },
      },
    };
    this.ledgerEntries.push(entry);

    return Promise.resolve({ id: entry.id });
  }

  createGameSessionContract(
    input: StoryContractCreateWriteInput,
  ): Promise<StoryWriteResult> {
    const existing = this.contracts.find((contract) =>
      contract.input.gameSessionId === input.gameSessionId &&
      contract.input.contractKey === input.contractKey
    );

    if (existing) {
      return Promise.resolve({ id: existing.id });
    }

    const contract = {
      id: `contract-${this.contracts.length + 1}`,
      input,
    };
    this.contracts.push(contract);

    return Promise.resolve({ id: contract.id });
  }

  createStoryNotification(
    input: CreateStoryNotificationInput,
  ): Promise<CreateStoryNotificationResult> {
    const existing = this.notifications.find((notification) =>
      notification.gameSessionId === input.gameSessionId &&
      notification.sourceType === input.sourceType &&
      notification.sourceId === input.sourceId &&
      notification.notificationType === input.notificationType
    );

    if (existing) {
      return Promise.resolve({
        status: "existing",
        notification: existing,
      });
    }

    const notification: StoryNotificationRecord = {
      id: `notification-${this.notifications.length + 1}`,
      gameSessionId: input.gameSessionId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      notificationType: input.notificationType,
      title: input.title,
      summary: input.summary,
      priority: input.priority,
      displayMode: input.displayMode,
      payload: input.payload,
      publishedAt: input.publishedAt,
    };
    this.notifications.push(notification);

    return Promise.resolve({
      status: "inserted",
      notification,
    });
  }

  createNotificationDeliveries(
    input: CreateNotificationDeliveriesInput,
  ): Promise<CreateNotificationDeliveriesResult> {
    const deliveryIds: string[] = [];
    let insertedCount = 0;
    let existingCount = 0;

    for (const playerId of [...new Set(input.playerIds)]) {
      const existing = this.deliveries.find((delivery) =>
        delivery.notificationId === input.notificationId &&
        delivery.playerId === playerId
      );

      if (existing) {
        deliveryIds.push(existing.id);
        existingCount += 1;
        continue;
      }

      const delivery: StoryNotificationDeliveryRecord = {
        id: `delivery-${this.deliveries.length + 1}`,
        notificationId: input.notificationId,
        gameSessionId: input.gameSessionId,
        playerId,
        deliveredAt: input.deliveredAt,
        seenAt: null,
        dismissedAt: null,
        acknowledgedAt: null,
      };
      this.deliveries.push(delivery);
      deliveryIds.push(delivery.id);
      insertedCount += 1;
    }

    return Promise.resolve({
      deliveryIds,
      insertedCount,
      existingCount,
    });
  }

  listUnseenStoryCutsceneDeliveries(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<readonly StoryNotificationDeliveryWithNotification[]> {
    return Promise.resolve(
      this.deliveries
        .filter((delivery) =>
          delivery.gameSessionId === input.gameSessionId &&
          delivery.playerId === input.playerId &&
          delivery.seenAt === null &&
          delivery.dismissedAt === null
        )
        .flatMap((delivery) => {
          const notification = this.notifications.find((item) =>
            item.id === delivery.notificationId
          );

          return notification ? [{ ...delivery, notification }] : [];
        }),
    );
  }

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(this.markDelivery(input, "seenAt"));
  }

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(this.markDelivery(input, "dismissedAt"));
  }

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(this.markDelivery(input, "acknowledgedAt"));
  }

  storyFlagsForGame(gameSessionId: string): Record<string, JsonValue> {
    const flags: Record<string, JsonValue> = {};

    for (const flag of this.flags) {
      if (flag.gameSessionId === gameSessionId) {
        flags[flag.flagKey] = flag.value;
      }
    }

    return flags;
  }

  resolutionEventKeys(): readonly string[] {
    return this.resolutions.map((resolution) =>
      this.eventKeyById(resolution.storylineEventId)
    );
  }

  notificationEventKeys(): readonly string[] {
    return this.notifications.map((notification) =>
      this.eventKeyById(notification.sourceId ?? "")
    );
  }

  notificationForEvent(eventKey: string): StoryNotificationRecord | null {
    const event = this.events.find((item) => item.eventKey === eventKey);

    if (!event) {
      return null;
    }

    return this.notifications.find((notification) =>
      notification.sourceId === event.id
    ) ?? null;
  }

  deliveriesForNotification(
    notificationId: string,
  ): readonly StoryNotificationDeliveryRecord[] {
    return this.deliveries.filter((delivery) =>
      delivery.notificationId === notificationId
    );
  }

  contractKeys(): readonly string[] {
    return this.contracts.map((contract) => contract.input.contractKey);
  }

  playerCashBalance(playerId: string): number | null {
    return this.players.get(playerId)?.cashBalance ?? null;
  }

  snapshotCounts(): Record<string, number> {
    return {
      resolutions: this.resolutions.length,
      notifications: this.notifications.length,
      deliveries: this.deliveries.length,
      contracts: this.contracts.length,
      ledgerEntries: this.ledgerEntries.length,
      impacts: this.impacts.length,
    };
  }

  private upsertDemoEvents(gameSessionId: string): void {
    const events = [
      demoMarketBriefingEvent(gameSessionId),
      demoContractUnlockEvent(gameSessionId),
      demoPolicyPressureEvent(gameSessionId),
    ];

    for (const event of events) {
      const existingIndex = this.events.findIndex((item) =>
        item.storylineId === event.storylineId &&
        item.eventKey === event.eventKey
      );

      if (existingIndex >= 0) {
        this.events.splice(existingIndex, 1, event);
      } else {
        this.events.push(event);
      }
    }
  }

  private markDelivery(
    input: MarkNotificationDeliveryInput,
    field: "seenAt" | "dismissedAt" | "acknowledgedAt",
  ): StoryNotificationDeliveryRecord {
    const index = this.deliveries.findIndex((delivery) =>
      delivery.id === input.deliveryId &&
      delivery.gameSessionId === input.gameSessionId &&
      delivery.playerId === input.playerId
    );

    if (index < 0) {
      throw new Error("Notification delivery not found.");
    }

    const updated = {
      ...this.deliveries[index],
      [field]: input.markedAt,
    };
    this.deliveries.splice(index, 1, updated);

    return updated;
  }

  private eventKeyById(eventId: string): string {
    return this.events.find((event) => event.id === eventId)?.eventKey ??
      eventId;
  }
}

class NoopPublicRealtimePublisher {
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

function demoMarketBriefingEvent(
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

function demoContractUnlockEvent(
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

function demoPolicyPressureEvent(
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

function storylineEventCandidate(
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

function calculateDeterministicTick(
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

function runnerRequest(body: unknown, secret?: string): Request {
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

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

function compareEventOrder(
  left: StorylineEventCandidateRecord,
  right: StorylineEventCandidateRecord,
): number {
  return left.act - right.act || left.sequence - right.sequence;
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed. Actual: ${actualJson} Expected: ${expectedJson}`,
    );
  }
}
