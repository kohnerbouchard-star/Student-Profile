const stagingRef = "eecvbssdvarfcykcfrny";
const claimRpc = "claim_campaign_effect_commands_v1";
const effects = new Set([
  "publish_campaign_market_event_v1",
  "publish_campaign_notification_v1",
  "apply_campaign_store_scarcity_v1",
  "apply_world_route_state_v1",
]);
const acknowledgements = new Set([
  "complete_campaign_effect_command_v2",
  "fail_campaign_effect_command_v2",
]);
const commandId = /^cec_[0-9a-f]{32}$/u;
export const fenceEpoch = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

export function stagingFenceEnabled(
  value: string | undefined,
  url: string,
  deployment: string | undefined,
): boolean {
  if (value === undefined) return false;
  if (value === "disposable-v1") {
    if (
      new URL(url).href !== "http://supabase_kong_econovaria:8000/" ||
      deployment !== undefined
    ) {
      throw new Error(
        "Disposable Campaign fixture cannot use a deployed project.",
      );
    }
    return true;
  }
  if (
    value !== "v1" ||
    new URL(url).href !== "https://" + stagingRef + ".supabase.co/" ||
    !deployment?.startsWith(stagingRef + "_")
  ) {
    throw new Error("Invalid Campaign staging fence configuration.");
  }
  return true;
}

type Args = Readonly<Record<string, unknown>>;
type Claim = { id: string; attempt: number };

function claimKey(game: unknown, key: unknown): string {
  if (typeof game !== "string" || typeof key !== "string") {
    throw new Error("Missing Campaign claim identity.");
  }
  return game + "\0" + key;
}

function claimIdentity(id: unknown, attempt: unknown): Claim {
  if (
    typeof id !== "string" || !commandId.test(id) ||
    typeof attempt !== "number" ||
    !Number.isInteger(attempt) || attempt < 1 || attempt > 25
  ) {
    throw new Error("Invalid Campaign claim generation.");
  }
  return { id, attempt };
}

/** Bind the whole invocation to its admitted epoch and actual outbox claims. */
export function createStagingCampaignRpc<
  Result extends { data: unknown; error: unknown },
>(
  epoch: string,
  rpc: (name: string, args: Args) => PromiseLike<Result>,
) {
  if (!fenceEpoch.test(epoch)) throw new Error("Invalid Campaign fence epoch.");
  const claims = new Map<string, Claim>();
  return async (name: string, args: Args): Promise<Result> => {
    let claim: Claim | undefined;
    if (effects.has(name)) {
      claim = claims.get(
        claimKey(
          args.p_game_session_id,
          args.p_idempotency_key ?? args.p_command_key,
        ),
      );
      if (!claim) throw new Error("Campaign effect has no scoped claim.");
    } else if (acknowledgements.has(name)) {
      claim = claimIdentity(
        args.p_command_public_id,
        args.p_expected_attempt_count,
      );
    } else if (
      name !== claimRpc && name !== "execute_campaign_event_atomic_v2"
    ) {
      throw new Error("Campaign RPC is outside the staging fence.");
    }
    const result = await rpc("write_staging_campaign_v1", {
      p_epoch: epoch,
      p_operation: name,
      p_args: args,
      p_command_id: claim?.id ?? null,
      p_attempt: claim?.attempt ?? null,
    });
    if (name === claimRpc) {
      claims.clear();
      if (result.error == null) {
        if (!Array.isArray(result.data)) {
          throw new Error("Invalid Campaign claim result.");
        }
        for (const row of result.data) {
          const key = claimKey(row?.game_session_id, row?.idempotency_key);
          if (claims.has(key)) {
            throw new Error("Duplicate Campaign claim identity.");
          }
          claims.set(key, claimIdentity(row?.command_id, row?.attempt_count));
        }
      }
    }
    return result;
  };
}
