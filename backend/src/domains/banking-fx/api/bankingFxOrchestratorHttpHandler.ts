/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import type {
  StandardFxOrderSettlementOrchestratorRepository,
} from "../infrastructure/supabaseStandardFxOrderSettlementRepository.ts";
import {
  runStandardFxOrderSettlementBatch,
  StandardFxOrderSettlementError,
} from "../services/standardFxOrderSettlementRunner.ts";

export const BANKING_FX_SCHEDULER_HEADER = "x-econovaria-scheduler-token";
// Both FX workers are authorized by the one database-owned FX scheduler token.
export const BANKING_FX_SCHEDULER_NAME = "econovaria-fx-runtime-scheduler-v1";

interface BankingFxOrchestratorDependencies {
  readonly createRepository: () =>
    StandardFxOrderSettlementOrchestratorRepository;
  readonly now?: () => Date;
  readonly randomUuid?: () => string;
  readonly hashSchedulerToken?: (token: string) => Promise<string>;
}

export async function handleBankingFxOrchestratorRequest(
  request: Request,
  dependencies: BankingFxOrchestratorDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return serviceJson(
      405,
      errorBody(
        "method_not_allowed",
        "Use POST to run the Banking FX settlement orchestrator.",
        false,
      ),
      { allow: "POST" },
    );
  }

  const schedulerToken = request.headers.get(BANKING_FX_SCHEDULER_HEADER)
    ?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/iu.test(schedulerToken)) return unauthorized();

  try {
    const repository = dependencies.createRepository();
    const schedulerTokenHash = await (
      dependencies.hashSchedulerToken ?? sha256Hex
    )(schedulerToken.toLowerCase());
    if (!/^[0-9a-f]{64}$/u.test(schedulerTokenHash)) {
      throw new StandardFxOrderSettlementError(
        "banking_fx_scheduler_token_hash_invalid",
        "Banking FX scheduler token could not be verified.",
        500,
        false,
      );
    }
    const authorized = await repository.verifySchedulerToken({
      schedulerName: BANKING_FX_SCHEDULER_NAME,
      tokenSha256: schedulerTokenHash,
    });
    if (!authorized) return unauthorized();

    await assertFixedRequestScope(request);
    const now = dependencies.now ?? (() => new Date());
    const claimedAt = validNow(now).toISOString();
    const runUuid = (dependencies.randomUuid ?? (() => crypto.randomUUID()))();
    if (!isUuid(runUuid)) {
      throw new StandardFxOrderSettlementError(
        "banking_fx_orchestrator_run_identity_invalid",
        "Banking FX orchestrator could not create a run identity.",
        500,
        false,
      );
    }
    const workerName = `banking-fx-run:${
      claimedAt.replace(/[^0-9]/gu, "")
    }:${runUuid}`;
    const result = await runStandardFxOrderSettlementBatch({
      repository,
      workerName,
      claimedAt,
      limit: 25,
      leaseSeconds: 300,
    }, { now });
    const summary = {
      claimedCount: result.claimedCount,
      appliedCount: result.appliedCount,
      replayedCount: result.replayedCount,
      terminalFailedCount: result.terminalFailedCount,
      retryableFailedCount: result.retryableFailedCount,
      failureRecordFailedCount: result.failureRecordFailedCount,
      failedCount: result.failedCount,
      failureCodes: result.failureCodes,
    };

    if (result.failedCount > 0) {
      return serviceJson(500, {
        ...errorBody(
          "banking_fx_settlement_batch_incomplete",
          "One or more standard FX orders did not settle.",
          result.retryableFailedCount > 0 ||
            result.failureRecordFailedCount > 0,
        ),
        summary,
      });
    }
    return serviceJson(200, { ok: true, ...summary });
  } catch (error) {
    if (error instanceof StandardFxOrderSettlementError) {
      return serviceJson(
        error.status,
        errorBody(error.code, error.message, error.retryable),
      );
    }
    return serviceJson(
      500,
      errorBody(
        "banking_fx_orchestrator_failed",
        "Banking FX settlement orchestrator failed.",
        true,
      ),
    );
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
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 0
  ) {
    throw invalidRequest();
  }
}

function validNow(now: () => Date): Date {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new StandardFxOrderSettlementError(
      "banking_fx_orchestrator_clock_invalid",
      "Banking FX orchestrator clock returned an invalid timestamp.",
      500,
      false,
    );
  }
  return value;
}

function invalidRequest(): StandardFxOrderSettlementError {
  return new StandardFxOrderSettlementError(
    "invalid_banking_fx_orchestrator_request",
    "Banking FX orchestration has fixed scope and accepts no selectors.",
    400,
    false,
  );
}

function unauthorized(): Response {
  return serviceJson(
    401,
    errorBody(
      "invalid_scheduler_token",
      "Scheduler authentication failed.",
      false,
    ),
  );
}

function errorBody(code: string, message: string, retryable: boolean) {
  return { ok: false, error: { code, message, retryable } };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);
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
