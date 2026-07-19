import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
let differences = 0;

async function patch(relativePath, transform) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  const expected = transform(source);
  if (source === expected) return;

  differences += 1;
  if (checkOnly) {
    console.error(`Timezone migration preflight drift: ${relativePath}`);
    return;
  }

  await writeFile(absolutePath, expected, "utf8");
}

await patch(
  "backend/supabase/migrations/20260719133000_require_stock_market_timezone_v1.sql",
  (source) => {
    if (source.includes("do language plpgsql '")) return source;

    const start = "do $\nbegin\n";
    const end = "end;\n$;\n\ncreate or replace function public.validate_required_stock_market_timezone()";

    if (!source.includes(start) || !source.includes(end)) {
      throw new Error("Malformed timezone migration preflight block was not found.");
    }

    return source
      .replace(start, "do language plpgsql '\nbegin\n")
      .replace(
        "    raise exception 'STOCK_MARKET_EXISTING_TIMEZONE_INVALID';",
        "    raise exception ''STOCK_MARKET_EXISTING_TIMEZONE_INVALID'';",
      )
      .replace(
        end,
        "end\n';\n\ncreate or replace function public.validate_required_stock_market_timezone()",
      );
  },
);

await patch(
  "backend/src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts",
  (source) => {
    if (source.includes('assertIncludes(required, "do language plpgsql \'");')) {
      return source;
    }

    const anchor =
      '  assertIncludes(required, "STOCK_MARKET_EXISTING_TIMEZONE_INVALID");';
    if (!source.includes(anchor)) {
      throw new Error("Migration preflight assertion anchor was not found.");
    }

    return source.replace(
      anchor,
      `${anchor}\n  assertIncludes(required, "do language plpgsql '");`,
    );
  },
);

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Verified" : "Applied"} timezone migration preflight syntax.`,
  );
}
