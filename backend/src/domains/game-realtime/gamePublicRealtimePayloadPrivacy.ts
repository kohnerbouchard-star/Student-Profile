const PRIVATE_PUBLIC_CHANNEL_FIELD_NAMES = new Set([
  "accesscode",
  "accountbalance",
  "accountbalances",
  "accountid",
  "accountids",
  "balance",
  "balances",
  "cash",
  "cashbalance",
  "contractprogress",
  "contractsubmission",
  "contractsubmissions",
  "holding",
  "holdings",
  "idempotencykey",
  "inventory",
  "ledger",
  "ledgerentries",
  "ledgerentry",
  "ledgerentryid",
  "order",
  "orders",
  "playercash",
  "playerholding",
  "playerholdings",
  "playerid",
  "playerinventory",
  "playerorder",
  "playerorders",
  "playerpurchase",
  "playerpurchases",
  "playersession",
  "playersessionid",
  "playersessiontoken",
  "purchase",
  "purchases",
  "runnersecret",
  "sessionid",
  "sessiontoken",
  "sessiontokenhash",
  "stockorder",
  "stockorders",
  "stocktrade",
  "stocktrades",
  "trade",
  "trades",
]);

export function findPrivatePublicChannelField(
  value: unknown,
  path = "payload",
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedPath = findPrivatePublicChannelField(value[index], `${path}[${index}]`);

      if (nestedPath) {
        return nestedPath;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;

    if (PRIVATE_PUBLIC_CHANNEL_FIELD_NAMES.has(normalizeFieldName(key))) {
      return keyPath;
    }

    const nestedPath = findPrivatePublicChannelField(nestedValue, keyPath);

    if (nestedPath) {
      return nestedPath;
    }
  }

  return null;
}

function normalizeFieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
