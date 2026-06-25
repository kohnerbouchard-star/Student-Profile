import {
  type ContractCashRewardWriteInput,
  type ContractRewardLedgerWriter,
  issueContractRewards,
} from "./contractRewardService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const PLAYER_ID = "00000000-0000-4000-8000-000000000301";
const STAFF_ID = "00000000-0000-4000-8000-000000000401";
const NOW = "2026-06-25T12:30:00.000Z";

Deno.test("contract reward service issues cash through ledger dependency", async () => {
  const ledger = new CapturingLedgerWriter();
  const result = await issueContractRewards({
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    playerId: PLAYER_ID,
    rewardPayload: {
      cash: {
        amount: 250.125,
        currencyCode: "eco",
      },
    },
    issuedAt: NOW,
    staffId: STAFF_ID,
    requestId: "request-1",
    ledger,
  });

  assertEquals(result.ok, true);
  assertEquals(result.rewardResult.status, "applied");
  assertEquals(result.rewardResult.appliedRewards[0], {
    rewardType: "cash",
    ledgerEntryId: "ledger-1",
    amount: 250.13,
    accountType: "cash",
    currencyCode: "ECO",
    balance: 1250,
  });
  assertEquals(ledger.inputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    playerId: PLAYER_ID,
    amount: 250.13,
    accountType: "cash",
    currencyCode: "ECO",
    staffId: STAFF_ID,
    requestId: "request-1",
    issuedAt: NOW,
  });
});

Deno.test("contract reward service rejects unsupported reward types before writing", async () => {
  const ledger = new CapturingLedgerWriter();
  const result = await issueContractRewards({
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    playerId: PLAYER_ID,
    rewardPayload: {
      cash: {
        amount: 250,
      },
      items: [{
        itemId: "00000000-0000-4000-8000-000000000501",
        quantity: 1,
      }],
      storyFlagsToSet: [],
    },
    issuedAt: NOW,
    staffId: STAFF_ID,
    requestId: "request-1",
    ledger,
  });

  if (result.ok) {
    throw new Error("Expected unsupported reward result.");
  }

  assertEquals(result.code, "unsupported_reward_type");
  assertEquals(result.rewardResult.unsupportedRewardTypes, [
    "items",
    "storyFlagsToSet",
  ]);
  assertEquals(ledger.inputs.length, 0);
});

Deno.test("contract reward service reports invalid cash payload", async () => {
  const result = await issueContractRewards({
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    playerId: PLAYER_ID,
    rewardPayload: {
      cash: {
        amount: -10,
      },
    },
    issuedAt: NOW,
    staffId: STAFF_ID,
    requestId: "request-1",
    ledger: new CapturingLedgerWriter(),
  });

  if (result.ok) {
    throw new Error("Expected invalid reward result.");
  }

  assertEquals(result.code, "invalid_reward_payload");
  assertEquals(result.rewardResult.status, "failed");
});

Deno.test("contract reward service reports ledger failures without marking applied", async () => {
  const result = await issueContractRewards({
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    playerId: PLAYER_ID,
    rewardPayload: {
      cash: {
        amount: 250,
      },
    },
    issuedAt: NOW,
    staffId: STAFF_ID,
    requestId: "request-1",
    ledger: new CapturingLedgerWriter("fail"),
  });

  if (result.ok) {
    throw new Error("Expected failed reward result.");
  }

  assertEquals(result.code, "contract_reward_issue_failed");
  assertEquals(result.rewardResult.status, "failed");
  assertEquals(result.rewardResult.appliedRewards, []);
});

class CapturingLedgerWriter implements ContractRewardLedgerWriter {
  readonly inputs: ContractCashRewardWriteInput[] = [];

  constructor(private readonly mode: "ok" | "fail" = "ok") {}

  recordCashReward(
    input: ContractCashRewardWriteInput,
  ): Promise<{ readonly id: string; readonly balance: number }> {
    this.inputs.push(input);

    if (this.mode === "fail") {
      return Promise.reject(new Error("ledger unavailable"));
    }

    return Promise.resolve({
      id: "ledger-1",
      balance: 1250,
    });
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
