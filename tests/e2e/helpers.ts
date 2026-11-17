import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Local demo accounts from the seed script (fictitious people; see README).
export const DEMO_PASSWORD = "EconLens-demo-1!";
export const ACCOUNTS = {
  teacher1: "teacher1@demo.econlens.test",
  teacher2: "teacher2@demo.econlens.test",
  admin: "admin@demo.econlens.test",
  student1: "student1@demo.econlens.test",
  student3: "student3@demo.econlens.test",
} as const;

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByLabel("Password").press("Enter");
  await expect(page).not.toHaveURL(/\/login/);
}

export async function newSession(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
  await login(page, email);
  return { context, page };
}

/** The seeded sample experience id, read from the teacher dashboard. */
export async function sampleExperienceId(page: Page): Promise<string> {
  await page.goto("/dashboard");
  const href = await page.getByRole("link", { name: /\[SAMPLE\]/ }).first().getAttribute("href");
  return href!.split("/")[2]!;
}

export async function assignmentIdFromLearn(page: Page): Promise<string> {
  await page.goto("/learn");
  const href = await page.locator("a[href^='/learn/']").first().getAttribute("href");
  return href!.split("/")[2]!;
}
