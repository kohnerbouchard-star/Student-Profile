import { PlayerGameDashboardError } from "../contracts/playerGameDashboardContracts.ts";

export function readFailed(): PlayerGameDashboardError {
  return new PlayerGameDashboardError(
    "game_dashboard_read_failed",
    "Player game dashboard could not be loaded.",
    500,
  );
}
