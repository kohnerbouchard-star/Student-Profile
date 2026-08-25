import {
  discoverStaffGameSessionIds,
  hydrateStaffGameSessionBootstrap,
  readStaffBootstrapProfile,
  type StaffBootstrapProfile,
  type StaffGameSessionBootstrapRecord,
  type StaffGameSessionBootstrapRepository,
} from "../../../src/domains/auth/application/staffGameSessionBootstrap.ts";
import {
  createSupabaseStaffGameSessionBootstrapRepository,
  type StaffGameSessionBootstrapSupabaseClient,
} from "../../../src/domains/auth/infrastructure/supabaseStaffGameSessionBootstrapRepository.ts";
import {
  type AdminSecurityGuardResult,
  guardAdminRequest,
} from "./adminSecurityGuard.ts";
import {
  type AdminRequestApplicationContext,
  createAdminRequestApplicationContext,
} from "./adminRequestApplicationContext.ts";

type ReviewedAdminSecurity = Extract<
  AdminSecurityGuardResult,
  { readonly ok: true }
>;

export interface AdminOwnedGameIdentity {
  readonly id: string;
}

export interface AdminBootstrapStaffRow {
  readonly id: string;
  readonly supabase_auth_user_id: string | null;
  readonly email: string;
  readonly display_name: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Exact persistence-shaped game row previously loaded by resolveContext. */
export interface AdminBootstrapGameRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly game_join_code: string | null;
  readonly game_join_code_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AdminBootstrapGameEntry {
  readonly applicationContext: AdminRequestApplicationContext;
  readonly game: AdminBootstrapGameRow;
}

export interface AdminBootstrapIdentityContext {
  readonly user: { readonly id?: string };
  readonly staff: { readonly id: string };
  readonly games: readonly AdminOwnedGameIdentity[];
  readonly service: unknown;
}

type AdminSecurityContext = Parameters<typeof guardAdminRequest>[1];

export type AdminBootstrapAuthorizedContext =
  & AdminBootstrapIdentityContext
  & AdminSecurityContext;

export type HydratedAdminBootstrapContext<
  TContext extends AdminBootstrapIdentityContext,
> =
  & Omit<TContext, "staff" | "games">
  & {
    readonly staff: AdminBootstrapStaffRow;
    readonly games: readonly AdminBootstrapGameRow[];
    readonly gameBootstrapEntries: readonly AdminBootstrapGameEntry[];
    readonly security: ReviewedAdminSecurity;
  };

export type AdminBootstrapCompositionIssue = "profile" | "games";

export class AdminBootstrapCompositionError extends Error {
  readonly status: number;
  readonly responseMessage: string;

  constructor(readonly issue: AdminBootstrapCompositionIssue) {
    super(
      issue === "profile"
        ? "Administrator profile could not be loaded."
        : "Administrator games could not be loaded.",
    );
    this.name = "AdminBootstrapCompositionError";
    this.status = issue === "profile" ? 403 : 500;
    this.responseMessage = issue === "profile"
      ? "This account is not registered as staff."
      : "Administrator games could not be loaded.";
  }
}

interface AdminBootstrapCompositionDependencies {
  readonly repository?: StaffGameSessionBootstrapRepository;
  readonly createApplicationContext?:
    typeof createAdminRequestApplicationContext;
}

interface AdminBootstrapAuthorizationDependencies
  extends AdminBootstrapCompositionDependencies {
  readonly createRequestId?: () => string;
}

type RejectedAdminSecurity = Extract<
  AdminSecurityGuardResult,
  { readonly ok: false }
>;

export type AdminBootstrapAuthorizationResult<
  TContext extends AdminBootstrapAuthorizedContext,
> =
  | RejectedAdminSecurity
  | {
    readonly ok: true;
    readonly context: HydratedAdminBootstrapContext<TContext>;
  };

export async function discoverAdminOwnedGameIdentities(
  service: unknown,
  staffUserId: string,
  dependencies: AdminBootstrapCompositionDependencies = {},
): Promise<readonly AdminOwnedGameIdentity[]> {
  const repository = dependencies.repository ??
    createSupabaseStaffGameSessionBootstrapRepository(
      service as StaffGameSessionBootstrapSupabaseClient,
    );
  try {
    const gameSessionIds = await discoverStaffGameSessionIds(repository, {
      staffUserId,
      visibility: "all",
    });
    return Object.freeze(gameSessionIds.map((id) => Object.freeze({ id })));
  } catch {
    throw new AdminBootstrapCompositionError("games");
  }
}

export async function hydrateAdminBootstrapContext<
  TContext extends AdminBootstrapIdentityContext,
>(
  input: {
    readonly context: TContext;
    readonly security: ReviewedAdminSecurity;
    readonly requestId: string;
  },
  dependencies: AdminBootstrapCompositionDependencies = {},
): Promise<HydratedAdminBootstrapContext<TContext>> {
  const repository = dependencies.repository ??
    createSupabaseStaffGameSessionBootstrapRepository(
      input.context.service as StaffGameSessionBootstrapSupabaseClient,
    );
  const profile = await loadProfile(
    repository,
    input.context.staff.id,
    input.context.user.id,
  );

  try {
    const createApplicationContext = dependencies.createApplicationContext ??
      createAdminRequestApplicationContext;
    const applicationContexts = input.context.games.map((ownedGame) =>
      createApplicationContext({
        ownedGame,
        staffUserId: input.context.staff.id,
        security: input.security,
        requestId: input.requestId,
      })
    );
    const hydratedEntries = await hydrateStaffGameSessionBootstrap(
      repository,
      {
        applicationContexts,
        visibility: "all",
      },
    );
    const gameBootstrapEntries = Object.freeze(
      hydratedEntries.map((entry) =>
        Object.freeze({
          applicationContext: entry.applicationContext,
          game: toAdminGameRow(entry.gameSession),
        })
      ),
    );

    return Object.freeze({
      ...input.context,
      staff: toAdminStaffRow(profile),
      games: Object.freeze(gameBootstrapEntries.map((entry) => entry.game)),
      gameBootstrapEntries,
      security: input.security,
    }) as HydratedAdminBootstrapContext<TContext>;
  } catch {
    throw new AdminBootstrapCompositionError("games");
  }
}

export async function authorizeAndHydrateAdminBootstrapContext<
  TContext extends AdminBootstrapAuthorizedContext,
>(
  request: Request,
  context: TContext,
  path: string,
  dependencies: AdminBootstrapAuthorizationDependencies = {},
): Promise<AdminBootstrapAuthorizationResult<TContext>> {
  const security = await guardAdminRequest(request, context, path);
  if (security.ok === false) return security;

  const createRequestId = dependencies.createRequestId ??
    (() => crypto.randomUUID());
  const hydratedContext = await hydrateAdminBootstrapContext({
    context,
    security,
    requestId: createRequestId(),
  }, dependencies);

  return Object.freeze({ ok: true, context: hydratedContext });
}

export function applicationContextForAdminGame(
  entries: readonly AdminBootstrapGameEntry[],
  game: AdminBootstrapGameRow,
): AdminRequestApplicationContext {
  const entry = entries.find((candidate) => candidate.game === game);
  if (!entry) throw new AdminBootstrapCompositionError("games");
  return entry.applicationContext;
}

async function loadProfile(
  repository: StaffGameSessionBootstrapRepository,
  staffUserId: string,
  supabaseAuthUserId: string | undefined,
): Promise<StaffBootstrapProfile> {
  try {
    const profile = await readStaffBootstrapProfile(repository, {
      staffUserId,
    });
    if (
      !supabaseAuthUserId ||
      profile.supabaseAuthUserId !== supabaseAuthUserId
    ) {
      throw new AdminBootstrapCompositionError("profile");
    }
    return profile;
  } catch {
    throw new AdminBootstrapCompositionError("profile");
  }
}

function toAdminStaffRow(
  profile: StaffBootstrapProfile,
): AdminBootstrapStaffRow {
  return Object.freeze({
    id: profile.id,
    supabase_auth_user_id: profile.supabaseAuthUserId,
    email: profile.email,
    display_name: profile.displayName,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  });
}

function toAdminGameRow(
  gameSession: StaffGameSessionBootstrapRecord,
): AdminBootstrapGameRow {
  return Object.freeze({
    id: gameSession.id,
    name: gameSession.name,
    status: gameSession.status,
    game_join_code: gameSession.gameJoinCode,
    game_join_code_status: gameSession.gameJoinCodeStatus,
    created_at: gameSession.createdAt,
    updated_at: gameSession.updatedAt,
  });
}
