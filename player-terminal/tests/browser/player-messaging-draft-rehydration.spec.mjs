import { expect, test } from "@playwright/test";

const THREAD_ID = `thr_${"c".repeat(32)}`;
const DRAFT_BODY = "Draft survives authoritative rehydration";

test("rehydrated Messaging composer submits the generic saved draft once", async ({ page }) => {
  await page.goto("/#messages");
  await page.evaluate(async ({ threadId }) => {
    const { renderMessagesPage } = await import("/src/pages/messages-page.js");
    const { installFormDraftPreserver } = await import("/src/forms/form-draft-preserver.js");
    const { installMessageIntentAdapter } = await import("/src/features/messages/message-intent-adapter.js");

    const buildData = (id) => ({
      messages: {
        unread: 0,
        threads: [{
          id,
          type: "player",
          title: "Rehydration contract",
          preview: "Draft persistence",
          time: "Now",
          unread: 0,
          tone: "cyan",
          initials: "RC",
          rawStatus: "active",
          allowPlayerReplies: true,
          members: "2 participants",
          status: "Active",
          messages: [],
        }],
      },
    });

    const mount = document.createElement("div");
    mount.id = "messagingDraftRehydrationFixture";
    mount.innerHTML = renderMessagesPage(buildData(threadId), { messageThreadId: threadId });
    document.body.append(mount);

    const drafts = installFormDraftPreserver(mount);
    const intents = installMessageIntentAdapter({ mount, drafts });
    globalThis.__messagingDraftFixture = { renderMessagesPage, buildData, mount, drafts, intents, threadId };
    globalThis.__messagingDraftDispatches = [];

    mount.addEventListener("submit", (event) => {
      const form = event.target.closest?.('[data-endpoint="messageSend"]');
      if (!(form instanceof HTMLFormElement)) return;
      event.preventDefault();
      globalThis.__messagingDraftDispatches.push(Object.fromEntries(new FormData(form).entries()));
    });
  }, { threadId: THREAD_ID });

  const fixture = page.locator("#messagingDraftRehydrationFixture");
  const composer = fixture.locator('form[data-endpoint="messageSend"]');
  await composer.locator('[name="body"]').fill(DRAFT_BODY);

  await page.evaluate(() => {
    const state = globalThis.__messagingDraftFixture;
    state.mount.innerHTML = state.renderMessagesPage(
      state.buildData(state.threadId),
      { messageThreadId: state.threadId },
    );
  });
  await expect(composer.locator('[name="body"]')).toHaveValue(DRAFT_BODY);

  await page.evaluate(() => {
    const field = globalThis.__messagingDraftFixture.mount.querySelector('form[data-endpoint="messageSend"] [name="body"]');
    field.value = "";
  });
  await expect(composer.locator('[name="body"]')).toHaveValue("");

  await composer.locator("[data-player-message-send]").click({ force: true });
  await expect.poll(() => page.evaluate(() => globalThis.__messagingDraftDispatches.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__messagingDraftDispatches[0])).toEqual({ body: DRAFT_BODY });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => globalThis.__messagingDraftDispatches.length)).toBe(1);
});
