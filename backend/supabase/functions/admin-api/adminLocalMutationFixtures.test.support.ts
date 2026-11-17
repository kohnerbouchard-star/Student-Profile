
export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const STAFF_USER_ID = "00000000-0000-4000-8000-000000000002";

export const TARGET_ID = "00000000-0000-4000-8000-000000000003";

export const DUPLICATE_ID = "00000000-0000-4000-8000-000000000004";

export function successRow(
  responseBody: Record<string, unknown>,
  status: number,
  replayed = false,
) {
  return {
    data: [{
      response_status: status,
      response_body: responseBody,
      was_replayed: replayed,
    }],
    error: null,
  };
}

export function contractRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: TARGET_ID,
    game_session_id: GAME_SESSION_ID,
    contract_template_id: null,
    contract_key: "trade-drive",
    source_type: "teacher",
    source_id: null,
    created_by_staff_id: STAFF_USER_ID,
    title: "Trade Drive",
    description: "Create an export plan.",
    instructions: "Submit the plan.",
    category: "trade",
    status: "draft",
    visibility: "public",
    targeting_payload: {},
    requirements_payload: {},
    reward_payload: {},
    completion_mode: "manual_review",
    published_at: null,
    deadline_at: null,
    expires_at: null,
    metadata: {},
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

export function storeItemRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: TARGET_ID,
    game_session_id: GAME_SESSION_ID,
    item_key: "trade_permit",
    name: "Trade Permit",
    description: null,
    category: "licenses",
    price: 25.46,
    currency_code: "NRC",
    stock_quantity: 4,
    status: "active",
    visibility: "visible",
    sort_order: 0,
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
