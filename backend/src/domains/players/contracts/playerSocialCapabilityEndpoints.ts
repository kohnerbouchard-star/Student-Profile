import type {
  PlayerCapabilityEndpointDescriptor,
} from "./playerCapabilityManifestContracts.ts";

export const SOCIAL_CAPABILITY_ENDPOINTS: readonly PlayerCapabilityEndpointDescriptor[] = [
  {
    key: "messages",
    operations: [{ method: "GET", pathTemplate: "/players/me/messages" }],
    routeCapabilities: ["messages"],
  },
  {
    key: "messageThread",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/messages/threads/:threadId",
    }],
    routeCapabilities: ["messages"],
  },
  {
    key: "messagePolicy",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/messages/policy",
    }],
    routeCapabilities: ["messages"],
  },
  {
    key: "messageSearch",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/messages/search",
    }],
    routeCapabilities: ["messages"],
    actionCapabilities: ["messageSearch"],
  },
  {
    key: "messageThreadCreate",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/messages/threads",
    }],
    routeCapabilities: ["messages"],
    actionCapabilities: ["messageSend"],
  },
  {
    key: "messageSend",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/messages/threads/:threadId/messages",
    }],
    routeCapabilities: ["messages"],
    actionCapabilities: ["messageSend"],
  },
  {
    key: "messageRead",
    operations: [
      { method: "POST", pathTemplate: "/players/me/messages/read" },
      {
        method: "POST",
        pathTemplate: "/players/me/messages/threads/:threadId/read",
      },
    ],
    routeCapabilities: ["messages"],
  },
  {
    key: "notifications",
    operations: [{ method: "GET", pathTemplate: "/players/me/notifications" }],
  },
  {
    key: "notificationsRead",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/notifications/read",
    }],
    actionCapabilities: ["notificationsRead"],
  },
  {
    key: "storyDeliveries",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/story-deliveries",
    }],
  },
  {
    key: "storyDeliveryState",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/story-deliveries/:deliveryId/state",
    }],
    actionCapabilities: ["storyDeliveryState"],
  },
  {
    key: "logout",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/session/logout",
    }],
    actionCapabilities: ["logout"],
  },
] as const;
