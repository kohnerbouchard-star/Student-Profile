/// <reference lib="dom" />

import {
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  DEMO_STORYLINE_INITIALIZATION_MODES,
  DemoStorylineInitializationError,
  type DemoStorylineInitializationMode,
  type DemoStorylineInitializationRepository,
  type DemoStorylineInitializationSuccessBody,
} from "../contracts/demoStorylineInitializationContracts.ts";
import {
  SupabaseDemoStorylineInitializationRepository,
} from "../infrastructure/supabaseDemoStorylineInitializationRepository.ts";
import type {
  StaffDemoStorylineInitializeRoute,
} from "./demoStorylineRoutePaths.ts";

export interface StaffDemoStorylineInitializationHttpDependencies {
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
  ) => DemoStorylineInitializationRepository;
}

export async function handleStaffDemoStorylineInitializationRequest(
  request: Request,
  route: StaffDemoStorylineInitializeRoute,
  dependencies: StaffDemoStorylineInitializationHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to initialize the demo storyline.",
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
          "A verified Supabase Auth user is required to initialize demo storylines.",
      },
    );

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      route.gameSessionId,
      staffResult.staff.id,
    );

    if (!ownershipResult.ok) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    const body = await readOptionalJsonObjectBody(request);
    const mode = readMode(body.mode);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(staffResult.serviceClient)
      : new SupabaseDemoStorylineInitializationRepository(
        staffResult.serviceClient,
      );
    const demoStoryline = await repository.initialize({
      gameSessionId: route.gameSessionId,
      mode,
    });

    return jsonResponse<DemoStorylineInitializationSuccessBody>(200, {
      ok: true,
      demoStoryline,
    });
  } catch (error) {
    if (error instanceof DemoStorylineInitializationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    return jsonError(500, {
      code: "demo_storyline_initialization_failed",
      message: "Demo storyline initialization failed.",
      retryable: false,
    });
  }
}

async function readOptionalJsonObjectBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (_error) {
    throw invalidRequest("Request body must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }

  return value;
}

function readMode(value: unknown): DemoStorylineInitializationMode {
  if (value === undefined || value === null) {
    return "missing_only";
  }

  if (isAllowedMode(value)) {
    return value;
  }

  throw invalidRequest(
    "mode must be missing_only or reset_empty_only when provided.",
  );
}

function isAllowedMode(
  value: unknown,
): value is DemoStorylineInitializationMode {
  return typeof value === "string" &&
    DEMO_STORYLINE_INITIALIZATION_MODES.includes(
      value as DemoStorylineInitializationMode,
    );
}

function invalidRequest(message: string): DemoStorylineInitializationError {
  return new DemoStorylineInitializationError(
    "invalid_demo_storyline_initialization_request",
    message,
    400,
  );
}
