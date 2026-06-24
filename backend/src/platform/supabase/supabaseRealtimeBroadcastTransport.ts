export interface SupabaseRealtimeBroadcastClient {
  channel(
    topic: string,
    options?: unknown,
  ): SupabaseRealtimeBroadcastChannel;
  removeChannel?(
    channel: SupabaseRealtimeBroadcastChannel,
  ): PromiseLike<unknown> | unknown;
}

export interface SupabaseRealtimeBroadcastChannel {
  send(
    message: SupabaseRealtimeBroadcastPayload,
  ):
    | PromiseLike<SupabaseRealtimeBroadcastSendResult>
    | SupabaseRealtimeBroadcastSendResult;
}

export interface SupabaseRealtimeBroadcastPayload {
  readonly type: "broadcast";
  readonly event: string;
  readonly payload: unknown;
}

export type SupabaseRealtimeBroadcastSendResult =
  | "ok"
  | "timed out"
  | "error"
  | string;

export interface SupabaseRealtimeBroadcastMessage {
  readonly channel: string;
  readonly event: string;
  readonly payload: unknown;
}

export type SupabaseRealtimeBroadcastTransportResult =
  | { readonly ok: true }
  | {
    readonly ok: false;
    readonly error: {
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    };
  };

export class SupabaseRealtimeBroadcastTransport {
  constructor(private readonly client: SupabaseRealtimeBroadcastClient) {}

  async send(
    message: SupabaseRealtimeBroadcastMessage,
  ): Promise<SupabaseRealtimeBroadcastTransportResult> {
    let channel: SupabaseRealtimeBroadcastChannel | null = null;

    try {
      channel = this.client.channel(message.channel);

      const result = await channel.send({
        type: "broadcast",
        event: message.event,
        payload: message.payload,
      });

      return mapBroadcastSendResult(result);
    } catch (_error) {
      return {
        ok: false,
        error: {
          code: "supabase_realtime_broadcast_failed",
          message: "Supabase realtime broadcast failed.",
          retryable: true,
        },
      };
    } finally {
      if (channel && this.client.removeChannel) {
        try {
          await this.client.removeChannel(channel);
        } catch (_error) {
          // Channel cleanup failure should not change the broadcast result.
        }
      }
    }
  }
}

function mapBroadcastSendResult(
  result: SupabaseRealtimeBroadcastSendResult,
): SupabaseRealtimeBroadcastTransportResult {
  if (result === "ok") {
    return { ok: true };
  }

  if (result === "timed out") {
    return {
      ok: false,
      error: {
        code: "supabase_realtime_broadcast_timed_out",
        message: "Supabase realtime broadcast timed out.",
        retryable: true,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "supabase_realtime_broadcast_failed",
      message: "Supabase realtime broadcast failed.",
      retryable: true,
    },
  };
}
