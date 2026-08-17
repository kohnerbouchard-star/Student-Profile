export const ADMIN_PERMISSIONS = Object.freeze(
  [
    "account.read",
    "audit.read",
    "attendance.manage",
    "business.manage",
    "contracts.manage",
    "economy.adjust",
    "game.create",
    "game.read",
    "game.switch",
    "game.update",
    "inventory.redeem",
    "market.manage",
    "marketplace.moderate",
    "messaging.moderate",
    "players.manage",
    "progression.review",
    "settings.manage",
    "store.manage",
    "world.manage",
  ] as const,
);

export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
