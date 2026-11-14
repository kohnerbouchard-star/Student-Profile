import { SupabasePlayerStoryDeliveryRepository } from "./supabasePlayerStoryDeliveryRepository.ts";

export const GAME = "00000000-0000-4000-8000-000000000001";
export const PLAYER = "00000000-0000-4000-8000-000000000021";
export const DELIVERY_UUID = "00000000-0000-4000-8000-000000000101";
export const NOTIFICATION_UUID = "00000000-0000-4000-8000-000000000201";
export const DELIVERY = "ndl_00000000000000000000000000000001";
export const NOTIFICATION = "ntf_00000000000000000000000000000001";
export const NOW = "2026-07-20T03:00:00.000Z";
export const LATER = "2026-07-20T04:00:00.000Z";
export const DELIVERY_SELECT =
  "id,public_delivery_id,notification_id,game_session_id,player_id,delivered_at,seen_at,dismissed_at,acknowledged_at";
export const NOTIFICATION_SELECT =
  "id,public_notification_id,game_session_id,notification_type,title,summary,priority,display_mode,payload,published_at";

export function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION_UUID,
    public_notification_id: NOTIFICATION,
    game_session_id: GAME,
    notification_type: "story_cutscene",
    title: "Briefing",
    summary: "Update",
    priority: "major",
    display_mode: "modal_on_next_login",
    published_at: NOW,
    payload: {
      videoAssetKey: "cutscene-1",
      posterAssetKey: "poster-1",
      requiresAcknowledgement: false,
      tone: "briefing",
      act: 1,
      sequence: 2,
    },
    ...overrides,
  };
}

export function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_UUID,
    public_delivery_id: DELIVERY,
    notification_id: NOTIFICATION_UUID,
    game_session_id: GAME,
    player_id: PLAYER,
    delivered_at: NOW,
    seen_at: null,
    dismissed_at: null,
    acknowledged_at: null,
    ...overrides,
  };
}

export type Response = {
  data: unknown;
  error: { code?: string; message: string } | null;
};
export const ok = (data: unknown): Response => ({ data, error: null });
export const fail = (message: string, code?: string): Response => ({
  data: null,
  error: { message, code },
});

export function harness(responses: readonly Response[]) {
  const trace: unknown[][] = [];
  let consumed = 0;
  function response() {
    const next = responses[consumed++];
    if (!next) throw new Error("Unexpected database request");
    return Promise.resolve(next);
  }
  const client = {
    from(table: string) {
      trace.push(["from", table]);
      const builder = {
        select(columns: string) {
          trace.push(["select", columns]);
          return builder;
        },
        update(values: unknown) {
          trace.push(["update", values]);
          return builder;
        },
        eq(column: string, value: unknown) {
          trace.push(["eq", column, value]);
          return builder;
        },
        in(column: string, values: unknown) {
          trace.push(["in", column, values]);
          return builder;
        },
        is(column: string, value: unknown) {
          trace.push(["is", column, value]);
          return builder;
        },
        order(column: string, options: unknown) {
          trace.push(["order", column, options]);
          return builder;
        },
        limit(count: number) {
          trace.push(["limit", count]);
          return builder;
        },
        maybeSingle() {
          trace.push(["maybeSingle"]);
          return response();
        },
        then(
          resolve: (value: Response) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          trace.push(["await"]);
          return response().then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return {
    repo: new SupabasePlayerStoryDeliveryRepository(client as never),
    trace,
    consumed: () => consumed,
  };
}

export const listInput = { gameId: GAME, playerUuid: PLAYER, limit: 10 };
export const stateInput = {
  gameId: GAME,
  playerUuid: PLAYER,
  publicDeliveryId: DELIVERY,
  action: "seen" as const,
  markedAt: LATER,
};

export function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}

export async function errorCode(run: () => Promise<unknown>, code: string) {
  try {
    await run();
  } catch (error) {
    const failure = error as {
      code: string;
      message: string;
      status?: number;
      retryable?: boolean;
    };
    equal(failure.code, code);
    return failure;
  }
  throw new Error(`Expected ${code}`);
}
