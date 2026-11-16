import { toStockMarketAssetInput } from "./supabaseStockMarketRunnerRepository.ts";
import { stockAsset } from "./supabaseStockMarketRunnerRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

// These cases characterize the public adapter before moving its pure row mapping.
for (
  const [raw, expected] of [
    ["12.5", 12.5],
    ["", 0],
    ["  ", 0],
    ["bad", Number.NaN],
    [null, Number.NaN],
    [true, Number.NaN],
    [Infinity, Number.NaN],
  ] as const
) {
  Deno.test(`stock runner row mapping retains numeric conversion for ${String(raw)}`, () => {
    const input = toStockMarketAssetInput(
      stockAsset({ current_price: raw }) as any,
    );
    if (!Object.is(input.currentPrice, expected)) {
      throw new Error("Numeric conversion changed");
    }
  });
}
