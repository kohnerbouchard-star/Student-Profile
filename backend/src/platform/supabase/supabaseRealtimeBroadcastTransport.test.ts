import {
  type SupabaseRealtimeBroadcastPayload,
  SupabaseRealtimeBroadcastTransport,
} from "./supabaseRealtimeBroadcastTransport.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const CHANNEL = "game:00000000-0000-4000-8000-000000000001:public";

Deno.test("supabase realtime broadcast transport sends broadcast payload to the channel", async () => {
  const client = new CapturingBroadcastClient("ok");
  const transport = new SupabaseRealtimeBroadcastTransport(client);
  const payload = {
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    eventType: "stock_tick",
  };

  const result = await transport.send({
    channel: CHANNEL,
    event: "stock_tick",
    payload,
  });

  assertEquals(result, { ok: true });
  assertEquals(client.channelTopics, [CHANNEL]);
  assertEquals(client.sentPayloads, [{
    type: "broadcast",
    event: "stock_tick",
    payload,
  }]);
  assertEquals(client.removedChannels, 1);
});

Deno.test("supabase realtime broadcast transport maps non-ok send results", async () => {
  const timedOut = await new SupabaseRealtimeBroadcastTransport(
    new CapturingBroadcastClient("timed out"),
  ).send({
    channel: CHANNEL,
    event: "stock_tick",
    payload: { ok: true },
  });
  const failed = await new SupabaseRealtimeBroadcastTransport(
    new CapturingBroadcastClient("error"),
  ).send({
    channel: CHANNEL,
    event: "stock_tick",
    payload: { ok: true },
  });

  assertEquals(timedOut, {
    ok: false,
    error: {
      code: "supabase_realtime_broadcast_timed_out",
      message: "Supabase realtime broadcast timed out.",
      retryable: true,
    },
  });
  assertEquals(failed, {
    ok: false,
    error: {
      code: "supabase_realtime_broadcast_failed",
      message: "Supabase realtime broadcast failed.",
      retryable: true,
    },
  });
});

Deno.test("supabase realtime broadcast transport returns failure when client throws", async () => {
  const result = await new SupabaseRealtimeBroadcastTransport(
    new ThrowingBroadcastClient(),
  ).send({
    channel: CHANNEL,
    event: "stock_tick",
    payload: { ok: true },
  });

  assertEquals(result, {
    ok: false,
    error: {
      code: "supabase_realtime_broadcast_failed",
      message: "Supabase realtime broadcast failed.",
      retryable: true,
    },
  });
});

class CapturingBroadcastClient {
  readonly channelTopics: string[] = [];
  readonly sentPayloads: SupabaseRealtimeBroadcastPayload[] = [];
  removedChannels = 0;

  constructor(private readonly sendResult: string) {}

  channel(topic: string) {
    this.channelTopics.push(topic);

    return {
      send: (payload: SupabaseRealtimeBroadcastPayload) => {
        this.sentPayloads.push(payload);
        return this.sendResult;
      },
    };
  }

  removeChannel() {
    this.removedChannels += 1;
    return "ok";
  }
}

class ThrowingBroadcastClient {
  channel(): never {
    throw new Error("connection unavailable");
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed.\nActual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
