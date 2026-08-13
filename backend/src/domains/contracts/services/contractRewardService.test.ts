import {
  type ContractCashRewardWriteInput,
  type ContractRewardAtomicApplyInput,
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
    accountType: "checking",
    currencyCode: "ECO",
    balance: 1250,
  });
  assertEquals(ledger.inputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    playerId: PLAYER_ID,
    amount: 250.13,
    accountType: "checking",
    currencyCode: "ECO",
    staffId: STAFF_ID,
    requestId: "request-1",
    issuedAt: NOW,
  });
});


Deno.test("contract reward service delegates cash and Story flags to one atomic writer", async () => {
  const writer = new CapturingAtomicRewardWriter();
  const result = await issueContractRewards({
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    playerId: PLAYER_ID,
    rewardPayload: {
      cash: { amount: 300 },
      storyFlagsToSet: [{
        flagKey: "meridian_contract_complete_v1",
        value: true,
      }],
    },
    issuedAt: NOW,
    staffId: STAFF_ID,
    requestId: "request-atomic",
    ledger: writer,
  });

  assertEquals(result.ok, true);
  assertEquals(result.rewardResult.status, "applied");
  assertEquals(result.rewardResult.appliedRewards, [{
    rewardType: "checking",
    ledgerEntryId: "ledger-atomic",
    amount: 300,
    accountType: "checking",
    currencyCode: "NRC",
    balance: 1300,
  }, {
    rewardType: "story_flag",
    flagKey: "meridian_contract_complete_v1",
    value: true,
  }]);
  assertEquals(writer.inputs, [{
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    staffId: STAFF_ID,
    requestId: "request-atomic",
  }]);
  assertEquals(writer.cashInputs.length, 0);
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


class CapturingAtomicRewardWriter implements ContractRewardLedgerWriter {
  readonly inputs: ContractRewardAtomicApplyInput[] = [];
  readonly cashInputs: ContractCashRewardWriteInput[] = [];

  applyRewardPlanAtomically(
    input: ContractRewardAtomicApplyInput,
  ): Promise<{
    readonly rewardApplied: boolean;
    readonly alreadyApplied: boolean;
    readonly appliedAt: string;
    readonly rewardResult: {
      readonly status: "applied";
      readonly appliedRewards: readonly [{
        readonly rewardType: "checking";
        readonly ledgerEntryId: string;
        readonly amount: number;
        readonly accountType: string;
        readonly currencyCode: string;
        readonly balance: number;
      }, {
        readonly rewardType: "story_flag";
        readonly flagKey: string;
        readonly value: true;
      }];
      readonly skippedRewards: readonly [];
      readonly failedRewards: readonly [];
      readonly unsupportedRewardTypes: readonly [];
    };
  }> {
    this.inputs.push(input);
    return Promise.resolve({
      rewardApplied: true,
      alreadyApplied: false,
      appliedAt: NOW,
      rewardResult: {
        status: "applied",
        appliedRewards: [{
          rewardType: "checking",
          ledgerEntryId: "ledger-atomic",
          amount: 300,
          accountType: "checking",
          currencyCode: "NRC",
          balance: 1300,
        }, {
          rewardType: "story_flag",
          flagKey: "meridian_contract_complete_v1",
          value: true,
        }],
        skippedRewards: [],
        failedRewards: [],
        unsupportedRewardTypes: [],
      },
    });
  }

  recordCashReward(
    input: ContractCashRewardWriteInput,
  ): Promise<{ readonly id: string; readonly balance: number }> {
    this.cashInputs.push(input);
    return Promise.resolve({ id: "unexpected", balance: 0 });
  }
}

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
