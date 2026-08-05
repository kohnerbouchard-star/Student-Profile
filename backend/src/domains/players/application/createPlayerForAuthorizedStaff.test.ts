import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";
import { createPlayerForAuthorizedStaff } from "./createPlayerForAuthorizedStaff.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const CREDENTIAL = {
  credentialVersion: "pbkdf2-sha256-v2" as const,
  lookupDigest: "a".repeat(64),
  salt: "abcdefghijklmnopqrstuv",
  verifier: "b".repeat(43),
  iterations: 600_000,
};

Deno.test("authorized player creation uses the atomic Admin RPC without exposing the access code", async () => {
  const client = new FakeRpcClient(successResponse(false));
  const result = await createPlayerForAuthorizedStaff(
    {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      body: {
        displayName: "Avery Stone",
        rosterLabel: "A-1",
        playerIdentifier: "rfid:04a1b2c3",
        accessCode: "avery-4826",
      },
      identity: {
        idempotencyKey: "player-create-key-0001",
        requestId: "request-player-0001",
      },
    },
    client,
    credentialDependencies(),
  );

  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0]?.name, "admin_create_player_v1");
  assertEquals(client.calls[0]?.args.p_game_session_id, GAME_ID);
  assertEquals(client.calls[0]?.args.p_staff_user_id, STAFF_ID);
  assertEquals(
    client.calls[0]?.args.p_player_identifier_normalized,
    "RFID:04A1B2C3",
  );
  assertEquals(
    client.calls[0]?.args.p_lookup_digest,
    CREDENTIAL.lookupDigest,
  );
  assertEquals(client.calls[0]?.args.p_access_code_hash, undefined);
  assertEquals(
    client.calls[0]?.args.p_credential_version,
    "pbkdf2-sha256-v2",
  );
  assertEquals(client.calls[0]?.args.p_credential_salt, CREDENTIAL.salt);
  assertEquals(
    client.calls[0]?.args.p_credential_verifier,
    CREDENTIAL.verifier,
  );
  assertEquals(client.calls[0]?.args.p_credential_iterations, 600_000);
  const requestPayload = JSON.stringify(
    client.calls[0]?.args.p_request_payload,
  );
  assertEquals(requestPayload.includes(CREDENTIAL.lookupDigest), true);
  assertEquals(requestPayload.includes(CREDENTIAL.salt), false);
  assertEquals(requestPayload.includes(CREDENTIAL.verifier), false);
  const serializedArgs = JSON.stringify(client.calls[0]?.args);
  assertEquals(serializedArgs.includes("avery-4826"), false);
  assertEquals(serializedArgs.includes("AVERY-4826"), false);
  assertEquals(result.status, 201);
  assertEquals(result.replayed, false);
  assertEquals(result.player.id, "00000000-0000-4000-8000-000000000301");
  assertEquals(result.accessCode.studentCode, "AVERY-4826");
});

Deno.test("authorized player creation returns the stored result on a replay", async () => {
  const client = new FakeRpcClient(successResponse(true));
  const result = await createPlayerForAuthorizedStaff(
    {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      body: {
        displayName: "Avery Stone",
        rosterLabel: "A-1",
        playerIdentifier: "RFID:04A1B2C3",
        accessCode: "AVERY-4826",
      },
      identity: {
        idempotencyKey: "player-create-key-0001",
        requestId: "request-player-0001",
      },
    },
    client,
    credentialDependencies(),
  );

  assertEquals(result.replayed, true);
  assertEquals(result.player.displayName, "Avery Stone");
  assertEquals(client.calls.length, 1);
});

Deno.test("authorized player creation maps key/payload conflicts to HTTP 409", async () => {
  const client = new FakeRpcClient(null, {
    message: "ADMIN_MUTATION_IDEMPOTENCY_CONFLICT",
  });

  await assertAdminMutationError(
    () =>
      createPlayerForAuthorizedStaff(
        {
          gameSessionId: GAME_ID,
          staffUserId: STAFF_ID,
          body: {
            displayName: "Different Player",
            rosterLabel: null,
            playerIdentifier: "RFID:DIFFERENT",
            accessCode: "DIFFERENT-1234",
          },
          identity: {
            idempotencyKey: "player-create-key-0001",
            requestId: "request-player-0002",
          },
        },
        client,
        credentialDependencies(),
      ),
    "idempotency_key_conflict",
    409,
  );
});

Deno.test("authorized player creation maps database failure to a non-200 error", async () => {
  const client = new FakeRpcClient(null, {
    message: "private database connection failure",
  });

  await assertAdminMutationError(
    () =>
      createPlayerForAuthorizedStaff(
        {
          gameSessionId: GAME_ID,
          staffUserId: STAFF_ID,
          body: {
            displayName: "Avery Stone",
            rosterLabel: "A-1",
            playerIdentifier: "RFID:04A1B2C3",
            accessCode: "AVERY-4826",
          },
          identity: {
            idempotencyKey: "player-create-key-0002",
            requestId: "request-player-0002",
          },
        },
        client,
        credentialDependencies(),
      ),
    "player_create_failed",
    500,
  );
  assertEquals(client.calls.length, 1);
});

class FakeRpcClient implements AdminMutationRpcClient {
  readonly calls: { name: string; args: Record<string, unknown> }[] = [];

  constructor(
    private readonly data: unknown,
    private readonly error: { message?: string; code?: string } | null = null,
  ) {}

  rpc<T>(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: this.data as T | null, error: this.error });
  }
}

function credentialDependencies() {
  return {
    createCredentialMaterial: () => Promise.resolve(CREDENTIAL),
  };
}

function successResponse(replayed: boolean): unknown {
  return [{
    response_status: 201,
    was_replayed: replayed,
    response_body: {
      player: {
        player_id: "00000000-0000-4000-8000-000000000301",
        display_name: "Avery Stone",
        roster_label: "A-1",
        player_identifier: "rfid:04a1b2c3",
        player_status: "active",
        player_created_at: "2026-08-05T01:00:00.000Z",
        player_updated_at: "2026-08-05T01:00:00.000Z",
        credential_created_at: "2026-08-05T01:00:00.000Z",
      },
    },
  }];
}

async function assertAdminMutationError(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AdminMutationError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      return;
    }
    throw error;
  }
  throw new Error(`Expected AdminMutationError ${code}.`);
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
