import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";
import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import { createSupabaseGameSessionMutationRepository } from "./supabaseGameSessionMutationRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";

Deno.test("Supabase Game Sessions mutation repository alone projects join-code scope", async () => {
  const calls: RpcCall[] = [];
  const repository = createSupabaseGameSessionMutationRepository(
    fakeClient(calls, successfulResponse({ joinCode: {} }, true)),
  );
  const applicationContext = context();

  const result = await repository.rotateGameJoinCode({
    applicationContext,
    requestPayload: { source: "admin_share_panel" },
    mutation: {
      idempotencyKey: "join-code-command-001",
      requestId: "mutation-request-join-code-001",
    },
  });

  assertEquals(calls, [{
    name: "admin_rotate_game_join_code_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_request_payload: { source: "admin_share_panel" },
      p_idempotency_key: "join-code-command-001",
      p_request_id: "mutation-request-join-code-001",
    },
  }]);
  assertEquals(
    calls[0]?.args.p_request_id === applicationContext.requestId,
    false,
  );
  assertEquals(result.replayed, true);
});

Deno.test("Supabase Game Sessions mutation repository alone projects settings scope", async () => {
  const calls: RpcCall[] = [];
  const repository = createSupabaseGameSessionMutationRepository(
    fakeClient(calls, successfulResponse({ settings: {} }, false)),
  );
  const applicationContext = context();

  await repository.updateGameSettings({
    applicationContext,
    gameSettingsPatch: { difficulty_preset: "hard" },
    difficultyPolicyPatch: { source: "preset" },
    requestPayload: { command: "settings" },
    mutation: {
      idempotencyKey: "settings-command-001",
      requestId: "mutation-request-settings-001",
    },
  });

  assertEquals(calls, [{
    name: "admin_update_game_settings_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_game_settings_patch: { difficulty_preset: "hard" },
      p_difficulty_policy_patch: { source: "preset" },
      p_request_payload: { command: "settings" },
      p_idempotency_key: "settings-command-001",
      p_request_id: "mutation-request-settings-001",
    },
  }]);
  assertEquals(
    calls[0]?.args.p_request_id === applicationContext.requestId,
    false,
  );
});

Deno.test("Supabase Game Sessions mutation repository preserves conflict and sanitized failure contracts", async () => {
  for (
    const [message, code, status] of [
      ["ADMIN_MUTATION_IDEMPOTENCY_CONFLICT", "idempotency_key_conflict", 409],
      ["private database detail", "game_settings_failed", 500],
    ] as const
  ) {
    const repository = createSupabaseGameSessionMutationRepository(
      fakeClient([], { data: null, error: { message } }),
    );
    let failure: AdminMutationError | null = null;
    try {
      await repository.updateGameSettings({
        applicationContext: context(),
        gameSettingsPatch: { difficulty_preset: "hard" },
        difficultyPolicyPatch: {},
        requestPayload: {},
        mutation: {
          idempotencyKey: "settings-command-002",
          requestId: "mutation-request-settings-002",
        },
      });
    } catch (error) {
      failure = error instanceof AdminMutationError ? error : null;
    }

    assertEquals(failure?.code, code);
    assertEquals(failure?.status, status);
    assertEquals(failure?.message.includes("private database"), false);
  }
});

interface RpcCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

function context(): GameSessionsStaffApplicationContext {
  return Object.freeze({
    gameSessionId: GAME_ID,
    actor: Object.freeze({ kind: "staff" as const, staffUserId: STAFF_ID }),
    role: "game_admin" as const,
    permissions: Object.freeze(["settings.manage"]),
    requestId: "server-request-must-not-be-rpc-request-id",
    assuranceLevel: "aal2" as const,
  });
}

function successfulResponse(
  responseBody: Record<string, unknown>,
  replayed: boolean,
) {
  return {
    data: [{
      response_status: 200,
      response_body: responseBody,
      was_replayed: replayed,
    }],
    error: null,
  };
}

function fakeClient(
  calls: RpcCall[],
  response: {
    readonly data: unknown;
    readonly error:
      | { readonly message?: string; readonly code?: string }
      | null;
  },
): AdminMutationRpcClient {
  return {
    rpc<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(
        response as {
          readonly data: T | null;
          readonly error: typeof response.error;
        },
      );
    },
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
