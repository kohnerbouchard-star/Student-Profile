import type { JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  StoryNotificationDeliveryRecord,
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
  GameSessionStorylineRecord,
  ListUnresolvedActiveStorylineEventsInput,
  StorylineEventCandidateRecord,
  StorylineRepository,
} from "../contracts/storylineRepositoryContracts.ts";
import {
  ACTIVATION_ID,
  STORYLINE_ID,
} from "./econovariaStorylineLoopSmoke.test.constants.support.ts";
import { InMemoryNotificationStore } from "./econovariaStorylineLoopSmoke.test.notificationStore.support.ts";
import {
  demoContractUnlockEvent,
  demoMarketBriefingEvent,
  demoPolicyPressureEvent,
} from "./econovariaStorylineLoopSmoke.test.eventFixtures.support.ts";
import { StorylineExecutionFixture } from "./storylineExecutionFixture.test.support.ts";
import { compareEventOrder } from "./econovariaStorylineLoopSmoke.test.assertions.support.ts";

export class InMemoryEconovariaRuntime extends InMemoryNotificationStore
  implements StorylineRepository, StoryNotificationRepository {
  private readonly gameSessionIds = new Set<string>();
  private readonly activations: GameSessionStorylineRecord[] = [];
  private readonly events: StorylineEventCandidateRecord[] = [];
  private readonly players = new Map<string, PlayerStoryContext>();
  readonly executionRepository = new StorylineExecutionFixture();
  private readonly impacts: StoryPlayerImpactWriteInput[] = [];
  private readonly policies: StoryPolicyWriteInput[] = [];
  private readonly flags: {
    readonly id: string;
    readonly gameSessionId: string;
    readonly flagKey: string;
    readonly value: JsonValue;
  }[] = [];
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
      this.executionRepository.finalized
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

  createStoryEventResolution(): never {
    throw new Error("Story loop must finalize through the execution repository.");
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
        p_account_type: "checking",
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
    return this.executionRepository.finalized.map((resolution) =>
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
      resolutions: this.executionRepository.finalized.length,
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

  private eventKeyById(eventId: string): string {
    return this.events.find((event) => event.id === eventId)?.eventKey ??
      eventId;
  }
}
