import { readBusinessWorkspaceProjection } from "./supabaseBusinessStockroomReadRepository.ts";

declare const Deno: { test(name: string, run: () => Promise<void>): void };
const scope = {
  gameSessionId: "00000000-0000-4000-8000-000000000001",
  playerId: "00000000-0000-4000-8000-000000000002",
};
function governance() {
  return {
    businessKey: `biz_${"a".repeat(32)}`,
    entityType: "c_corporation",
    taxClassification: "corporate",
    formationState: "active",
    ownershipModelVersion: 2,
    ownerCount: 0,
    totalUnits: "10020",
    totalVotingUnits: "0",
    readOnly: true,
    currentPosition: null,
    managementAuthority: true,
    openProposals: [],
    corporateShareStructure: {
      authorizedShares: "1000000",
      issuedShares: "10020",
      treasuryShares: "0",
      outstandingShares: "10020",
      marketCustodyShares: "10020",
    },
  };
}
function read(value: unknown) {
  return readBusinessWorkspaceProjection(
    {
      rpc: async (name: string, args: unknown) => {
        if (
          name !== "read_owned_business_workspace_projection_v2" ||
          JSON.stringify(args) !==
            JSON.stringify({
              p_game_session_id: scope.gameSessionId,
              p_player_id: scope.playerId,
            })
        ) throw Error("wrong scope");
        return {
          data: {
            governance: value,
            productionReadiness: [],
            salesOffers: [],
            activity: [],
          },
          error: null,
        };
      },
    } as never,
    scope,
  );
}
Deno.test("operating mandate keeps workspace available when every common share is in custody", async () => {
  const result = await read(governance());
  if (JSON.stringify(result.governance) !== JSON.stringify(governance())) {
    throw Error("governance changed");
  }
});
Deno.test("zero-owner workspace rejects missing mandate, votes or unreconciled custody", async () => {
  for (
    const value of [
      { ...governance(), managementAuthority: false },
      { ...governance(), totalVotingUnits: "1" },
      { ...governance(), totalUnits: "0" },
      { ...governance(), corporateShareStructure: null },
      {
        ...governance(),
        corporateShareStructure: {
          ...governance().corporateShareStructure,
          marketCustodyShares: "10019",
        },
      },
      {
        ...governance(),
        corporateShareStructure: {
          ...governance().corporateShareStructure,
          marketCustodyShares: "10021",
        },
      },
      { ...governance(), businessKey: scope.gameSessionId },
    ]
  ) {
    let rejected = false;
    try {
      await read(value);
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error("invalid workspace accepted");
  }
});
