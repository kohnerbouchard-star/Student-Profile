import type { PlayerCraftingRoute } from "../contracts/playerCraftingContracts.ts";

const JOB_KEY = /^cft_[0-9a-f]{32}$/;
const EQUIPMENT_KEY = /^eqp_[0-9a-f]{32}$/;
const ITEM_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function readPlayerCraftingRoutePath(pathname: string): PlayerCraftingRoute | null {
  const path = pathname.replace(/\/+$/, "");
  if (path.endsWith("/players/me/crafting")) return { kind: "read" };
  if (path.endsWith("/players/me/crafting/jobs")) return { kind: "startJob" };

  const job = path.match(/\/players\/me\/crafting\/jobs\/([^/]+)\/(cancel|claim)$/);
  if (job) {
    const jobKey = decodeURIComponent(job[1]);
    if (!JOB_KEY.test(jobKey)) return { kind: "malformed" };
    return { kind: job[2] === "cancel" ? "cancelJob" : "claimJob", jobKey };
  }

  const item = path.match(/\/players\/me\/items\/([^/]+)\/use$/);
  if (item) {
    const itemKey = decodeURIComponent(item[1]).toLowerCase();
    return ITEM_KEY.test(itemKey) ? { kind: "useItem", itemKey } : { kind: "malformed" };
  }

  const equipment = path.match(/\/players\/me\/equipment\/([^/]+)\/(equip|salvage)$/);
  if (equipment) {
    const equipmentKey = decodeURIComponent(equipment[1]);
    if (!EQUIPMENT_KEY.test(equipmentKey)) return { kind: "malformed" };
    return { kind: equipment[2] === "equip" ? "equip" : "salvage", equipmentKey };
  }

  return path.includes("/players/me/crafting/") ||
      path.includes("/players/me/items/") ||
      path.includes("/players/me/equipment/")
    ? { kind: "malformed" }
    : null;
}
