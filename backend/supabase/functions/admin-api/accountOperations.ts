function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function audit(
  service: any,
  input: {
    gameSessionId?: string | null;
    staffUserId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, any>;
  },
): Promise<void> {
  const result = await service.from("audit_log").insert({
    game_session_id: input.gameSessionId || null,
    actor_type: "staff_user",
    actor_id: input.staffUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId || null,
    metadata: input.metadata || {},
  });
  if (result.error) throw result.error;
}

const HELP_ARTICLES: Record<string, Array<Record<string, string>>> = {
  "/help/admin-console": [
    {
      id: "admin-start",
      title: "Administrator console basics",
      summary:
        "Select a game, review the overview, and use the left navigation to manage the simulation.",
    },
  ],
  "/help/start-game": [
    {
      id: "start-game",
      title: "Starting a game",
      summary:
        "Select the active game, generate a game code, and share the new code with players.",
    },
  ],
  "/help/players": [
    {
      id: "player-management",
      title: "Player management",
      summary:
        "Create players, reset access codes, review economic history, and use archival instead of destructive deletion.",
    },
  ],
  "/help/attendance": [
    {
      id: "attendance-scan",
      title: "Attendance scanning",
      summary:
        "Scan a player access code, correct attendance manually, and lock completed attendance dates.",
    },
  ],
  "/help/market": [
    {
      id: "market-read-only",
      title: "Marketplace monitoring",
      summary:
        "The administrator marketplace is read-only. Review prices, events, trades, and company financials.",
    },
  ],
  "/help/store": [
    {
      id: "store-management",
      title: "Store and rewards",
      summary:
        "Create or edit store items, manage stock, and use item UUIDs when attaching contract rewards.",
    },
  ],
  "/help/troubleshooting": [
    {
      id: "troubleshooting",
      title: "Troubleshooting",
      summary:
        "Copy diagnostics, verify the selected game, and retry only after the current request finishes.",
    },
  ],
};

export async function handleAccountOperation(
  service: any,
  input: {
    path: string;
    method: string;
    staff: any;
    games: any[];
    body: Record<string, any>;
  },
): Promise<any> {
  const { path, method, staff } = input;
  const body = object(input.body);

  if (path === "/account/profile" && method === "PATCH") {
    const displayName = text(body.displayName || body.name);
    if (!displayName) {
      return {
        handled: true,
        status: 400,
        body: {
          code: "display_name_required",
          message: "A display name is required.",
        },
      };
    }
    const result = await service
      .from("staff_users")
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staff.id)
      .select("id,email,display_name,created_at,updated_at")
      .maybeSingle();
    if (result.error) throw result.error;
    await audit(service, {
      staffUserId: staff.id,
      action: "account.profile_updated",
      targetType: "staff_user",
      targetId: staff.id,
      metadata: { displayName },
    });
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          profile: {
            id: result.data.id,
            accountId: result.data.id,
            displayName: result.data.display_name,
            name: result.data.display_name,
            email: result.data.email,
            role: "game_admin",
            updatedAt: result.data.updated_at,
          },
        },
      },
    };
  }

  if (path === "/account/preferences" && method === "GET") {
    const result = await service
      .from("staff_admin_preferences")
      .select("preferences,updated_at")
      .eq("staff_user_id", staff.id)
      .maybeSingle();
    if (result.error) throw result.error;
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          preferences: result.data?.preferences || {},
          updatedAt: result.data?.updated_at || null,
        },
      },
    };
  }

  if (path === "/account/preferences" && ["PATCH", "PUT"].includes(method)) {
    const preferences = object(body.preferences || body.payload || body);
    for (const key of ["staffUserId", "id", "adminOperation"]) {
      delete preferences[key];
    }
    const result = await service
      .from("staff_admin_preferences")
      .upsert({
        staff_user_id: staff.id,
        preferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: "staff_user_id" })
      .select("preferences,updated_at")
      .maybeSingle();
    if (result.error) throw result.error;
    return {
      handled: true,
      status: 200,
      body: {
        data: { saved: true, preferences: result.data?.preferences || {} },
      },
    };
  }

  if (path === "/account/preferences/reset" && method === "POST") {
    const result = await service
      .from("staff_admin_preferences")
      .upsert({
        staff_user_id: staff.id,
        preferences: {},
        updated_at: new Date().toISOString(),
      }, { onConflict: "staff_user_id" })
      .select("preferences,updated_at")
      .maybeSingle();
    if (result.error) throw result.error;
    return {
      handled: true,
      status: 200,
      body: {
        data: { reset: true, preferences: result.data?.preferences || {} },
      },
    };
  }

  if (HELP_ARTICLES[path] && method === "GET") {
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          articles: HELP_ARTICLES[path],
          implementationStatus: "available",
        },
      },
    };
  }

  const archiveMatch = path.match(/^\/games\/([^/]+)\/archive$/);
  if (archiveMatch && method === "POST") {
    const gameId = decodeURIComponent(archiveMatch[1]);
    const game = input.games.find((item) => String(item.id) === gameId);
    if (!game) {
      return {
        handled: true,
        status: 404,
        body: {
          code: "game_not_found",
          message: "Game was not found for this administrator.",
        },
      };
    }
    const confirmation = text(
      body.confirmation || body.confirmName || body.value,
    );
    const confirmed = body.confirmArchive === true || body.confirm === true ||
      confirmation.toLowerCase() === "archive" || confirmation === game.name;
    if (!confirmed) {
      return {
        handled: true,
        status: 409,
        body: {
          code: "game_archive_confirmation_required",
          message:
            "Confirm the game name or submit ARCHIVE before archiving this game.",
        },
      };
    }

    const idempotencyKey = text(body.idempotencyKey) ||
      `legacy.archive.${crypto.randomUUID()}`;
    const expectedVersion = Number.isSafeInteger(Number(body.expectedVersion)) &&
        Number(body.expectedVersion) > 0
      ? Number(body.expectedVersion)
      : null;
    const result = await service.rpc("transition_game_lifecycle_atomic_v1", {
      p_game_session_id: gameId,
      p_staff_user_id: staff.id,
      p_action: "archive",
      p_idempotency_key: idempotencyKey,
      p_expected_version: expectedVersion,
    });
    if (result.error) {
      const message = String(result.error.message || "").toUpperCase();
      if (message.includes("GAME_LIFECYCLE_TRANSITION_INVALID")) {
        return {
          handled: true,
          status: 409,
          body: {
            code: "game_must_be_ended_before_archive",
            message: "End the game before archiving it.",
          },
        };
      }
      if (message.includes("GAME_LIFECYCLE_VERSION_CONFLICT")) {
        return {
          handled: true,
          status: 409,
          body: {
            code: "game_lifecycle_version_conflict",
            message: "The game lifecycle changed. Reload before archiving.",
          },
        };
      }
      throw result.error;
    }
    const transition = result.data?.[0] || null;
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          archived: true,
          outcome: transition?.transition_outcome || "applied",
          game: {
            ...game,
            status: transition?.operational_status || "archived",
            lifecycleState: transition?.lifecycle_state || "archived",
            lifecycleVersion: transition?.lifecycle_version || expectedVersion,
          },
        },
      },
    };
  }

  return { handled: false };
}
