import { BusinessTreasuryError } from "../contracts/businessTreasuryContracts.ts";
import {
  mapBusinessTreasuryDatabaseError,
  SupabaseBusinessTreasuryRepository,
} from "./supabaseBusinessTreasuryRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test(
  "Business treasury repository maps reachable client errors without private diagnostics",
  async () => {
    const mapped = mapBusinessTreasuryDatabaseError({
      code: "P0001",
      message: "private function failed for hidden account",
      details: "FX_RATE_VERSION_STALE",
      hint: "secret-internal-hint",
    });
    assertEquals(
      [mapped.code, mapped.status, mapped.retryable, mapped.message],
      [
        "business_fx_rate_stale",
        409,
        true,
        "The accepted FX fixing is no longer current.",
      ],
    );

    const stableClientErrors = [
      ["FX_QUOTE_PRODUCT_MISMATCH", "business_fx_quote_product_mismatch", 409],
      ["FX_QUOTE_CONSUMED", "business_fx_quote_consumed", 409],
      [
        "FX_SAME_CURRENCY_NOT_REQUIRED",
        "business_fx_same_currency_not_required",
        409,
      ],
      [
        "FX_QUOTE_TARGET_ROUNDS_TO_ZERO",
        "business_fx_target_rounds_to_zero",
        400,
      ],
      ["BANK_ACCOUNT_NOT_ACTIVE", "business_treasury_account_unavailable", 409],
      [
        "BANK_ACCOUNT_CURRENCY_INVALID",
        "business_treasury_currency_invalid",
        400,
      ],
      [
        "BUSINESS_BANK_ACCOUNT_IDEMPOTENCY_CONFLICT",
        "business_treasury_idempotency_conflict",
        409,
      ],
    ] as const;
    for (const [databaseCode, publicCode, status] of stableClientErrors) {
      const error = mapBusinessTreasuryDatabaseError({ message: databaseCode });
      assertEquals([error.code, error.status, error.retryable], [
        publicCode,
        status,
        false,
      ]);
    }

    for (
      const databaseCode of [
        "BANK_ACCOUNT_REQUEST_INVALID",
        "BUSINESS_BANK_ACCOUNT_REQUEST_INVALID",
        "FX_QUOTE_REQUEST_INVALID",
        "FX_ORDER_REQUEST_INVALID",
        "FX_ORDER_CANCEL_REQUEST_INVALID",
      ]
    ) {
      const error = mapBusinessTreasuryDatabaseError({ message: databaseCode });
      assertEquals(
        [error.code, error.status, error.retryable],
        ["invalid_business_treasury_request", 400, false],
      );
    }
    for (
      const databaseCode of [
        "FX_ORDER_STATE_NOT_FOUND",
        "FX_ORDER_STATE_CONFLICT",
      ]
    ) {
      const error = mapBusinessTreasuryDatabaseError({ message: databaseCode });
      assertEquals(
        [error.code, error.status, error.retryable],
        ["business_fx_order_state_conflict", 409, false],
      );
    }
    for (
      const databaseCode of ["FX_FIXING_NOT_FOUND", "FX_FIXING_VALUE_NOT_FOUND"]
    ) {
      const error = mapBusinessTreasuryDatabaseError({ message: databaseCode });
      assertEquals(
        [error.code, error.status, error.retryable],
        ["business_fx_fixing_unavailable", 409, true],
      );
    }

    const repository = new SupabaseBusinessTreasuryRepository({
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { message: "P0001: FX_SAME_CURRENCY_NOT_REQUIRED" },
        }),
    } as never);
    await assertTreasuryError(
      () =>
        repository.createQuote({
          gameSessionId: "00000000-0000-4000-8000-000000000001",
          playerId: "00000000-0000-4000-8000-000000000002",
          sourceAccountKey: `bac_${"a".repeat(32)}`,
          targetAccountKey: null,
          targetCurrencyCode: "WHOLE",
          sourceAmount: "1",
          product: "instant",
          idempotencyKey: "business-fx-same-currency-001",
        }),
      "business_fx_same_currency_not_required",
      409,
    );

    const unknown = mapBusinessTreasuryDatabaseError({
      message: "secret table private.owner_identity exploded",
    });
    assertEquals(
      [unknown.code, unknown.status, unknown.retryable],
      ["business_treasury_service_unavailable", 503, true],
    );
    if (/secret|owner_identity/u.test(unknown.message)) {
      throw new Error("Private database diagnostics leaked through mapping.");
    }
  },
);

async function assertTreasuryError(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof BusinessTreasuryError)) throw error;
    assertEquals([error.code, error.status, error.retryable], [
      code,
      status,
      false,
    ]);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
