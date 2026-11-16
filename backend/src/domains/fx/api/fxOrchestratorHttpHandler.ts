import { calculateFxFixing } from "../calculations/fxFixingEngine.ts";
import type {
  FxFixingOrchestratorRepository,
} from "../infrastructure/supabaseFxFixingRepository.ts";
import {
  type CalculateFxFixing,
  FxFixingRunnerError,
  runFxFixingRunner,
} from "../services/fxFixingRunner.ts";

export const FX_SCHEDULER_NAME = "econovaria-fx-runtime-scheduler-v1";
export const FX_SCHEDULER_HEADER = "x-econovaria-scheduler-token";

interface FxOrchestratorHttpDependencies {
  readonly createRepository: () => FxFixingOrchestratorRepository;
  readonly calculate?: CalculateFxFixing;
  readonly now?: () => Date;
  readonly randomUuid?: () => string;
  readonly hashSchedulerToken?: (token: string) => Promise<string>;
}

export async function handleFxOrchestratorRequest(
  request: Request,
  dependencies: FxOrchestratorHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return serviceJson(405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST to run the FX fixing orchestrator.",
        retryable: false,
      },
    }, { allow: "POST" });
  }

  const schedulerToken = request.headers.get(FX_SCHEDULER_HEADER)?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/i.test(schedulerToken)) {
    return unauthorized();
  }

  try {
    const repository = dependencies.createRepository();
    const schedulerTokenHash = await (
      dependencies.hashSchedulerToken ?? sha256Hex
    )(schedulerToken.toLowerCase());
    if (!/^[0-9a-f]{64}$/.test(schedulerTokenHash)) {
      throw new FxFixingRunnerError(
        "fx_scheduler_token_hash_invalid",
        "FX scheduler token could not be verified.",
        500,
        false,
      );
    }

    const authorized = await repository.verifySchedulerToken({
      schedulerName: FX_SCHEDULER_NAME,
      tokenSha256: schedulerTokenHash,
    });
    if (!authorized) return unauthorized();

    await assertFixedRequestScope(request);

    const now = (dependencies.now ?? (() => new Date()))();
    if (!Number.isFinite(now.getTime())) {
      throw new FxFixingRunnerError(
        "fx_orchestrator_clock_invalid",
        "FX orchestrator clock returned an invalid timestamp.",
        500,
        false,
      );
    }
    const runUuid = (dependencies.randomUuid ?? (() => crypto.randomUUID()))();
    if (!/^[0-9a-f-]{36}$/i.test(runUuid)) {
      throw new FxFixingRunnerError(
        "fx_orchestrator_run_identity_invalid",
        "FX orchestrator could not create a run identity.",
        500,
        false,
      );
    }
    const claimedAt = now.toISOString();
    const result = await runFxFixingRunner({
      repository,
      calculate: dependencies.calculate ?? calculateFxFixing,
      claimedAt,
      runId: `fx-run:${claimedAt.replace(/[^0-9]/g, "")}:${runUuid}`,
      limit: 25,
      leaseSeconds: 300,
    }, {
      now: dependencies.now ?? (() => new Date()),
    });

    const summary = {
      dueCount: result.dueCount,
      appliedCount: result.appliedCount,
      replayedCount: result.replayedCount,
      failedCount: result.failedCount,
      failureRecordFailedCount: result.failureRecordFailedCount,
      failureCodes: result.failureCodes,
    };

    if (result.failedCount > 0) {
      return serviceJson(500, {
        ok: false,
        error: {
          code: "fx_fixing_batch_incomplete",
          message: "One or more due FX fixings did not complete.",
          retryable: true,
        },
        summary,
      });
    }

    return serviceJson(200, { ok: true, ...summary });
  } catch (error) {
    if (error instanceof FxFixingRunnerError) {
      return serviceJson(error.status, {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      });
    }

    return serviceJson(500, {
      ok: false,
      error: {
        code: "fx_orchestrator_failed",
        message: "FX fixing orchestrator failed.",
        retryable: true,
      },
    });
  }
}

async function assertFixedRequestScope(request: Request): Promise<void> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 128) {
    throw invalidRequest();
  }

  const text = await request.text();
  if (!text.trim()) return;
  if (text.length > 128) throw invalidRequest();

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidRequest();
  }
  if (!isRecord(value) || Object.keys(value).length !== 0) {
    throw invalidRequest();
  }
}

function invalidRequest(): FxFixingRunnerError {
  return new FxFixingRunnerError(
    "invalid_fx_orchestrator_request",
    "FX orchestration has fixed scheduler scope and accepts no game selector.",
    400,
    false,
  );
}

function unauthorized(): Response {
  return serviceJson(401, {
    ok: false,
    error: {
      code: "invalid_scheduler_token",
      message: "Scheduler authentication failed.",
      retryable: false,
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serviceJson(
  status: number,
  body: unknown,
  additionalHeaders: HeadersInit = {},
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  new Headers(additionalHeaders).forEach((value, key) =>
    headers.set(key, value)
  );
  return new Response(JSON.stringify(body), { status, headers });
}
