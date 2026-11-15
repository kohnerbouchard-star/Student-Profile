import {
  calculateNextStockMarketTick,
  ECONOVARIA_COUNTRY_EXPOSURE_PROFILES,
  getCountryExposureProfile,
  OFFICIAL_ECONOVARIA_COUNTRY_CODES,
  SUPPORTED_STOCK_MARKET_SECTOR_KEYS,
} from "./stockMarketEngine.ts";
import {
  assert,
  assertEquals,
  baseAsset,
  baseInput,
  ref038Digest,
  ref038Inputs,
} from "./stockMarketEngine.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

// These digests were captured from main 09fd066 before moving any engine code.
Deno.test("REF038 profile values and insertion order retain the original full snapshot", async () => {
  assertEquals(await ref038Digest([OFFICIAL_ECONOVARIA_COUNTRY_CODES,
    SUPPORTED_STOCK_MARKET_SECTOR_KEYS, ECONOVARIA_COUNTRY_EXPOSURE_PROFILES]),
    "698310fc814ac89631749a10df4ff5536cd13cf935aea80ec0d6e4f8f9f82fbb");
});

Deno.test("REF038 full seeded tick outputs and explanations match the unmoved engine", async () => {
  assertEquals(await Promise.all(ref038Inputs().map(input => ref038Digest(calculateNextStockMarketTick(input)))),
    [
    "3fe7ed607909af578c2fbbd53c3336fad8691fa8cf99cb25f932a5352473bef8",
    "e0622a96ea0663ffba604f6b0b0337c5c1fbe129583eb2b4c29d5dac9c0b5551",
    "a713dbcf56837a30b2e9ba33874887778ad0c9b75cb069a81d7ed5f2c9861809",
    "cc198c4666bde292bf13662a2b66529e581fe1f98c5fc0feadc97753e24c8ada",
    "331a872c6869831afe9f75bc2a23a0be5a6f4e7c5cdf260099ff53d8b57523c8",
    "e63b9408469912ad6ceacaff3d58700bb291857fc249166c89c2389cce253aa4"
]);
});

Deno.test("REF038 country normalization preserves shared profile identity and unknown absence", () => {
  for (const code of OFFICIAL_ECONOVARIA_COUNTRY_CODES) {
    assert(getCountryExposureProfile(` ${code.toLowerCase()} `) === ECONOVARIA_COUNTRY_EXPOSURE_PROFILES[code]);
  }
  for (const code of ["", " ", "UNKNOWN", "__proto__"]) assert(getCountryExposureProfile(code) === undefined);
});

Deno.test("REF038 supported sector spellings preserve calculated price components", () => {
  for (const sector of SUPPORTED_STOCK_MARKET_SECTOR_KEYS) {
    const aliases = [sector, ` ${sector.toLowerCase().replaceAll("_", "-")} `];
    const results = aliases.map(value => calculateNextStockMarketTick(baseInput({ assets: [baseAsset({ sector: value })] })));
    assertEquals(results[0].ticks[0].explanation.components, results[1].ticks[0].explanation.components);
    assertEquals(results[1].rows[0].sector, aliases[1]); // Preserve the existing display spelling too.
  }
});
