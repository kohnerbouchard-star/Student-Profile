/// <reference lib="dom" />

import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  AdminMutationError,
  readAdminMutationIdentity,
} from "../../../platform/supabase/adminMutation.ts";
import { mutateAdminContract } from "../application/adminContractMutation.ts";
import { ContractContractError } from "../contracts/contractContractErrors.ts";
import {
  type StaffContractListResponseBody,
  type StaffContractWriteResponseBody,
  toStaffContractDto,
} from "../contracts/contractHttpContracts.ts";
import type { ContractRepository } from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";
import {
  ContractRewardLedgerRpcWriter,
  type ContractRewardLedgerWriter,
} from "../services/contractRewardService.ts";
import type { StaffContractRoute } from "./contractRoutePaths.ts";

import {
  readListFilters,
  readOptionalJsonObjectBody,
  readRequiredJsonObjectBody,
} from "./staffContractRequestParser.ts";
import {
  listStaffContractProgress,
  reviewStaffContractProgress,
} from "./staffContractProgressHttpHandler.ts";
export {
  listStaffContractProgress,
  reviewStaffContractProgress,
} from "./staffContractProgressHttpHandler.ts";
import { issueStaffContractRewards } from "./staffContractRewardHttpHandler.ts";

export interface StaffContractHttpHandlerDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: { readonly missingMessage: string },
  ) => Promise<
    | {
      readonly ok: true;
      readonly staff: {
        readonly id: string;
        readonly email?: string | null;
      };
      readonly serviceClient: EdgeSupabaseClient;
    }
    | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
  >;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly createRepository?: (
    serviceClient: EdgeSupabaseClient,
  ) => ContractRepository;
  readonly createRewardLedgerWriter?: (
    serviceClient: EdgeSupabaseClient,
  ) => ContractRewardLedgerWriter;
  readonly now?: () => string;
}

export async function handleStaffContractRequest(
  request: Request,
  route: StaffContractRoute,
  dependencies: StaffContractHttpHandlerDependencies,
): Promise<Response> {
  if (
    route.kind === "contracts" &&
    request.method !== "GET" &&
    request.method !== "POST"
  ) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or POST for staff contracts.",
      retryable: false,
    });
  }

  if (route.kind === "publish" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to publish a contract.",
      retryable: false,
    });
  }

  if (route.kind === "progress" && request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to list contract progress.",
      retryable: false,
    });
  }

  if (route.kind === "review" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to review contract progress.",
      retryable: false,
    });
  }

  if (route.kind === "issueRewards" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to issue contract rewards.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await dependencies.resolveStaffForRequest(
      request,
      envResult.value,
      {
        missingMessage:
          "A verified Supabase Auth user is required to manage contracts.",
      },
    );

    if (staffResult.ok !== true) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      route.gameSessionId,
      staffResult.staff.id,
    );

    if (ownershipResult.ok !== true) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(staffResult.serviceClient)
      : new SupabaseContractRepository(staffResult.serviceClient);
    const now = dependencies.now ?? (() => new Date().toISOString());

    if (route.kind === "contracts" && request.method === "GET") {
      const filters = readListFilters(new URL(request.url));
      const contracts = await repository.listGameSessionContracts({
        gameSessionId: route.gameSessionId,
        statuses: filters.statuses,
        sourceTypes: filters.sourceTypes,
        visibility: filters.visibility,
      });

      return jsonResponse<StaffContractListResponseBody>(200, {
        ok: true,
        contracts: contracts.map(toStaffContractDto),
      });
    }

    if (route.kind === "contracts" && request.method === "POST") {
      const body = await readRequiredJsonObjectBody(request);
      const result = await mutateAdminContract(staffResult.serviceClient, {
        gameSessionId: route.gameSessionId,
        staffUserId: staffResult.staff.id,
        operation: "create",
        body,
        identity: readAdminMutationIdentity(request, body),
      });

      return jsonResponse<StaffContractWriteResponseBody>(result.status, {
        ok: true,
        contract: result.contract,
      });
    }

    if (route.kind === "publish" && request.method === "POST") {
      const body = await readOptionalJsonObjectBody(request);
      const result = await mutateAdminContract(staffResult.serviceClient, {
        gameSessionId: route.gameSessionId,
        staffUserId: staffResult.staff.id,
        operation: "publish",
        contractId: route.contractId,
        body,
        identity: readAdminMutationIdentity(request, body),
      }, {
        now,
      });

      return jsonResponse<StaffContractWriteResponseBody>(result.status, {
        ok: true,
        contract: result.contract,
      });
    }

    if (route.kind === "progress" && request.method === "GET") {
      return await listStaffContractProgress(
        request,
        route.gameSessionId,
        route.contractId,
        repository,
      );
    }

    if (route.kind === "review" && request.method === "POST") {
      return await reviewStaffContractProgress(
        request,
        route.gameSessionId,
        route.contractId,
        route.progressId,
        repository,
        now(),
      );
    }

    if (route.kind === "issueRewards" && request.method === "POST") {
      const rewardLedgerWriter = dependencies.createRewardLedgerWriter
        ? dependencies.createRewardLedgerWriter(staffResult.serviceClient)
        : new ContractRewardLedgerRpcWriter(staffResult.serviceClient);

      return await issueStaffContractRewards({
        request,
        gameSessionId: route.gameSessionId,
        contractId: route.contractId,
        progressId: route.progressId,
        staffId: staffResult.staff.id,
        repository,
        rewardLedgerWriter,
        issuedAt: now(),
      });
    }

    return jsonError(405, {
      code: "method_not_allowed",
      message: "Contract method is not allowed.",
      retryable: false,
    });
  } catch (error) {
    return contractErrorToResponse(error);
  }
}

export function contractErrorToResponse(error: unknown): Response {
  if (error instanceof AdminMutationError) {
    return jsonError(error.status, {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    });
  }

  if (error instanceof EdgeActivationError) {
    return jsonError(error.status, {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    });
  }

  if (error instanceof ContractContractError) {
    return jsonError(400, {
      code: "invalid_contract_request",
      message: error.message,
      retryable: false,
    });
  }

  if (error instanceof ContractRepositoryError) {
    return jsonError(500, {
      code: error.code,
      message: "Contract request failed.",
      retryable: false,
    });
  }

  return jsonError(500, {
    code: "contract_request_failed",
    message: "Contract request failed.",
    retryable: false,
  });
}
