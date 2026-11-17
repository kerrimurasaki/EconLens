import { expect, test } from "@playwright/test";
import { ACCOUNTS, assignmentIdFromLearn, DEMO_PASSWORD, newSession, sampleExperienceId } from "./helpers";

test("keyboard only: sign in, reach the builder and reorder a block", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.type(ACCOUNTS.teacher1);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.type(DEMO_PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard/);

  const id = await sampleExperienceId(page);
  await page.goto(`/experiences/${id}/builder`);
  const outline = page.getByRole("navigation", { name: "Lesson outline" });
  const titles = async () => (await outline.locator("button[aria-label$=' down']:not([disabled])").first().getAttribute("aria-label"))!;
  const before = await titles();
  const down = outline.locator("button[aria-label$=' down']:not([disabled])").first();
  await down.focus();
  await expect(down).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /Unsaved|Saving|Saved/ }).first()).toBeVisible();
  // after the move, the first "down" target is a different block than before
  expect(await titles()).not.toBe(before);
  // restore the original order so reruns are stable
  const up = outline.locator("button[aria-label$=' up']:not([disabled])").nth(1);
  await up.focus();
  await page.keyboard.press("Enter");
});

test("keyboard only: a student can answer a question with the keyboard", async ({ browser }) => {
  const { context, page } = await newSession(browser, ACCOUNTS.student3);
  await page.goto("/learn");
  const aid = await assignmentIdFromLearn(page);
  await page.goto(`/learn/${aid}`);
  const start = page.getByRole("button", { name: "Start activity" });
  if (await start.count()) {
    await start.focus();
    await page.keyboard.press("Enter");
  }
  const radio = page.locator("ol fieldset").first().getByRole("radio").first();
  await radio.focus();
  await page.keyboard.press("Space");
  await expect(radio).toBeChecked();
  await context.close();
});

test.describe("mobile layout (375px wide)", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("key pages have no horizontal scroll and the builder is usable", async ({ browser }) => {
    test.setTimeout(180_000);
    const t = await newSession(browser, ACCOUNTS.teacher1);
    // newSession creates a fresh context without the mobile settings, so apply the viewport to its page.
    await t.page.setViewportSize({ width: 375, height: 812 });
    const id = await sampleExperienceId(t.page);
    for (const p of ["/dashboard", "/classes", `/experiences/${id}/builder`, `/experiences/${id}/preview?as=student&device=mobile`, `/experiences/${id}/insights`, `/experiences/${id}/publish`]) {
      await t.page.goto(p);
      await t.page.waitForLoadState("networkidle");
      const overflow = await t.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${p} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await t.page.goto(`/experiences/${id}/builder`);
    await expect(t.page.getByRole("navigation", { name: "Lesson outline" })).toBeVisible();
    await expect(t.page.getByLabel("Title")).toBeVisible();
    await t.context.close();

    const s = await newSession(browser, ACCOUNTS.student3);
    await s.page.setViewportSize({ width: 375, height: 812 });
    const aid = await assignmentIdFromLearn(s.page);
    for (const p of ["/learn", `/learn/${aid}`, `/learn/${aid}/check`]) {
      await s.page.goto(p);
      await s.page.waitForLoadState("networkidle");
      const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${p} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await s.context.close();
  });
});
