export const RATE_LIMIT_DIMENSIONS = [
  "action",
  "game",
  "identity",
  "ip",
] as const;

export type RateLimitDimension = typeof RATE_LIMIT_DIMENSIONS[number];
export type PlayerRateLimitProfile =
  | "attendance"
  | "login"
  | "read"
  | "scanner"
  | "sensitive"
  | "write";

export interface RateLimitBucketPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
  readonly blockSeconds: number;
}

export interface RateLimitBucketInput extends RateLimitBucketPolicy {
  readonly dimension: RateLimitDimension;
  readonly keyHash: string;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
  readonly limitingDimension: RateLimitDimension | null;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
}

export interface RateLimitRepository {
  consume(buckets: readonly RateLimitBucketInput[]): Promise<RateLimitDecision>;
}

export class RateLimitError extends Error {
  constructor(
    readonly code:
      | "invalid_rate_limit_config"
      | "invalid_rate_limit_context"
      | "rate_limit_service_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}
