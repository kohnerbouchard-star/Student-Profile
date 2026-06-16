import { resolveStaffIdentity } from "../../../auth/staffAccess";
import type { StaffAccessRepository } from "../../../auth/staffAccess";
import type { AccessBoundaryError } from "../../../auth/types";
import type { AuditRepository } from "../../../supabase/auditRepository";
import {
  createGame,
  CreateGameValidationError,
  type CreateGameResult,
} from "../application/createGame";
import {
  CreateGameRouteValidationError,
  normalizeCreateGameRouteBody,
} from "../contracts/normalizeCreateGameRouteBody";
import type {
  CreateGameRouteErrorBody,
  CreateGameRouteErrorResult,
  CreateGameRouteRequest,
  CreateGameRouteResult,
  CreateGameRouteSuccessResult,
} from "../contracts/createGameRouteContracts";
import type { GameCreationRepository } from "../infrastructure/gameRepository";

export interface CreateGameRouteDependencies {
  readonly staffRepository: Pick<
    StaffAccessRepository,
    "findStaffUserBySupabaseAuthUserId"
  >;
  readonly gameRepository: GameCreationRepository;
  readonly auditRepository: Pick<AuditRepository, "writeAuditLogEntry">;
}

export async function handleCreateGameRoute(
  request: CreateGameRouteRequest,
  dependencies: CreateGameRouteDependencies,
): Promise<CreateGameRouteResult> {
  if (!request.supabaseAuthUser?.id) {
    return errorResult(401, {
      code: "missing_staff_auth_user",
      message: "A verified Supabase Auth user is required to create a game.",
    });
  }

  const staffIdentityResult = await resolveStaffIdentity(
    request.supabaseAuthUser,
    dependencies.staffRepository,
  );

  if (!staffIdentityResult.ok) {
    return accessErrorResult(staffIdentityResult.error);
  }

  try {
    const body = normalizeCreateGameRouteBody(request.body);

    const result = await createGame(
      {
        ownerStaffUserId: staffIdentityResult.value.staffUserId,
        name: body.name,
        difficultyPreset: body.difficultyPreset,
        attendanceWindow: body.attendanceWindow,
        businessMarketWindow: body.businessMarketWindow,
        stockMarketWindow: body.stockMarketWindow,
        newsSchedule: body.newsSchedule,
        audit: {
          source: request.source ?? "game_creation_route",
          requestId: request.requestId,
          metadata: {
            route: "create_game",
            staff_user_id: staffIdentityResult.value.staffUserId,
          },
        },
      },
      {
        gameRepository: dependencies.gameRepository,
        auditRepository: dependencies.auditRepository,
      },
    );

    return successResult(result);
  } catch (error) {
    if (error instanceof CreateGameRouteValidationError) {
      return errorResult(error.status, {
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error instanceof CreateGameValidationError) {
      return errorResult(400, {
        code: "invalid_game_creation_input",
        message: error.message,
      });
    }

    throw error;
  }
}

function successResult(result: CreateGameResult): CreateGameRouteSuccessResult {
  return {
    ok: true,
    status: 201,
    body: {
      gameSession: result.gameSession,
      gameSettings: result.gameSettings,
      auditLogged: result.auditLogged,
    },
  };
}

function accessErrorResult(
  error: AccessBoundaryError,
): CreateGameRouteErrorResult {
  return errorResult(error.status, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

function errorResult(
  status: number,
  error: CreateGameRouteErrorBody["error"],
): CreateGameRouteErrorResult {
  return {
    ok: false,
    status,
    body: { error },
  };
}
