export interface PlayerLoginSuccessBody {
  readonly ok: true;
  readonly gameSession: {
    readonly name: string;
    readonly status: string;
  };
  readonly player: {
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string;
    readonly status: string;
  };
  readonly session: {
    /** Returned once after credential verification. Persist only the hash server-side. */
    readonly token: string;
    readonly status: "active";
    readonly expiresAt: string;
  };
}

export interface PlayerSessionBootstrapBody {
  readonly ok: true;
  readonly gameSession: {
    readonly name: string;
    readonly status: string;
  };
  readonly player: {
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string;
    readonly status: string;
  };
  readonly session: {
    readonly status: "active";
    readonly expiresAt: string;
  };
  readonly balances: readonly {
    readonly accountType: string;
    readonly balance: number;
    readonly currencyCode: string;
  }[];
  readonly attendance: {
    readonly status: "not_configured";
  };
  readonly availableActions: readonly string[];
}

const INTERNAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBrowserSafePlayerIdentifier(
  value: unknown,
): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    !INTERNAL_UUID_PATTERN.test(value.trim());
}
