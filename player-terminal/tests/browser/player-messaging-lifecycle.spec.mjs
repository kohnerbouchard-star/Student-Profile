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
  const createForm = fixture.locator('[data-endpoint="messageThreadCreate"]');
  await expect(createForm).toBeVisible();
  await expect(createForm.locator('[name="recipientPlayerId"]')).toHaveAttribute("maxlength", "160");
  await expect(createForm.locator('[name="body"]')).toHaveAttribute("maxlength", "1000");
  await expect(fixture.locator('[data-endpoint="messageSend"]')).toBeVisible();
  await expect(fixture.locator('[data-endpoint="messageRead"]')).toHaveCount(1);
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
