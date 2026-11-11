import assert from "node:assert/strict";

// Called by the native V2 browser suite after its real Overview is ready.
export async function verifyAccountControls(page, verifyRefreshBoundary) {
  const identity = page.locator(".admin-topbar__identity");
  const drawer = page.getByRole("dialog", { name: "Administrator account", exact: true });
  await identity.click();
  await drawer.waitFor({ state: "visible" });
  const original = await drawer.locator(".admin-shell-account-actions").elementHandle();
  assert.ok(original, "Resolved Overview removed administrator account actions");
  for (let index = 0; index < 3; index++) {
    for (const name of ["Settings", "Switch game", "Sign out"]) {
      const control = drawer.getByRole("button", { name, exact: true });
      assert.equal(await control.count(), 1);
      assert.equal(await control.isVisible(), true);
    }
    assert.equal(await original.evaluate(node => node.isConnected), true);
    assert.equal(await drawer.locator(".admin-shell-account-actions").evaluate((node, expected) => node === expected, original), true);
    let confirms = 0;
    const cancel = async dialog => {
      confirms++;
      assert.equal(dialog.type(), "confirm");
      assert.equal(dialog.message(), "Sign out of the administrator console?");
      await dialog.dismiss();
    };
    const url = page.url();
    page.once("dialog", cancel);
    await drawer.getByRole("button", { name: "Sign out", exact: true }).click();
    assert.equal(confirms, 1);
    assert.equal(page.url(), url);
    assert.equal(await drawer.isVisible(), true);
    assert.equal(await drawer.getByRole("button", { name: "Sign out", exact: true }).isEnabled(), true);
    await drawer.locator(".admin-dialog__close").click();
    await drawer.waitFor({ state: "hidden" });
    assert.equal(await identity.evaluate(node => document.activeElement === node), true);
    if (index < 2) {
      const loaded = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/dashboard") && response.request().method() === "GET" && response.ok());
      await page.getByRole("button", { name: "Refresh overview", exact: true }).click();
      await loaded;
      await page.getByRole("button", { name: "Refresh overview", exact: true }).waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const button = document.querySelector('button[aria-label="Refresh overview"]');
        return button?.isConnected && !button.disabled
          && Boolean(document.querySelector('[data-admin-v2-state="ready"]'));
      });
      await verifyRefreshBoundary();
      await identity.click();
      await drawer.waitFor({ state: "visible" });
    }
  }
  await original.dispose();
}
