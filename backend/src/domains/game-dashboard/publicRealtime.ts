/** Narrow game-public producer API; validation and projection stay canonical. */
export {
  buildGamePublicRealtimeEnvelope,
  GamePublicRealtimePublisher,
} from "../game-realtime/index.ts";
export type {
  GamePublicRealtimeBroadcastMessage,
  GamePublicRealtimeEnvelope,
  GamePublicRealtimePublishResult,
  GamePublicRealtimeTransport,
} from "../game-realtime/index.ts";
export {
  buildGamePublicRealtimeStockTickEnvelope,
} from "../game-realtime/index.ts";
