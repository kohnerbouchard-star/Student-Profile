export const PLAYER_BANKING_CURSOR_PATTERN = /^offset_(0|[1-9][0-9]{0,6})$/u;

export interface PlayerBankingPublicBalanceDto {
  /** Stable browser-safe account identity; internal account UUIDs stay server-side. */
  readonly accountKey: string;
  readonly accountKind: string;
  /** Transitional alias retained while the Player Banking client converges. */
  readonly accountType: string;
  /** Transitional alias for postedAmount. */
  readonly balance: number;
  readonly currencyCode: string;
  readonly postedAmount: number;
  readonly heldAmount: number;
  readonly availableAmount: number;
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
