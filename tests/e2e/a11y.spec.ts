import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, assignmentIdFromLearn, newSession, sampleExperienceId } from "./helpers";

/** WCAG 2.x A/AA automated scan (T11). Automated checks catch only part of accessibility; see README for the manual checklist. */
async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
  expect(bad, `${label}\n${bad.join("\n")}`).toEqual([]);
}

test("login page", async ({ page }) => {
  await page.goto("/login");
  await scan(page, "login");
});

test("teacher pages", async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newSession(browser, ACCOUNTS.teacher1);
  const id = await sampleExperienceId(page);
  const paths = ["/dashboard", "/classes", "/experiences/new", `/experiences/${id}/sources`, `/experiences/${id}/lenses`, `/experiences/${id}/blueprint`, `/experiences/${id}/builder`,
    `/experiences/${id}/preview?as=student`, `/experiences/${id}/preview?as=teacher`, `/experiences/${id}/publish`, `/experiences/${id}/insights`, `/experiences/${id}/print?view=teacher`];
  for (const p of paths) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await scan(page, p);
  }
  await context.close();
});

test("admin privacy page", async ({ browser }) => {
  const { context, page } = await newSession(browser, ACCOUNTS.admin);
  await page.goto("/settings/privacy");
  await scan(page, "privacy");
  await context.close();
});

test("student pages", async ({ browser }) => {
  test.setTimeout(180_000);
  const s1 = await newSession(browser, ACCOUNTS.student1);
  const aid = await assignmentIdFromLearn(s1.page);
  for (const p of ["/learn", `/learn/${aid}`, `/learn/${aid}/check`, `/learn/${aid}/feedback`]) {
    await s1.page.goto(p);
    await s1.page.waitForLoadState("networkidle");
    await scan(s1.page, p);
  }
  await s1.context.close();
});
