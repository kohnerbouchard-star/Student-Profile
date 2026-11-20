import {
  handleStaffBootstrapRequest,
} from "../../../src/domains/auth/api/staffBootstrapHttpHandler.ts";
import {
  handleStaffSignupRequest,
} from "../../../src/domains/auth/api/staffSignupHttpHandler.ts";
import {
  handleLicensingActivationRequest,
} from "../../../src/domains/licensing/api/licensingActivationHttpHandler.ts";
import {
  readGameJoinCodeRoutePath,
} from "../../../src/domains/game-sessions/api/gameJoinCodeRoutePaths.ts";
import {
  handleResetGameJoinCodeRequest,
} from "../../../src/domains/game-sessions/api/gameJoinCodeResetHttpHandler.ts";
import {
  readInitialBalanceSeedRoutePath,
  readStaffLedgerAdjustmentRoutePath,
  readStaffPlayerLedgerHistoryRoutePath,
} from "../../../src/domains/economy/api/economyRoutePaths.ts";
import {
  handleStaffPlayerLedgerHistoryRequest,
} from "../../../src/domains/economy/api/staffPlayerLedgerHistoryHttpHandler.ts";
import {
  handleStaffLedgerAdjustmentRequest,
} from "../../../src/domains/economy/api/staffLedgerAdjustmentHttpHandler.ts";
import {
  handleInitialBalanceSeedRequest,
} from "../../../src/domains/economy/api/initialBalanceSeedHttpHandler.ts";
import {
  readStaffAttendanceDailyRoutePath,
  readStaffAttendanceScanRoutePath,
} from "../../../src/domains/attendance/api/attendanceRoutePaths.ts";
import {
  handleStaffAttendanceDailyRequest,
} from "../../../src/domains/attendance/api/staffAttendanceDailyHttpHandler.ts";
import {
  handleStaffAttendanceScanRequest,
} from "../../../src/domains/attendance/api/staffAttendanceScanHttpHandler.ts";
import {
  readPlayerRosterRoutePath,
} from "../../../src/domains/players/api/playerRosterRoutePaths.ts";
import {
  handlePlayerRosterRequest,
} from "../../../src/domains/players/api/playerRosterHttpHandler.ts";
import {
  handleResetPlayerAccessCodeRequest,
} from "../../../src/domains/players/api/playerAccessCodeResetHttpHandler.ts";
import { readGameSettingsRoutePath } from "../../../src/domains/game-sessions/api/gameSettingsRoutePaths.ts";
import {
  handleGameSettingsRequest,
} from "../../../src/domains/game-sessions/api/gameSettingsHttpHandler.ts";
import {
  readStaffStoreCatalogRoutePath,
} from "../../../src/domains/store/api/storeCatalogRoutePaths.ts";
import {
  handleStaffStoreCatalogRequest,
} from "../../../src/domains/store/api/storeCatalogHttpHandler.ts";
import {
  readStaffContractRoutePath,
} from "../../../src/domains/contracts/api/contractRoutePaths.ts";
import {
  handleStaffContractRequest,
} from "../../../src/domains/contracts/api/staffContractHttpHandler.ts";
import {
  readStaffDemoStorylineInitializeRoutePath,
} from "../../../src/domains/storylines/api/demoStorylineRoutePaths.ts";
import {
  handleStaffDemoStorylineInitializationRequest,
} from "../../../src/domains/storylines/api/staffDemoStorylineInitializationHttpHandler.ts";
import {
  resolveStaffForRequest,
  createAuthClient,
  createServiceClient,
} from "./classroomClients.ts";


export async function dispatchStaffRoutes(request: Request, url: URL): Promise<Response | null> {

  const gameJoinCodeRoute = readGameJoinCodeRoutePath(url.pathname);

  if (gameJoinCodeRoute) {
    return handleResetGameJoinCodeRequest(
      request,
      gameJoinCodeRoute.gameSessionId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const gameSettingsRoute = readGameSettingsRoutePath(url.pathname);

  if (gameSettingsRoute) {
    return handleGameSettingsRequest(request, gameSettingsRoute.gameSessionId, {
      resolveStaffForRequest,
    });
  }

  const staffStoreCatalogRoute = readStaffStoreCatalogRoutePath(url.pathname);

  if (staffStoreCatalogRoute) {
    return handleStaffStoreCatalogRequest(request, staffStoreCatalogRoute, {
      resolveStaffForRequest,
    });
  }

  const staffContractRoute = readStaffContractRoutePath(url.pathname);

  if (staffContractRoute) {
    return handleStaffContractRequest(request, staffContractRoute, {
      resolveStaffForRequest,
    });
  }

  const staffDemoStorylineInitializeRoute =
    readStaffDemoStorylineInitializeRoutePath(url.pathname);

  if (staffDemoStorylineInitializeRoute) {
    return handleStaffDemoStorylineInitializationRequest(
      request,
      staffDemoStorylineInitializeRoute,
      {
        resolveStaffForRequest,
      },
    );
  }

  const playerRosterRoute = readPlayerRosterRoutePath(url.pathname);

  if (playerRosterRoute?.kind === "players") {
    return handlePlayerRosterRequest(request, playerRosterRoute.gameSessionId, {
      resolveStaffForRequest,
    });
  }

  if (playerRosterRoute?.kind === "resetAccessCode") {
    return handleResetPlayerAccessCodeRequest(
      request,
      playerRosterRoute.gameSessionId,
      playerRosterRoute.playerId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const staffAttendanceDailyRoute = readStaffAttendanceDailyRoutePath(
    url.pathname,
  );

  if (staffAttendanceDailyRoute) {
    return handleStaffAttendanceDailyRequest(
      request,
      staffAttendanceDailyRoute.gameSessionId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const staffAttendanceScanRoute = readStaffAttendanceScanRoutePath(
    url.pathname,
  );

  if (staffAttendanceScanRoute) {
    return handleStaffAttendanceScanRequest(
      request,
      staffAttendanceScanRoute.gameSessionId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const initialBalanceSeedRoute = readInitialBalanceSeedRoutePath(url.pathname);

  if (initialBalanceSeedRoute) {
    return handleInitialBalanceSeedRequest(
      request,
      initialBalanceSeedRoute.gameSessionId,
      { resolveStaffForRequest },
    );
  }

  const staffPlayerLedgerHistoryRoute = readStaffPlayerLedgerHistoryRoutePath(
    url.pathname,
  );

  if (staffPlayerLedgerHistoryRoute) {
    return handleStaffPlayerLedgerHistoryRequest(
      request,
      staffPlayerLedgerHistoryRoute.gameSessionId,
      staffPlayerLedgerHistoryRoute.playerId,
      { resolveStaffForRequest },
    );
  }

  const staffLedgerAdjustmentRoute = readStaffLedgerAdjustmentRoutePath(
    url.pathname,
  );

  if (staffLedgerAdjustmentRoute) {
    return handleStaffLedgerAdjustmentRequest(
      request,
      staffLedgerAdjustmentRoute.gameSessionId,
      staffLedgerAdjustmentRoute.playerId,
      { resolveStaffForRequest },
    );
  }

  if (url.pathname.endsWith("/staff/bootstrap")) {
    return handleStaffBootstrapRequest(request, {
      createAuthClient,
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/staff/signup")) {
    return handleStaffSignupRequest(request, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return handleLicensingActivationRequest(request, {
      createAuthClient,
      createServiceClient,
    });
  }
  return null;
}
