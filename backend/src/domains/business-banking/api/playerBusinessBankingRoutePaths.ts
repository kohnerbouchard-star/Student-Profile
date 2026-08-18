import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerBusinessBankingRoute } from "../contracts/playerBusinessBankingContracts.ts";

const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;

export function readPlayerBusinessBankingRoutePath(
  pathname: string,
): PlayerBusinessBankingRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (!segments || segments[0] !== "players" || segments[1] !== "me") {
    return null;
  }
  const tail = segments.slice(2);

  if (tail.length === 1 && tail[0] === "business") return { kind: "businessRead" };
  if (tail.length === 1 && tail[0] === "businesses") return { kind: "businessCreate" };
  if (tail.length === 2 && tail[0] === "business" && tail[1] === "formations") {
    return { kind: "businessFormationPropose" };
  }
  if (
    tail.length === 4 && tail[0] === "business" && tail[1] === "formations" &&
    tail[3] === "respond" && validKey(tail[2], "bfp")
  ) {
    return { kind: "businessFormationRespond", formationKey: tail[2].toLowerCase() };
  }
  if (
    tail.length === 4 && tail[0] === "business" && tail[1] === "formations" &&
    tail[3] === "activate" && validKey(tail[2], "bfp")
  ) {
    return { kind: "businessFormationActivate", formationKey: tail[2].toLowerCase() };
  }
  if (tail.length === 2 && tail[0] === "business" && tail[1] === "products") {
    return { kind: "businessProductCreate" };
  }
  if (
    tail.length === 3 && tail[0] === "business" && tail[1] === "inputs" &&
    tail[2] === "purchases"
  ) return { kind: "businessInputPurchase" };
  if (tail.length === 2 && tail[0] === "business" && tail[1] === "production-runs") {
    return { kind: "businessProduction" };
  }
  if (
    tail.length === 4 && tail[0] === "business" && tail[1] === "products" &&
    tail[3] === "pricing" && validKey(tail[2], "bpr")
  ) return { kind: "businessPrice", productKey: tail[2].toLowerCase() };
  if (tail.length === 3 && tail[0] === "business" && tail[1] === "employees" && tail[2] === "hire") {
    return { kind: "businessHire" };
  }
  if (
    tail.length === 4 && tail[0] === "business" && tail[1] === "employees" &&
    tail[3] === "terminate" && validKey(tail[2], "emp")
  ) return { kind: "businessTerminate", employeeKey: tail[2].toLowerCase() };
  if (tail.length === 2 && tail[0] === "business" && tail[1] === "status") {
    return { kind: "businessStatus" };
  }
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
    value && PUBLIC_KEY.test(value.toLowerCase()) &&
      value.toLowerCase().startsWith(`${prefix}_`),
  );
}
