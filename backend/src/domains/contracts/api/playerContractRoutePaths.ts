export type PlayerContractRoute =
  | {
    readonly kind: "contracts";
  }
  | {
    readonly kind: "submit";
    readonly contractId: string;
  };

/**
 * Legacy Player Contract routes are retired.
 *
 * Current Player clients use the public-key routes resolved by
 * playerContractPublicListRoutePaths, playerContractAcceptanceRoutePaths, and
 * playerContractPublicSubmitRoutePaths before this compatibility parser is
 * consulted. Keeping the UUID-scoped `/submit` route reachable would preserve
 * an unnecessary browser path that accepts internal identifiers.
 */
export function readPlayerContractRoutePath(
  _pathname: string,
): PlayerContractRoute | null {
  return null;
}
