import * as facade from "./staffContractHttpHandler.ts";
import * as progress from "./staffContractProgressHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void): void };

Deno.test("staff contract progress facade preserves direct function identity", () => {
  for (
    const name of [
      "listStaffContractProgress",
      "reviewStaffContractProgress",
    ] as const
  ) {
    if (facade[name] !== progress[name]) {
      throw new Error(`${name} is not a direct re-export`);
    }
  }
});
