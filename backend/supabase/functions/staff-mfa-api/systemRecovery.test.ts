import {
  handleSystemRecovery,
  MfaRequestError,
  type RecoveryDependencies,
} from "./systemRecovery.ts";
const user = "00000000-0000-4000-8000-000000000001";
const session = "00000000-0000-4000-8000-000000000002";
const factor = "00000000-0000-4000-8000-000000000003";
const token = `header.${
  btoa(JSON.stringify({ sub: user, session_id: session }))
}.signature`;
const digest = "a".repeat(64);
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
function fixture(context: Record<string, unknown> = { phase: "enrolling" }) {
  let reserved = false, providerCalls = 0, verifyCalls = 0;
  const service = {
    rpc: async (name: string, args: any) => {
      assert(
        args.p_user === user && args.p_session === session &&
          args.p_digest === digest,
        "lost grant binding",
      );
      if (name === "system_recovery_context_v1") {
        return {
          data: { ...context },
          error: null,
        };
      }
      if (name === "system_recovery_reserve_factor_v1") {
        if (reserved) {
          return {
            data: null,
            error: { message: "already reserved" },
          };
        }
        reserved = true;
        return { data: null, error: null };
      }
      throw Error("unexpected mutation");
    },
  };
  const client = {
    auth: {
      mfa: {
        listFactors: async () => {
          providerCalls++;
          assert(reserved, "provider effect before reservation");
          return { data: null, error: { message: "disposable interruption" } };
        },
      },
    },
  };
  const dependencies: RecoveryDependencies = {
    rejectUnknownFields: (body, allowed) => {
      if (Object.keys(body).some((key) => !allowed.has(key))) {
        throw Error("unknown field");
      }
    },
    privateHeaders: () => ({ "cache-control": "private, no-store" }),
    createFactorHandle: async () => "opaque-handle",
    readFactorHandle: async (value, id) => {
      assert(id === user, "wrong handle user");
      return value === "owned-handle" ? factor : "other-factor";
    },
    handleVerify: async () => {
      verifyCalls++;
      return Response.json({
        ok: true,
        session: {
          accessToken: "synthetic-bearer",
          refreshToken: "must-not-leak",
        },
        internalUserId: user,
      });
    },
  };
  return {
    call: (
      operation: string,
      body: Record<string, unknown> = {},
      aal = "aal1",
    ) =>
      handleSystemRecovery(
        client,
        service as any,
        user,
        token,
        digest,
        operation,
        body,
        aal,
        dependencies,
      ),
    counts: () => ({ providerCalls, verifyCalls }),
    context,
  };
}
Deno.test("overlapping enrollment requests invoke provider only once; interruption cannot reacquire", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.call("enroll", { slot: "primary" }),
    f.call("enroll", { slot: "primary" }),
  ]);
  assert(
    results.every((r) => r.status === "rejected"),
    "interruption returned success",
  );
  assert(f.counts().providerCalls === 1, "competing provider calls");
  await f.call("enroll", { slot: "primary" }).then(
    () => {
      throw Error("retry acquired");
    },
    (error) =>
      assert(
        error instanceof MfaRequestError &&
          error.code === "recovery_setup_interrupted",
        "wrong retry failure",
      ),
  );
  assert(f.counts().providerCalls === 1, "retry repeated provider effect");
});
Deno.test("backup requires verified recorded primary and AAL2 before any provider effect", async () => {
  for (
    const [primaryVerified, aal] of [[false, "aal2"], [true, "aal1"]] as const
  ) {
    const f = fixture({ phase: "enrolling", primaryVerified });
    await f.call("enroll", { slot: "backup" }, aal).then(
      () => {
        throw Error("backup accepted");
      },
      (error) =>
        assert(
          error instanceof MfaRequestError &&
            error.code === "staff_mfa_required",
          "wrong denial",
        ),
    );
    assert(f.counts().providerCalls === 0, "provider called before assurance");
  }
});
Deno.test("verification rejects a factor outside the recorded slot and filters provider session", async () => {
  const f = fixture({ phase: "enrolling", primary: factor });
  await f.call("verify", {
    slot: "primary",
    factorHandle: "other-handle",
    code: "123456",
  }).then(
    () => {
      throw Error("foreign factor accepted");
    },
    (error) =>
      assert(
        error instanceof MfaRequestError &&
          error.code === "recovery_factor_denied",
        "wrong ownership denial",
      ),
  );
  assert(f.counts().verifyCalls === 0, "provider verified foreign factor");
  const response = await f.call("verify", {
    slot: "primary",
    factorHandle: "owned-handle",
    code: "123456",
  });
  assert(
    JSON.stringify(await response.json()) ===
      JSON.stringify({ ok: true, accessToken: "synthetic-bearer" }),
    "provider details leaked",
  );
  assert(
    response.headers.get("cache-control") === "private, no-store",
    "cache policy missing",
  );
});
Deno.test("status reports interrupted reservation without exposing account or factor identifiers", async () => {
  const f = fixture({
    phase: "enrolling",
    primaryReserved: true,
    primary: factor,
    primaryVerified: false,
    id: user,
  });
  const response = await f.call("status");
  const data = await response.json();
  assert(
    data.setupInterrupted === true && data.primaryVerified === false,
    "lost interruption status",
  );
  assert(
    !JSON.stringify(data).includes(user) &&
      !JSON.stringify(data).includes(factor),
    "private identifiers leaked",
  );
});
Deno.test("unavailable context and unknown input deny provider effects", async () => {
  for (const f of [fixture({ phase: "completing" }), fixture()]) {
    await f.call("enroll", { slot: "primary", untrustedUser: user }).then(
      () => {
        throw Error("unknown field accepted");
      },
      () => {},
    );
    assert(f.counts().providerCalls === 0, "invalid request reached provider");
  }
  await fixture({ phase: "completing" }).call("status").then(() => {
    throw Error("completion admitted");
  }, (error) => assert(error instanceof MfaRequestError, "wrong phase error"));
});
