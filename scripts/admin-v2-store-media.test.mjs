import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  STORE_ITEM_MEDIA_PLACEHOLDER_SRC,
  resolveStoreItemMedia,
} from "../assets/store-item-media.mjs";
import {
  handleStoreItemMediaError,
  resolveLegacyMarketplaceItemImage,
  resolveStoreItemImage,
  resolveStoreItemMedia as resolvePlayerStoreItemMedia,
} from "../player-terminal/src/features/store/store-artwork.js";

const SEEDED_ITEM = Object.freeze({
  itemKey: "beta-nort-precision-optical-glass",
  name: "Precision Optical Glass",
});

test("canonical Store media gives Admin and Player the same seeded artwork", () => {
  const admin = resolveStoreItemMedia(SEEDED_ITEM);
  const player = resolvePlayerStoreItemMedia(SEEDED_ITEM);

  assert.deepEqual(admin, {
    src: "/player-terminal/assets/images/items/store/northreach/precision-optical-glass.webp",
    alt: "Precision Optical Glass artwork",
    kind: "seeded",
    fallback: false,
    fallbackSrc: STORE_ITEM_MEDIA_PLACEHOLDER_SRC,
  });
  assert.equal(player.src, "./assets/images/items/store/northreach/precision-optical-glass.webp");
  assert.equal(
    new URL(player.src, "https://econovaria.test/player-terminal/index.html").pathname,
    admin.src,
  );
  assert.equal(resolveStoreItemImage(SEEDED_ITEM), player.src);
});

test("repository catalog aliases remain controlled local media", () => {
  assert.equal(resolvePlayerStoreItemMedia({ id: "market-lens", name: "Market Lens" }).src, "./assets/store-items/market-lens.svg");
  assert.equal(resolvePlayerStoreItemMedia({ id: "repair-kit", name: "Emergency Repair Kit" }).src, "./assets/store-items/emergency-repair-kit.svg");
});

test("Marketplace compatibility accepts only controlled repository-local SVG paths", () => {
  assert.equal(
    resolveLegacyMarketplaceItemImage("./assets/store-items/market-lens.svg"),
    "./assets/store-items/market-lens.svg",
  );

  for (const unsafe of [
    "https://attacker.example/item.svg",
    "javascript:alert(1)",
    "./assets/store-items/../private.svg",
    "./assets/store-items/market-lens.svg?redirect=https://attacker.example",
    "/assets/store-items/market-lens.svg",
  ]) {
    assert.equal(resolveLegacyMarketplaceItemImage(unsafe), STORE_ITEM_MEDIA_PLACEHOLDER_SRC);
  }
});

test("custom items ignore unpersisted and unsafe media fields", () => {
  for (const field of ["image", "imageUrl", "artworkUrl", "mediaKey", "storagePath", "uploadRef"]) {
    const media = resolveStoreItemMedia({
      itemKey: "teacher-custom-item",
      name: "Teacher Custom Item",
      [field]: "https://attacker.example/item.png",
    });
    assert.equal(media.src, STORE_ITEM_MEDIA_PLACEHOLDER_SRC);
    assert.equal(media.kind, "placeholder");
    assert.equal(media.fallback, true);
    assert.equal(media.alt, "Artwork unavailable for Teacher Custom Item");
  }
});

test("unsafe seeded identities and arbitrary asset roots fail closed", () => {
  const unsafeKey = resolveStoreItemMedia({
    itemKey: "beta-nort-../private",
    name: "Unsafe item",
    imageUrl: "javascript:alert(1)",
  });
  assert.equal(unsafeKey.src, STORE_ITEM_MEDIA_PLACEHOLDER_SRC);

  const seeded = resolveStoreItemMedia(SEEDED_ITEM, { assetBase: "https://attacker.example/assets" });
  assert.equal(seeded.src, "/player-terminal/assets/images/items/store/northreach/precision-optical-glass.webp");
  assert.equal(seeded.src.includes("attacker.example"), false);

  const privateName = resolveStoreItemMedia({
    itemKey: "teacher-custom-item",
    name: "Private 11111111-1111-4111-8111-111111111111 item",
  });
  assert.equal(privateName.alt, "Artwork unavailable for Store item");
  assert.equal(privateName.alt.includes("11111111"), false);
});

test("broken Store artwork switches once to the branded placeholder", () => {
  const image = {
    tagName: "IMG",
    src: "/player-terminal/assets/images/items/store/northreach/missing.webp",
    alt: "Missing item artwork",
    dataset: { storeItemMedia: "true", storeItemMediaState: "seeded" },
  };

  assert.equal(handleStoreItemMediaError({ target: image }), true);
  assert.equal(image.src, STORE_ITEM_MEDIA_PLACEHOLDER_SRC);
  assert.equal(image.dataset.storeItemMediaState, "fallback");
  assert.equal(handleStoreItemMediaError({ target: image }), false);
  assert.equal(handleStoreItemMediaError({ target: { tagName: "IMG", dataset: {} } }), false);
});

test("placeholder is square graphical artwork without a letter or glyph stand-in", async () => {
  const source = await readFile(new URL("../assets/store-item-placeholder.svg", import.meta.url), "utf8");
  assert.match(source, /width="160" height="160" viewBox="0 0 160 160"/u);
  assert.match(source, /<title[^>]*>Econovaria Store artwork unavailable<\/title>/u);
  assert.equal(/<text\b/iu.test(source), false);
  assert.equal(/<image\b/iu.test(source), false);
  assert.equal(/font-family|font-size|unicode/iu.test(source), false);
});
