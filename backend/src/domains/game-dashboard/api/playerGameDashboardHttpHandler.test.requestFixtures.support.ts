import {
  createDashboardStoreListingsReadQuery,
  DashboardStoreListingsReadError,
} from "../../store/dashboardReadModel.ts";
export {
  createDashboardStoreListingsReadQuery,
  DashboardStoreListingsReadError,
};
import { StockMarketOpenStateReadError } from "../../stocks/index.ts";
import type {
  PlayerGameDashboardRepository,
  PlayerGameDashboardStoryNotificationRepository,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  GAME_SESSION_ID,
  STORY_DELIVERY_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import { FakeClient } from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { assertEquals } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";

export async function assertMarketOpenReadError(
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof StockMarketOpenStateReadError)) {
    throw new Error("Expected the existing market-open error type");
  }
  assertEquals(caught.message, message);
}

export function dependencies(options: {
  readonly client?: FakeClient;
  readonly repository?: PlayerGameDashboardRepository;
  readonly storyNotificationRepository?:
    PlayerGameDashboardStoryNotificationRepository;
} = {}): any {
  const client = options.client ?? new FakeClient(tables());

  return {
    createServiceClient: () => client as any,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    hashSessionToken: async () => "session-token-hash",
    now: () => "2026-06-25T12:30:00.000Z",
    createRepository: options.repository ? () => options.repository : undefined,
    createStoryNotificationRepository: options.storyNotificationRepository
      ? () => options.storyNotificationRepository
      : undefined,
  };
}

export function request(options: {
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly runnerSecret?: string;
  readonly extraQuery?: string;
  readonly playerSessionIdHeader?: string;
} = {}): Request {
  const query = new URLSearchParams({
    gameSessionId: options.gameSessionId ?? GAME_SESSION_ID,
  });
  const suffix = options.extraQuery ? `&${options.extraQuery}` : "";
  const headers = new Headers();

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  if (options.playerSessionIdHeader) {
    headers.set("x-player-session-id", options.playerSessionIdHeader);
  }

  return new Request(
    `https://example.test/players/me/game/dashboard?${query}${suffix}`,
    { method: "GET", headers },
  );
}

export function cutsceneActionRequest(options: {
  readonly action?:
    | "mark_cutscene_seen"
    | "mark_cutscene_dismissed"
    | "mark_cutscene_acknowledged";
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly deliveryId?: string;
  readonly runnerSecret?: string;
  readonly extraQuery?: string;
  readonly bodyOverrides?: Record<string, unknown>;
} = {}): Request {
  const headers = new Headers({
    "content-type": "application/json",
  });
  const query = options.extraQuery ? `?${options.extraQuery}` : "";

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  return new Request(
    `https://example.test/players/me/game/dashboard${query}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: options.action ?? "mark_cutscene_seen",
        gameSessionId: options.gameSessionId ?? GAME_SESSION_ID,
        deliveryId: options.deliveryId ?? STORY_DELIVERY_ID,
        ...options.bodyOverrides,
      }),
    },
  );
}
