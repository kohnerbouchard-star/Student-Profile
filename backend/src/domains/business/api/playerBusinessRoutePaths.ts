import type { PlayerBusinessRoute } from "../contracts/playerBusinessContracts.ts";
import {
  matchPlayerBusinessManufacturingCancellationPath,
  matchPlayerBusinessManufacturingCollectionPath,
} from "./playerBusinessManufacturingRoutePaths.ts";

const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;
const PLAYER_EDGE_SERVICES = new Set(["player-api", "classroom-api"]);

export function readPlayerBusinessRoutePath(
  pathname: string,
): PlayerBusinessRoute | null {
  const segments = readBusinessPlayerRouteSegments(pathname);
  if (!segments || segments[0] !== "players" || segments[1] !== "me") {
    return null;
  }
  const canonicalPath = `/${segments.join("/")}`;
  const manufacturingCancellation =
    matchPlayerBusinessManufacturingCancellationPath(canonicalPath);
  if (manufacturingCancellation) {
    return {
      kind: "businessManufacturingCancel",
      businessKey: manufacturingCancellation.businessKey,
      jobKey: manufacturingCancellation.jobKey,
    };
  }
  const manufacturingCollection =
    matchPlayerBusinessManufacturingCollectionPath(canonicalPath);
  if (manufacturingCollection) {
    return {
      kind: "businessManufacturingCollection",
      businessKey: manufacturingCollection.businessKey,
    };
  }

  const tail = segments.slice(2);

  if (tail.length === 1 && tail[0] === "business") {
    return { kind: "businessRead", resource: "overview" };
  }
  if (
    tail.length === 2 && tail[0] === "business" &&
    tail[1] === "stockroom"
  ) {
    return { kind: "businessRead", resource: "stockroom" };
  }
  if (
    tail.length === 2 && tail[0] === "business" && tail[1] === "recipes"
  ) {
    return { kind: "businessRead", resource: "recipes" };
  }
  if (
    tail.length === 3 && tail[0] === "business" &&
    tail[1] === "workforce" && tail[2] === "candidates"
  ) {
    return { kind: "businessRead", resource: "workforceCandidates" };
  }
  if (
    tail.length === 2 && tail[0] === "business" &&
    tail[1] === "treasury"
  ) {
    return { kind: "businessTreasuryRead" };
  }
  if (
    tail.length === 3 && tail[0] === "business" &&
    tail[1] === "treasury" && tail[2] === "accounts"
  ) {
    return { kind: "businessTreasuryAccountOpen" };
  }
  if (
    tail.length === 4 && tail[0] === "business" &&
    tail[1] === "treasury" && tail[2] === "fx" &&
    tail[3] === "quotes"
  ) {
    return { kind: "businessTreasuryFxQuote" };
  }
  if (
    tail.length === 5 && tail[0] === "business" &&
    tail[1] === "treasury" && tail[2] === "fx" &&
    tail[3] === "orders" && tail[4] === "standard"
  ) {
    return { kind: "businessTreasuryFxStandard" };
  }
  if (
    tail.length === 5 && tail[0] === "business" &&
    tail[1] === "treasury" && tail[2] === "fx" &&
    tail[3] === "orders" && tail[4] === "instant"
  ) {
    return { kind: "businessTreasuryFxInstant" };
  }
  if (
    tail.length === 6 && tail[0] === "business" &&
    tail[1] === "treasury" && tail[2] === "fx" &&
    tail[3] === "orders" && tail[5] === "cancel" &&
    validKey(decodeSegment(tail[4]), "fxo")
  ) {
    return {
      kind: "businessTreasuryFxCancel",
      orderKey: decodeSegment(tail[4]),
    };
  }
  if (tail.length === 1 && tail[0] === "businesses") {
    return { kind: "businessCreate", operation: "directCreate" };
  }
  if (
    tail.length === 2 && tail[0] === "business" &&
    tail[1] === "formations"
  ) {
    return { kind: "businessCreate", operation: "formationPropose" };
  }
  if (
    tail.length === 4 && tail[0] === "business" &&
    tail[1] === "formations" && tail[3] === "respond" &&
    validKey(tail[2], "bfp")
  ) {
    return {
      kind: "businessCreate",
      operation: "formationRespond",
      formationKey: tail[2].toLowerCase(),
    };
  }
  if (
    tail.length === 4 && tail[0] === "business" &&
    tail[1] === "formations" && tail[3] === "activate" &&
    validKey(tail[2], "bfp")
  ) {
    return {
      kind: "businessCreate",
      operation: "formationActivate",
      formationKey: tail[2].toLowerCase(),
    };
  }
  if (
    tail.length === 3 && tail[0] === "business" && tail[1] === "store" &&
    tail[2] === "quotes"
  ) {
    return { kind: "businessStoreQuote" };
  }
  if (
    tail.length === 3 && tail[0] === "business" && tail[1] === "store" &&
    tail[2] === "purchases"
  ) {
    return { kind: "businessStorePurchase" };
  }
  if (
    tail.length === 2 && tail[0] === "business" && tail[1] === "products"
  ) {
    return { kind: "businessProductCreate" };
  }
  if (
    tail.length === 3 && tail[0] === "business" && tail[1] === "inputs" &&
    tail[2] === "purchases"
  ) {
    return { kind: "businessInputPurchase" };
  }
  if (
    tail.length === 2 && tail[0] === "business" &&
    tail[1] === "production-runs"
  ) {
    return { kind: "businessProduction" };
  }
  if (
    tail.length === 4 && tail[0] === "business" &&
    tail[1] === "products" && tail[3] === "pricing" &&
    validKey(tail[2], "bpr")
  ) {
    return { kind: "businessPrice", productKey: tail[2].toLowerCase() };
  }
  if (
    tail.length === 5 && tail[0] === "business" &&
    tail[1] === "workforce" && tail[2] === "candidates" &&
    tail[4] === "hire" && validKey(tail[3], "wfc")
  ) {
    return {
      kind: "businessCandidateHire",
      candidateKey: tail[3].toLowerCase(),
    };
  }
  if (
    tail.length === 3 && tail[0] === "business" &&
    tail[1] === "employees" && tail[2] === "hire"
  ) {
    return { kind: "businessHire" };
  }
  if (
    tail.length === 4 && tail[0] === "business" &&
    tail[1] === "employees" && tail[3] === "terminate" &&
    validKey(tail[2], "emp")
  ) {
    return {
      kind: "businessTerminate",
      employeeKey: tail[2].toLowerCase(),
    };
  }
  if (
    tail.length === 2 && tail[0] === "business" && tail[1] === "status"
  ) {
    return { kind: "businessStatus" };
  }
  return null;
}

function readBusinessPlayerRouteSegments(
  pathname: string,
): readonly string[] | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "players") return segments;
  if (
    PLAYER_EDGE_SERVICES.has(segments[0] || "") &&
    segments[1] === "players"
  ) {
    return segments.slice(1);
  }
  if (
    segments[0] === "functions" && segments[1] === "v1" &&
    PLAYER_EDGE_SERVICES.has(segments[2] || "") &&
    segments[3] === "players"
  ) {
    return segments.slice(3);
  }
  return null;
}

function validKey(value: string | undefined, prefix: string): boolean {
  return Boolean(
    value && PUBLIC_KEY.test(value.toLowerCase()) &&
      value.toLowerCase().startsWith(`${prefix}_`),
  );
}

function decodeSegment(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}
