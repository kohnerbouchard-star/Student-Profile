import {
  STORE_ITEM_MEDIA_PLACEHOLDER_SRC,
  resolveStoreItemMedia as resolveCanonicalStoreItemMedia,
} from "../../../../assets/store-item-media.mjs";

const PLAYER_MEDIA_OPTIONS = Object.freeze({ assetBase: "./assets" });
const CONTROLLED_LOCAL_STORE_ITEM_IMAGE = /^\.\/assets\/store-items\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/u;

export { STORE_ITEM_MEDIA_PLACEHOLDER_SRC };

export function resolveStoreItemMedia(item) {
  return resolveCanonicalStoreItemMedia(item, PLAYER_MEDIA_OPTIONS);
}

export function resolveStoreItemImage(item) {
  return resolveStoreItemMedia(item).src;
}

// Marketplace's existing read model supplies only repository-owned local SVGs.
// Keep that legacy contract separate from canonical Store media resolution so
// an API-provided URL can never become a Store media authority.
export function resolveLegacyMarketplaceItemImage(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return CONTROLLED_LOCAL_STORE_ITEM_IMAGE.test(candidate)
    ? candidate
    : STORE_ITEM_MEDIA_PLACEHOLDER_SRC;
}

export function handleStoreItemMediaError(event) {
  const image = event?.target;
  const isImage = String(image?.tagName || "").toUpperCase() === "IMG";
  const isStoreMedia = image?.dataset?.storeItemMedia === "true";
  if (!isImage || !isStoreMedia || image.dataset.storeItemMediaState === "fallback") return false;

  image.dataset.storeItemMediaState = "fallback";
  image.src = STORE_ITEM_MEDIA_PLACEHOLDER_SRC;
  if (!String(image.alt || "").trim()) image.alt = "Store item artwork unavailable";
  return true;
}
