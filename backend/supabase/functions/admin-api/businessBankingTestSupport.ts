function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000003";
const LOAN_ID = "00000000-0000-4000-8000-000000000004";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000005";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000006";
const BUSINESS_ID = "00000000-0000-4000-8000-000000000007";
const PAYMENT_ID = "00000000-0000-4000-8000-000000000008";
const APP_KEY = `lna_${"a".repeat(32)}`;
const LOAN_KEY = `lon_${"b".repeat(32)}`;
const PRODUCT_KEY = `lop_${"c".repeat(32)}`;
const BUSINESS_KEY = `biz_${"d".repeat(32)}`;
const PAYMENT_KEY = `pay_${"e".repeat(32)}`;
const NOW = "2026-08-10T04:00:00.000Z";

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined
      ? undefined
      : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function thenableQuery(
  data: unknown[],
  filters: Array<{ table: string; column: string; value: unknown }>,
  table: string,
) {
  const query: any = {
    eq(column: string, value: unknown) {
      filters.push({ table, column, value });
      return query;
    },
    in() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve({ data: data[0] ?? null, error: null });
    },
    then(
      resolve: (value: unknown) => unknown,
      reject?: (error: unknown) => unknown,
    ) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return query;
}

function service(fixtures: Record<string, unknown[]> = {}) {
  const calls: Array<{ functionName: string; args: Record<string, unknown> }> =
    [];
  const selects: Array<{ table: string; columns: string }> = [];
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  return {
    calls,
    selects,
    filters,
    from(table: string) {
      return {
        select(columns: string) {
          selects.push({ table, columns });
          return thenableQuery(
            fixtures[table] ?? [{ value: GAME_ID }],
            filters,
            table,
          );
        },
      };
    },
    rpc(functionName: string, args: Record<string, unknown>) {
      calls.push({ functionName, args });
      return Promise.resolve({ data: [{ outcome: "applied" }], error: null });
    },
  };
}

export {
  APP_KEY,
  APPLICATION_ID,
  assert,
  assertEquals,
  BUSINESS_ID,
  BUSINESS_KEY,
  GAME_ID,
  LOAN_ID,
  LOAN_KEY,
  NOW,
  PAYMENT_ID,
  PAYMENT_KEY,
  PLAYER_ID,
  PRODUCT_ID,
  PRODUCT_KEY,
  request,
  service,
  STAFF_ID,
};
