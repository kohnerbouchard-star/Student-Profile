interface OperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

interface PreDispatchInput {
  readonly request: Request;
  readonly path: string;
  readonly resolveOwnedGame: (gameId: string) => unknown | null | undefined;
}

const RETIRED_SETTLEMENT_SUFFIX = /^\/businesses\/(biz_[0-9a-f]{32})\/settle$/u;

export function handleRetiredBusinessSettlement(
  request: Request,
  suffix: string,
): OperationResult {
  if (
    request.method !== "POST" ||
    !RETIRED_SETTLEMENT_SUFFIX.test(suffix)
  ) {
    return { handled: false };
  }

  return {
    handled: true,
    status: 410,
    body: {
      code: "business_cycle_settlement_retired",
      message:
        "Administrator-authored Business cycle settlement has been retired. Store receipts and guarded server-owned periods are authoritative.",
    },
  };
}

export function preDispatchRetiredBusinessSettlement(
  input: PreDispatchInput,
): OperationResult {
  const gameRoute = input.path.match(/^\/games\/([^/]+)(\/.*)?$/u);
  if (!gameRoute) return { handled: false };

  const retired = handleRetiredBusinessSettlement(
    input.request,
    gameRoute[2] ?? "",
  );
  if (!retired.handled) return retired;

  const gameId = decodeURIComponent(gameRoute[1]);
  if (!input.resolveOwnedGame(gameId)) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "game_not_found",
        message: "That game is not available to this administrator.",
      },
    };
  }

  return retired;
}
