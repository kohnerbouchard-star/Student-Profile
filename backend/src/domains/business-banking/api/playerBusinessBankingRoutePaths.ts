import { readPlayerBusinessRoutePath } from "../../business/index.ts";
import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerBusinessBankingRoute } from "../contracts/playerBusinessBankingContracts.ts";

const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;

// Temporary compatibility manifest for static mixed-domain consumers. Business
// parsing itself is authoritative in domains/business and this list is removed
// when the mixed Business/Banking facade retires.
export const DELEGATED_BUSINESS_ROUTE_CONTRACT = Object.freeze([
  { kind: "businessRead" },
  { kind: "businessCreate" },
  { kind: "businessProductCreate" },
  { kind: "businessInputPurchase" },
  { kind: "businessProduction" },
  { kind: "businessPrice" },
  { kind: "businessHire" },
  { kind: "businessTerminate" },
  { kind: "businessStatus" },
]);

export function readPlayerBusinessBankingRoutePath(
  pathname: string,
): PlayerBusinessBankingRoute | null {
  const businessRoute = readPlayerBusinessRoutePath(pathname);
  if (businessRoute) return businessRoute;

  const segments = readPlayerApiRouteSegments(pathname);
  if (!segments || segments[0] !== "players" || segments[1] !== "me") return null;
  const tail = segments.slice(2);

  if (tail.length === 2 && tail[0] === "banking" && tail[1] === "transfers") {
    return { kind: "playerTransfer" };
  }
  if (
    tail.length === 3 && tail[0] === "banking" && tail[1] === "savings" &&
    tail[2] === "transfers"
  ) return { kind: "savingsTransfer" };
  if (tail.length === 2 && tail[0] === "banking" && tail[1] === "loans") {
    return { kind: "loansRead" };
  }
  if (
    tail.length === 4 && tail[0] === "banking" && tail[1] === "loans" &&
    tail[2] === "applications" && validKey(tail[3], "lop")
  ) return { kind: "loanApply", offerKey: tail[3].toLowerCase() };
  if (
    tail.length === 4 && tail[0] === "banking" && tail[1] === "loans" &&
    tail[3] === "payments" && validKey(tail[2], "lon")
  ) return { kind: "loanRepay", loanKey: tail[2].toLowerCase() };
  return null;
}

function validKey(value: string | undefined, prefix: string): boolean {
  return Boolean(
    value && PUBLIC_KEY.test(value.toLowerCase()) && value.toLowerCase().startsWith(`${prefix}_`),
  );
}
