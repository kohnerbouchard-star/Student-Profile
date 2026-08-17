import { expect, test } from "@playwright/test";

const CASES = [
  { width: 1440, sidebar: 264, bodyPadding: 18, mobile: false },
  { width: 1180, sidebar: 240, bodyPadding: 18, mobile: false },
  { width: 1024, sidebar: 240, bodyPadding: 18, mobile: false },
  { width: 861, sidebar: 240, bodyPadding: 18, mobile: false },
  { width: 860, sidebar: 0, bodyPadding: 0, mobile: true },
];

async function openFinanceRoute(page) {
  await page.goto("/#market");
  await expect(page.locator("#player-main-content")).toBeVisible();
  await expect(page.locator(".player-terminal-page")).toBeVisible();
  await expect(page.locator(".player-terminal-context-nav")).toBeVisible();
}

test("shell ownership remains coherent across desktop, tablet, and mobile boundaries", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Breakpoint sweep runs once in desktop Chromium.");

  for (const breakpoint of CASES) {
    await page.setViewportSize({ width: breakpoint.width, height: 900 });
    await openFinanceRoute(page);

    const geometry = await page.evaluate(() => {
      const shell = document.querySelector(".player-terminal-shell");
      const shellMain = document.querySelector(".player-terminal-shell-main");
      const pageHost = document.querySelector(".player-terminal-page-host");
      const sidebar = document.querySelector(".player-terminal-left-menu");
      const navLabel = document.querySelector(".player-terminal-nav-item > strong");
      const collapse = document.querySelector(".player-terminal-collapse-control");
      const mobileNav = document.querySelector(".player-terminal-mobile-nav");
      const contextNav = document.querySelector(".player-terminal-context-nav");
      const topbar = document.querySelector(".player-terminal-app-topbar");
      const bodyStyle = getComputedStyle(document.body);
      const shellStyle = getComputedStyle(shell);
      const shellMainStyle = getComputedStyle(shellMain);
      const pageHostStyle = getComputedStyle(pageHost);
      const sidebarStyle = getComputedStyle(sidebar);
      const navLabelStyle = getComputedStyle(navLabel);
      const collapseStyle = getComputedStyle(collapse);
      const mobileNavStyle = getComputedStyle(mobileNav);
      const contextStyle = getComputedStyle(contextNav);
      const topbarStyle = getComputedStyle(topbar);

      return {
        shellDisplay: shellStyle.display,
        shellColumnGap: Number.parseFloat(shellStyle.columnGap) || 0,
        shellMainMarginBottom: Number.parseFloat(shellMainStyle.marginBottom) || 0,
        shellMainPaddingBottom: Number.parseFloat(shellMainStyle.paddingBottom) || 0,
        pageHostPaddingLeft: Number.parseFloat(pageHostStyle.paddingLeft) || 0,
        pageHostPaddingBottom: Number.parseFloat(pageHostStyle.paddingBottom) || 0,
        sidebarDisplay: sidebarStyle.display,
        sidebarWidth: sidebar.getBoundingClientRect().width,
        navLabelDisplay: navLabelStyle.display,
        navLabelVisible: navLabel.getClientRects().length > 0,
        collapseDisplay: collapseStyle.display,
        collapseVisible: collapse.getClientRects().length > 0,
        mobileNavDisplay: mobileNavStyle.display,
        mobileNavVisible: mobileNav.getClientRects().length > 0,
        bodyPaddingLeft: Number.parseFloat(bodyStyle.paddingLeft) || 0,
        contextPosition: contextStyle.position,
        contextTop: Number.parseFloat(contextStyle.top) || 0,
        topbarMinHeight: Number.parseFloat(topbarStyle.minHeight) || 0,
      };
    });

    expect(geometry.bodyPaddingLeft, `body padding at ${breakpoint.width}px`).toBeCloseTo(breakpoint.bodyPadding, 0);
    expect(geometry.contextPosition, `context nav positioning at ${breakpoint.width}px`).toBe("sticky");
    expect(geometry.contextTop, `context/topbar offset at ${breakpoint.width}px`).toBeCloseTo(geometry.topbarMinHeight, 0);
    expect(geometry.shellMainMarginBottom, `legacy shell margin at ${breakpoint.width}px`).toBe(0);

    if (breakpoint.mobile) {
      expect(geometry.shellDisplay).toBe("block");
      expect(geometry.sidebarDisplay).toBe("none");
      expect(geometry.mobileNavDisplay).toBe("grid");
      expect(geometry.mobileNavVisible).toBe(true);
      expect(geometry.collapseVisible).toBe(false);
      expect(geometry.shellMainPaddingBottom, "mobile nav clearance").toBeGreaterThanOrEqual(104);
      expect(geometry.pageHostPaddingLeft, "mobile page inset").toBeCloseTo(16, 0);
      expect(geometry.pageHostPaddingBottom, "mobile page bottom rhythm").toBeCloseTo(32, 0);
      continue;
    }

    expect(geometry.shellDisplay).toBe("grid");
    expect(geometry.shellColumnGap, `shell gap at ${breakpoint.width}px`).toBe(0);
    expect(geometry.shellMainPaddingBottom).toBe(0);
    expect(geometry.pageHostPaddingLeft, `page inset at ${breakpoint.width}px`).toBeGreaterThanOrEqual(20);
    expect(geometry.pageHostPaddingBottom, `page bottom rhythm at ${breakpoint.width}px`).toBeCloseTo(40, 0);
    expect(geometry.sidebarDisplay).toBe("grid");
    expect(geometry.sidebarWidth, `sidebar width at ${breakpoint.width}px`).toBeCloseTo(breakpoint.sidebar, 0);
    expect(geometry.navLabelDisplay).not.toBe("none");
    expect(geometry.navLabelVisible).toBe(true);
    expect(geometry.collapseDisplay).toBe("grid");
    expect(geometry.collapseVisible).toBe(true);
    expect(geometry.mobileNavDisplay).toBe("none");
    expect(geometry.mobileNavVisible).toBe(false);
  }
});
