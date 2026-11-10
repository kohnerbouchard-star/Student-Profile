import {
  importPlayerRoster,
  parseRosterImportNames,
} from "./importPlayerRoster.ts";
import { createSupabasePlayerRosterImportRepository } from "../infrastructure/supabasePlayerRosterImportRepository.ts";
import { handlePlayerRosterImport } from "../api/playerRosterImportHttpHandler.ts";
import type {
  RosterImportCommand,
  RosterImportCredential,
  RosterImportReceipt,
} from "../contracts/playerRosterImport.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const command: RosterImportCommand = {
  gameSessionId: "game-a",
  staffUserId: "staff-a",
  studentNames: ["Synthetic One", "Synthetic One"],
  identity: {
    idempotencyKey: "synthetic-roster-0001",
    requestId: "synthetic-request-0001",
  },
};
const material = {
  credentialVersion: "pbkdf2-sha256-v2" as const,
  lookupDigest: "a".repeat(64),
  salt: "a".repeat(22),
  verifier: "b".repeat(43),
  iterations: 600000,
};
function receipt(
  credentials: readonly RosterImportCredential[],
  replayed = false,
): RosterImportReceipt {
  return {
    status: 201,
    replayed,
    createdCount: 2,
    students: credentials.map((c, i) => ({
      row: i + 1,
      displayName: command.studentNames[i],
      playerIdentifier: c.playerIdentifier,
    })),
  };
}
Deno.test("roster strict names-only validation preserves repeated ordered names", () => {
  assert(
    JSON.stringify(
      parseRosterImportNames({ studentNames: [" One ", "One"] }),
    ) === '["One","One"]',
  );
  for (
    const body of [
      null,
      [],
      {},
      { studentNames: [] },
      { studentNames: ["One"], gameId: "foreign" },
      { studentNames: ["One"], accessCode: "bad" },
      { studentNames: [null] },
      { studentNames: [" "] },
      { studentNames: ["a\nb"] },
      { studentNames: ["x".repeat(241)] },
      { studentNames: Array(201).fill("Synthetic") },
    ]
  ) {
    let rejected = false;
    try {
      parseRosterImportNames(body);
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
  assert(
    parseRosterImportNames({ studentNames: Array(200).fill("Synthetic") })
      .length === 200,
  );
});
Deno.test("fresh import generates distinct secure identifiers and returns codes only in memory", async () => {
  const codes: string[] = [];
  let sent: readonly RosterImportCredential[] = [];
  const result = await importPlayerRoster(
    {
      readReplay: async () => null,
      create: async (_c, credentials) => {
        sent = credentials;
        return receipt(credentials);
      },
    },
    command,
    {
      createCredentialMaterial: async (code) => {
        codes.push(code);
        return material;
      },
    },
  );
  assert(result.credentialsAvailable && !result.replayed);
  assert(
    codes.length === 2 && codes[0] !== codes[1] &&
      codes.every((code) => /^[A-F0-9]{32}$/.test(code)),
  );
  assert(sent[0].playerIdentifier !== sent[1].playerIdentifier);
  assert(codes.every((code) => !JSON.stringify(sent).includes(code)));
  assert(JSON.stringify(result).includes(codes[0]));
});
Deno.test("existing replay skips all KDF work and exposes no codes", async () => {
  const result = await importPlayerRoster(
    {
      readReplay: async () =>
        receipt([{ ...material, playerIdentifier: "STU-" + "A".repeat(24) }, {
          ...material,
          playerIdentifier: "STU-" + "B".repeat(24),
        }], true),
      create: async () => {
        throw Error("must not create");
      },
    },
    command,
    {
      createCredentialMaterial: async () => {
        throw Error("must not hash");
      },
    },
  );
  assert(
    result.replayed && !result.credentialsAvailable &&
      !JSON.stringify(result).includes("accessCode"),
  );
});
Deno.test("race replay never associates newly generated codes with existing credentials", async () => {
  const result = await importPlayerRoster(
    {
      readReplay: async () => null,
      create: async (_c, credentials) => receipt(credentials, true),
    },
    command,
    { createCredentialMaterial: async () => material },
  );
  assert(
    result.replayed && !result.credentialsAvailable &&
      !JSON.stringify(result).includes("accessCode"),
  );
});
Deno.test("uncertain database outcome returns no speculative credentials", async () => {
  let failed = false;
  try {
    await importPlayerRoster(
      {
        readReplay: async () => null,
        create: async () => {
          throw Error("connection lost");
        },
      },
      command,
      { createCredentialMaterial: async () => material },
    );
  } catch {
    failed = true;
  }
  assert(failed);
});
Deno.test("repository uses names-only replay fingerprint and explicitly projects receipt fields", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const students = command.studentNames.map((displayName, index) => ({
    row: index + 1,
    displayName,
    playerIdentifier: "STU-" + (index ? "B" : "A").repeat(24),
    internalId: "never-public",
    accessCode: "never-forward",
  }));
  const repository = createSupabasePlayerRosterImportRepository({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        error: null,
        data: [{
          has_replay: true,
          response_status: 201,
          response_body: { createdCount: 2, students },
        }] as never,
      };
    },
  });
  const result = await repository.readReplay(command);
  assert(calls[0].name === "admin_read_mutation_replay_v1");
  assert(
    JSON.stringify(calls[0].args.p_request_payload) ===
      JSON.stringify({ studentNames: command.studentNames }),
  );
  assert(!JSON.stringify(result).includes("never-"));
});
Deno.test("HTTP rejects unknown fields, missing key, files and oversized input before persistence", async () => {
  for (
    const [body, type, key, status] of [
      [
        JSON.stringify({ studentNames: ["Synthetic"], staffUserId: "foreign" }),
        "application/json",
        "synthetic-roster-0001",
        400,
      ],
      [
        JSON.stringify({ studentNames: ["Synthetic"] }),
        "application/json",
        "",
        400,
      ],
      ["raw csv", "text/csv", "synthetic-roster-0001", 400],
      [" ".repeat(256001), "application/json", "synthetic-roster-0001", 413],
    ] as const
  ) {
    const result = await handlePlayerRosterImport({
      readReplay: async () => {
        throw Error("must not call persistence");
      },
      create: async () => {
        throw Error("must not call persistence");
      },
    }, {
      request: new Request("https://example.test", {
        method: "POST",
        headers: { "content-type": type, "idempotency-key": key },
        body,
      }),
      suffix: "/players/imports/csv",
      applicationContext: {
        gameSessionId: "game-a",
        actor: { kind: "staff", staffUserId: "staff-a" },
        role: "game_admin",
        assuranceLevel: "aal2",
        permissions: ["players.manage"],
        requestId: "synthetic-request",
      },
    });
    assert(result.handled && result.status === status);
  }
});

Deno.test("roster handler rejects wrong role, missing grant and AAL1 before persistence", async () => {
  for (
    const patch of [{ role: "player" }, { permissions: [] }, {
      assuranceLevel: "aal1",
    }, { gameSessionId: "" }]
  ) {
    const context = {
      gameSessionId: "game-a",
      actor: { kind: "staff", staffUserId: "staff-a" },
      role: "game_admin",
      assuranceLevel: "aal2",
      permissions: ["players.manage"],
      requestId: "synthetic",
      ...patch,
    };
    const result = await handlePlayerRosterImport({
      readReplay: async () => {
        throw Error("must not read");
      },
      create: async () => {
        throw Error("must not write");
      },
    }, {
      request: new Request("https://example.test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "synthetic-roster-0001",
        },
        body: JSON.stringify({ studentNames: ["Synthetic"] }),
      }),
      suffix: "/players/imports/csv",
      applicationContext: context as never,
    });
    assert(result.handled && result.status === 403);
  }
});

Deno.test("server rejects presentation controls and internal IDs and normalizes Unicode", () => {
  for (
    const name of [
      "Synthetic\u0085Name",
      "Synthetic\u202eName",
      "Synthetic\u2066Name",
      "Synthetic\ufffdName",
      "10000000-0000-4000-8000-000000000001",
    ]
  ) {
    let rejected = false;
    try {
      parseRosterImportNames({ studentNames: [name] });
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
  assert(
    parseRosterImportNames({ studentNames: [" Jose\u0301 "] })[0] === "José",
  );
});

Deno.test("lone UTF-16 surrogates fail before replay or hashing; valid supplementary names survive", async () => {
  for (
    const name of [
      "Synthetic\ud800",
      "Synthetic\udfff",
      "Synthetic\ud800A\udc00",
    ]
  ) {
    let rejected = false;
    let persistenceCalls = 0;
    let hashingCalls = 0;
    try {
      await importPlayerRoster(
        {
          readReplay: async () => {
            persistenceCalls++;
            return null;
          },
          create: async () => {
            persistenceCalls++;
            throw Error("must not create");
          },
        },
        { ...command, studentNames: [name] },
        {
          createCredentialMaterial: async () => {
            hashingCalls++;
            return material;
          },
        },
      );
    } catch {
      rejected = true;
    }
    assert(rejected && persistenceCalls === 0 && hashingCalls === 0);
  }
  const name = "Synthetic \u{20000} \u{1F600}";
  assert(parseRosterImportNames({ studentNames: [name] })[0] === name);
});
