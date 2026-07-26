import { expect, test } from "@playwright/test";

const THREAD = `thr_${"a".repeat(32)}`;
const MESSAGE = `msg_${"b".repeat(32)}`;

async function mountMessagingFixture(page) {
  await page.goto("/#messages");
  await expect(page.locator("#player-main-content .player-terminal-page")).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
  await page.evaluate(async ({ threadId, messageId }) => {
    const { renderMessagesPage } = await import("/src/pages/messages-page.js");
    document.querySelector("#playerMessagingBrowserFixture")?.remove();
    const fixture = document.createElement("div");
    fixture.id = "playerMessagingBrowserFixture";
    fixture.className = "player-terminal-overview player-terminal-page-host";
    fixture.setAttribute("data-testid", "messaging-browser-fixture");
    fixture.innerHTML = renderMessagesPage({
      messages: {
        unread: 1,
        threads: [{
          id: threadId,
          type: "player",
          title: "<script>Trade</script>",
          preview: "Coordinate before close.",
          time: "Now",
          unread: 1,
          tone: "cyan",
          initials: "TC",
          rawStatus: "active",
          allowPlayerReplies: true,
          members: "2 participants",
          status: "Active",
          messages: [{
            id: messageId,
            self: false,
            initials: "P2",
            sender: "Player Two",
            time: "Now",
            body: "<img src=x onerror=alert(1)>",
          }],
        }],
      },
    }, { messageThreadId: threadId });
    document.body.append(fixture);
  }, { threadId: THREAD, messageId: MESSAGE });
  return page.getByTestId("messaging-browser-fixture");
}

test("Messages page exposes safe public-ID lifecycle controls without attachments", async ({ page }) => {
  const fixture = await mountMessagingFixture(page);
  await expect(fixture.getByRole("heading", { name: "Messages" })).toBeVisible();
  const disclosure = fixture.locator("details.player-terminal-message-create");
  await expect(disclosure).not.toHaveAttribute("open", "");
  await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
  const createForm = disclosure.locator('[data-endpoint="messageThreadCreate"]');
  await expect(createForm).toBeVisible();
  await expect(createForm.locator('[name="recipientPlayerId"]')).toHaveAttribute("maxlength", "160");
  await expect(createForm.locator('[name="body"]')).toHaveAttribute("maxlength", "1000");
  await expect(fixture.locator('[data-endpoint="messageSend"]')).toBeVisible();
  await expect(fixture.locator('[data-endpoint="messageRead"]')).toHaveCount(0);
  await expect(fixture.locator('[data-player-message-unread="true"]')).toHaveCount(1);
  const attachment = fixture.getByRole("button", { name: "Attachments are unavailable" });
  await expect(attachment).toBeDisabled();
  await expect(fixture).toContainText("Attachments are disabled");
  await expect(fixture).toContainText("<script>Trade</script>");
  await expect(fixture).toContainText("<img src=x onerror=alert(1)>");
  await expect(fixture.locator("script")).toHaveCount(0);
  await expect(fixture.locator("img[src='x']")).toHaveCount(0);
  await expect(fixture).not.toContainText(/00000000-0000-4000-8000-/);

  const recipient = createForm.locator('[name="recipientPlayerId"]');
  await recipient.focus();
  await expect(recipient).toBeFocused();
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Opening unread conversation auto-marks read and reply delegates to the terminal dispatcher", async ({ page }) => {
  const fixture = await mountMessagingFixture(page);
  await page.evaluate(async ({ threadId }) => {
    const { installMessageReadController } = await import("/src/features/messages/message-read-controller.js");
    const mount = document.getElementById("playerMessagingBrowserFixture");
    globalThis.__messageReadExecuteCount = 0;
    globalThis.__messageRefreshCount = 0;
    globalThis.__messageSelectionCount = 0;
    globalThis.__messageGenericSubmitCount = 0;

    mount.addEventListener("click", (event) => {
      const control = event.target.closest?.("[data-player-message-thread]");
      if (control && control.getAttribute("data-player-message-unread") !== "true") {
        globalThis.__messageSelectionCount += 1;
      }
    });

    mount.addEventListener("submit", (event) => {
      const form = event.target.closest?.('form[data-endpoint="messageSend"]');
      if (!form) return;
      event.preventDefault();
      globalThis.__messageGenericSubmitCount += 1;
      const paragraph = document.createElement("p");
      paragraph.textContent = String(form.elements.namedItem("body")?.value || "").trim();
      mount.querySelector(".player-terminal-message-log")?.append(paragraph);
    });

    const api = {
      setSession() {},
      async execute(endpointKey, payload, params) {
        if (endpointKey !== "messageRead") throw new Error(`Unexpected Messaging endpoint ${endpointKey}.`);
        if (params.threadId !== threadId || payload.threadId !== threadId) {
          throw new Error("Message read controller forwarded an invalid public thread.");
        }
        globalThis.__messageReadExecuteCount += 1;
        return { result: { unread: 0 }, invalidatedResources: ["messages", "notifications", "dashboard"] };
      },
    };
    const terminal = {
      getState() {
        return { data: { capabilities: { actions: { messageSend: true } } } };
      },
      async refresh() {
        globalThis.__messageRefreshCount += 1;
        const control = mount.querySelector(`[data-player-message-thread="${threadId}"]`);
        control?.removeAttribute("data-player-message-unread");
        control?.querySelector("i")?.remove();
      },
      showToast() {},
    };
    globalThis.__messageReadController = installMessageReadController({
      mount,
      terminal,
      config: {},
      api,
    });
  }, { threadId: THREAD });

  const unread = fixture.locator('[data-player-message-unread="true"]');
  await unread.click();
  await expect.poll(() => page.evaluate(() => globalThis.__messageReadExecuteCount)).toBe(1);
  await expect.poll(() => page.evaluate(() => globalThis.__messageRefreshCount)).toBe(1);
  await expect.poll(() => page.evaluate(() => globalThis.__messageSelectionCount)).toBe(1);
  await expect(fixture.locator('[data-player-message-unread="true"]')).toHaveCount(0);

  const reply = "Connected reply delegated";
  const form = fixture.locator(`form[data-endpoint="messageSend"][data-thread-id="${THREAD}"]`);
  await form.locator('[name="body"]').fill(reply);
  await form.locator('[data-player-message-send]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__messageGenericSubmitCount)).toBe(1);
  await expect(fixture.locator(".player-terminal-message-log p").filter({ hasText: reply })).toHaveCount(1);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => globalThis.__messageGenericSubmitCount)).toBe(1);
});
