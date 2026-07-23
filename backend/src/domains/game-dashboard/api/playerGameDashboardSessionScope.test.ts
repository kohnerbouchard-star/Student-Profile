import {
  handlePlayerGameDashboardRequest,
} from "./playerGameDashboardHttpHandler.ts";

import type {
  PlayerGameDashboardReadInput,
} from "../contracts/playerGameDashboardContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";

Deno.test(
  "player dashboard derives game scope from the authenticated session when the query omits gameSessionId",
  async () => {
    let capturedGameSessionId = "";

    const response = await handlePlayerGameDashboardRequest(
      new Request("https://example.test/players/me/game/dashboard", {
        method: "GET",
        headers: {
          "x-player-session-token": "ps_player_session",
        },
      }),
      {
        readSupabaseEnv: () => ({
          ok: true,
          value: {} as never,
        }),
        createServiceClient: () => ({} as never),
        hashSessionToken: async () => "session-token-hash",
        resolvePlayerSession: async () => ({
          ok: true,
          session: {
            id: PLAYER_SESSION_ID,
            game_session_id: GAME_SESSION_ID,
            player_id: PLAYER_ID,
            status: "active",
            expires_at: "2099-01-01T00:00:00.000Z",
            revoked_at: null,
          },
          player: {
            id: PLAYER_ID,
            display_name: "Avery",
            roster_label: "A-1",
            player_identifier: "CARD-200",
            status: "active",
          },
        } as never),
        createRepository: () => ({
          read: async (input: PlayerGameDashboardReadInput) => {
            capturedGameSessionId = input.gameSessionId;
            return {
              gameSession: {
                id: GAME_SESSION_ID,
                name: "Period 1",
                status: "active",
                marketStatus: "open",
                currentTick: 1,
                updatedAt: null,
              },
              me: {
                playerId: "CARD-200",
                displayName: "Avery",
                rosterLabel: "A-1",
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
            } as never;
          },
        }),
      },
    );

    if (response.status !== 200) {
      throw new Error(`Expected dashboard status 200, received ${response.status}.`);
    }

    if (capturedGameSessionId !== GAME_SESSION_ID) {
      throw new Error(
        "Dashboard repository did not receive the game scope derived from the authenticated player session.",
      );
    }
  },
);
