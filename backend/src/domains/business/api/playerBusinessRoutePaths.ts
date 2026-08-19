import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerBusinessRoute } from "../contracts/playerBusinessContracts.ts";

const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;

export function readPlayerBusinessRoutePath(pathname: string): PlayerBusinessRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (!segments || segments[0] !== "players" || segments[1] !== "me") return null;
  const tail = segments.slice(2);

  if (tail.length === 1 && tail[0] === "business") return { kind: "businessRead" };
  if (tail.length === 1 && tail[0] === "businesses") {
    return { kind: "businessCreate", operation: "directCreate" };
  }
  if (tail.length === 2 && tail[0] === "business" && tail[1] === "formations") {
    return { kind: "businessCreate", operation: "formationPropose" };
  }
  if (
    tail.length === 4 && tail[0] === "business" && tail[1] === "formations" &&
    tail[3] === "respond" && validKey(tail[2], "bfp")
  ) {
    return {
      kind: "businessCreate",
      operation: "formationRespond",
      formationKey: tail[2].toLowerCase(),
    };
  }
  if (
    tail.length === 4 && tail[0] === "business" && tail[1] === "formations" &&
    tail[3] === "activate" && validKey(tail[2], "bfp")
  ) {
    return {
      kind: "businessCreate",
      operation: "formationActivate",
      formationKey: tail[2].toLowerCase(),
    };
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
  return null;
}

function validKey(value: string | undefined, prefix: string): boolean {
  return Boolean(
    value && PUBLIC_KEY.test(value.toLowerCase()) && value.toLowerCase().startsWith(`${prefix}_`),
  );
}
