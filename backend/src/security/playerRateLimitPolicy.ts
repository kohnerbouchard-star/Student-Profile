import type {
  PlayerRateLimitProfile,
  RateLimitBucketPolicy,
  RateLimitDimension,
} from "./rateLimitContracts.ts";

export const PLAYER_RATE_LIMIT_POLICIES: Readonly<
  Record<
    PlayerRateLimitProfile,
    Readonly<Record<RateLimitDimension, RateLimitBucketPolicy>>
  >
> = Object.freeze({
  read: policy({
    ip: [240, 60, 30],
    identity: [180, 60, 30],
    game: [1_200, 60, 30],
    action: [90, 60, 30],
  }),
  write: policy({
    ip: [120, 60, 60],
    identity: [60, 60, 60],
    game: [600, 60, 60],
    action: [30, 60, 60],
  }),
  sensitive: policy({
    ip: [30, 300, 300],
    identity: [15, 300, 300],
    game: [300, 300, 300],
    action: [10, 300, 300],
  }),
  login: policy({
    // A classroom NAT can legitimately carry an entire roster through login.
    // The action-per-IP bucket remains narrower than the broad IP bucket and
    // blocks longer to retain credential-stuffing resistance.
    ip: [150, 300, 300],
    identity: [15, 300, 900],
    game: [300, 300, 300],
    action: [90, 300, 600],
  }),
  attendance: policy({
    // Player clock-in is idempotent in the domain RPC, but repeated device or
    // browser retries are still bounded tightly per authenticated player.
    ip: [600, 60, 30],
    identity: [6, 60, 60],
    game: [600, 60, 30],
    action: [6, 60, 60],
  }),
  scanner: policy({
    // One staff device may scan a full classroom in a short burst. The game,
    // staff identity, and action buckets still cap runaway scanner loops.
    ip: [900, 60, 30],
    identity: [300, 60, 60],
    game: [900, 60, 30],
    action: [300, 60, 60],
  }),
});

type PolicyTuple = readonly [
  limit: number,
  windowSeconds: number,
  blockSeconds: number,
];

function policy(input: Readonly<Record<RateLimitDimension, PolicyTuple>>) {
  return Object.freeze(Object.fromEntries(
    Object.entries(input).map(([dimension, values]) => [
      dimension,
      Object.freeze({
        limit: values[0],
        windowSeconds: values[1],
        blockSeconds: values[2],
      }),
    ]),
  ) as Record<RateLimitDimension, RateLimitBucketPolicy>);
}
