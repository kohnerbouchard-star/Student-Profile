export const PLAYER_BANKING_CURSOR_PATTERN = /^offset_(0|[1-9][0-9]{0,6})$/u;

export interface PlayerBankingPublicBalanceDto {
  readonly accountType: string;
  readonly balance: number;
  readonly currencyCode: string;
}

export interface PlayerBankingPublicEntryDto {
  readonly entryKey: string;
  readonly accountType: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly entryType: string;
  readonly sourceDomain: string;
  readonly sourceAction: string;
  readonly createdAt: string;
}

export interface PlayerBankingPublicRepositoryEntry {
  readonly accountType: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly entryType: string;
  readonly sourceDomain: string;
  readonly sourceAction: string;
  readonly createdAt: string;
}

export interface PlayerBankingPublicPage {
  readonly balances: readonly PlayerBankingPublicBalanceDto[];
  readonly entries: readonly PlayerBankingPublicRepositoryEntry[];
  readonly hasMore: boolean;
}

export interface PlayerBankingPublicRepository {
  readPage(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<PlayerBankingPublicPage>;
}

export class PlayerBankingPublicError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerBankingPublicError";
  }
}
