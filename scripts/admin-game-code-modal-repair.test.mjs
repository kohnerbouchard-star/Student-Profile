import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repairUrl = new URL("../admin/game-code-modal-repair.js", import.meta.url);
const shellUrl = new URL("../admin/index.html", import.meta.url);

test("Share Game Code repairs asynchronously mounted empty modals", async () => {
  const [repair, shell] = await Promise.all([
    readFile(repairUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ]);

  assert.match(shell, /game-code-wiring\.js[\s\S]+game-code-modal-repair\.js/);
  assert.match(repair, /RETRY_DELAYS/);
  assert.match(repair, /addEventListener\("click"[\s\S]+true\)/);
  assert.match(repair, /data-admin-terminal-action\s*=\s*"reset-game-code"/);
  assert.match(repair, /Generate Code/);
  assert.match(repair, /button\[title=\\?"Share game code\\?"\]/);
  assert.doesNotMatch(repair, /MutationObserver/);
  assert.doesNotMatch(repair, /fetch\s*\(/, "repair layer must reuse the authenticated reset handler");
});
