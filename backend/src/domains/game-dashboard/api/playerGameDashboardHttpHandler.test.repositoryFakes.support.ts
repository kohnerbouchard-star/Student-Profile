import type {
  PlayerGameDashboardReadInput,
  PlayerGameDashboardRepository,
  PlayerGameDashboardSnapshot,
  PlayerGameDashboardStoryNotificationRepository,
} from "../contracts/playerGameDashboardContracts.ts";
import type {
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
} from "../../storylines/server/notificationCapabilities.ts";
import { STORY_NOTIFICATION_ID } from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import { FakeQueryBuilder } from "./playerGameDashboardHttpHandler.test.queryFake.support.ts";
import { compareValues } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";

export class CapturingRepository implements PlayerGameDashboardRepository {
  readonly inputs: PlayerGameDashboardReadInput[] = [];

  async read(
    input: PlayerGameDashboardReadInput,
  ): Promise<PlayerGameDashboardSnapshot> {
    this.inputs.push(input);

    return {
      gameSession: {
        id: input.gameSessionId,
        name: "Period 1",
        status: "active",
        marketStatus: "open",
        currentTick: 0,
        updatedAt: null,
      },
      me: {
        playerId: input.playerId,
        displayName: input.playerDisplayName,
        rosterLabel: input.playerRosterLabel,
        countryCode: null,
        netWorth: 0,
        cash: {
          balances: [],
          primaryCurrencyCode: null,
          totalBalance: 0,
        },
        stocks: {
          portfolio: {
            cashBalance: 0,
            holdingsMarketValue: 0,
            totalEquity: 0,
            totalCostBasis: 0,
            unrealizedPnl: 0,
            realizedPnl: 0,
            positionsCount: 0,
          },
          holdings: [],
          orders: [],
          trades: [],
        },
        store: {
          currencyCode: null,
          listings: [],
          inventory: [],
          recentPurchases: [],
        },
        contracts: {
          available: [],
          progress: [],
        },
      },
      public: {
        leaderboard: [],
        players: [],
        market: {
          stocks: [],
          news: [],
        },
        contracts: [],
        storeListings: [],
      },
      unseenCutscenes: [],
    };
  }
}

export class CapturingStoryNotificationReader
  implements PlayerGameDashboardStoryNotificationRepository {
  readonly readCalls = 0;

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input, {
      seenAt: input.markedAt,
    }));
  }

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input, {
      dismissedAt: input.markedAt,
    }));
  }

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input, {
      acknowledgedAt: input.markedAt,
    }));
  }
}

export function deliveryRecord(
  input: MarkNotificationDeliveryInput,
  overrides: Partial<StoryNotificationDeliveryRecord> = {},
): StoryNotificationDeliveryRecord {
  return {
    id: input.deliveryId,
    notificationId: STORY_NOTIFICATION_ID,
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    deliveredAt: "2026-06-24T00:12:30.000Z",
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

export class FakeClient {
  readonly forbiddenCalls: string[] = [];
  readonly trace: unknown[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
    readonly failTable: string | null = null,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }

  async rpc(functionName: string, args: Record<string, unknown> = {}) {
    this.trace.push({ rpc: functionName, args });
    if (functionName === "is_stock_market_open_at") {
      return { data: true, error: null };
    }
    if (functionName === "read_game_stock_positions_v1") {
      const rows = this.tables.stock_positions ?? this.tables.stock_holdings ??
        [];
      return {
        data: rows.filter((row) =>
          row.game_session_id === args.p_game_session_id
        ).map((row) => ({
          ...row,
          listing_currency_code: this.tables.game_session_stock_assets.find((
            a,
          ) => a.id === row.stock_asset_id)?.listing_currency_code,
        })),
        error: null,
      };
    }
    if (functionName !== "read_latest_stock_market_ticks_for_game") {
      this.forbiddenCalls.push(`rpc:${functionName}`);
      return {
        data: null,
        error: { message: `Unexpected RPC ${functionName}` },
      };
    }

    const gameSessionId = args.p_game_session_id;
    const ticker = args.p_ticker;
    const rows = (this.tables.stock_price_ticks ?? [])
      .filter((row) => row.game_session_id === gameSessionId)
      .filter((row) =>
        ticker === null || ticker === undefined || row.ticker === ticker
      );
    const latestByAssetId = new Map<string, Record<string, unknown>>();

    for (const row of rows) {
      const assetId = String(row.stock_asset_id);
      const existing = latestByAssetId.get(assetId);

      if (
        !existing ||
        compareValues(row.tick_index, existing.tick_index) > 0 ||
        (
          row.tick_index === existing.tick_index &&
          compareValues(row.created_at, existing.created_at) > 0
        )
      ) {
        latestByAssetId.set(assetId, row);
      }
    }

    return { data: [...latestByAssetId.values()], error: null };
  }
}
