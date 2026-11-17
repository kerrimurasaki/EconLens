import { expect, test } from "@playwright/test";
import { ACCOUNTS, newSession } from "./helpers";

/**
 * The core journey end to end, with real persistence (demo AI mode):
 * teacher builds and publishes -> student joins, plays, submits -> teacher sees the recorded result.
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const className = `E2E class ${stamp}`;
let joinCode = "";
let experienceUrl = "";

test("teacher: event -> lenses -> blueprint -> generated lesson passes the quality check", async ({ browser }) => {
  const { context, page } = await newSession(browser, ACCOUNTS.teacher1);
  await page.goto("/experiences/new");
  await page.getByLabel("Describe the situation").fill(`A supermarket raised the price of milk by 12% this month (${stamp}). Shoppers say it is unfair.`);
  await page.getByRole("button", { name: "Continue to sources" }).click();

  await expect(page.getByText("Source verification is unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Analyse event" }).click();
  await expect(page.getByRole("heading", { name: "Claims for you to review" })).toBeVisible();
  await expect(page.getByText("Demo mode.").first()).toBeVisible();
  await page.getByRole("link", { name: "Continue to economics lenses" }).click();

  await page.getByRole("checkbox", { name: /Relative price change/ }).check();
  await page.getByRole("checkbox", { name: /Supply and demand/ }).check();
  await page.getByLabel("Central inquiry question").fill("Is one price rise the same as inflation?");
  await page.getByRole("group", { name: /Learning objectives/ }).getByRole("checkbox").nth(0).check();
  await page.getByRole("group", { name: /Learning objectives/ }).getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Confirm lenses and objectives" }).click();
  await page.getByRole("link", { name: "Continue to blueprint" }).click();

  await page.getByLabel("Lesson length").selectOption("45");
  await page.getByRole("button", { name: "Approve blueprint and generate lesson" }).click();
  await expect(page).toHaveURL(/\/builder$/);
  experienceUrl = page.url().replace(/\/builder$/, "");
  await expect(page.getByText("No blocking issues.")).toBeVisible();
  await expect(page.getByText("45/45 min planned")).toBeVisible();

  // Preview as a student: no teacher-only text.
  await page.goto(`${experienceUrl}/preview?as=student`);
  const html = await page.content();
  expect(html).not.toContain("correctOptionIds");
  await context.close();
});

test("teacher: create a class and publish to it", async ({ browser }) => {
  const { context, page } = await newSession(browser, ACCOUNTS.teacher1);
  await page.goto("/classes");
  await page.getByLabel("Class name").fill(className);
  await page.getByRole("button", { name: "Create class" }).click();
  const card = page.getByRole("listitem").filter({ hasText: className });
  await expect(card).toBeVisible();
  joinCode = (await card.locator(".font-mono").first().innerText()).trim();
  expect(joinCode).toMatch(/^[A-Z2-9]{8}$/);

  await page.goto(`${experienceUrl}/publish`);
  await expect(page.getByText("Quality check passed")).toBeVisible();
  await page.locator("select[name=classId]").selectOption({ label: `${className} (0 students)` });
  await page.getByRole("button", { name: "Publish to class" }).click();
  await expect(page.getByText(/Published version 1/)).toBeVisible();
  await context.close();
});

test("student: join, play the simulation, answer, submit and read feedback", async ({ browser }) => {
  const { context, page } = await newSession(browser, ACCOUNTS.student3);
  await page.goto("/learn");
  await page.getByLabel("Join a class with a code").fill(joinCode);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText(className)).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: className }).getByRole("link").click();

  await page.getByRole("button", { name: "Start activity" }).click();
  await expect(page.getByText("Hypothetical stylised model").first()).toBeVisible();

  // Branching scenario: two decisions, server-computed outcomes, then the debrief.
  await expect(page.getByText("Debrief")).toHaveCount(0);
  for (let i = 0; i < 2; i++) {
    await page.locator("fieldset").filter({ has: page.getByRole("button", { name: "Confirm choice" }) }).getByRole("radio").first().check();
    await page.getByRole("button", { name: "Confirm choice" }).click();
    await expect(page.getByText("You chose:").nth(i)).toBeVisible();
  }
  await expect(page.getByText("Debrief")).toBeVisible();

  // Answer one practice question and confirm the page does not reveal whether it was right.
  const firstRadio = page.locator("ol fieldset").first().getByRole("radio").first();
  await firstRadio.check();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await expect(page.getByText(/Correct|Not correct/)).toHaveCount(0);

  await page.getByRole("link", { name: "Continue to the independent check" }).click();
  await expect(page.getByRole("heading", { name: "Independent check" })).toBeVisible();
  for (const fs of await page.locator("ol fieldset").all()) {
    const radios = fs.getByRole("radio");
    if (await radios.count()) await radios.first().check();
    else await fs.getByRole("spinbutton").fill("15");
  }
  await page.getByRole("button", { name: "Submit independent check" }).click();
  await expect(page).toHaveURL(/\/feedback$/);
  await expect(page.getByText(/Independent check: \d+% of scored questions correct/)).toBeVisible();
  await expect(page.getByText("Why:").first()).toBeVisible();
  await context.close();
});

test("teacher: the recorded submission appears in insights after a refresh", async ({ browser }) => {
  const { context, page } = await newSession(browser, ACCOUNTS.teacher1);
  await page.goto(`${experienceUrl}/insights`);
  await page.reload();
  const section = page.getByRole("region", { name: new RegExp(className) });
  await expect(section.getByText("Submitted").locator("xpath=following-sibling::dd")).toHaveText("1");
  await expect(section.getByText(/Average independent score/).locator("xpath=following-sibling::dd")).not.toHaveText("n/a");
  await context.close();
});

test("access control: another teacher and a student cannot open this teacher's pages", async ({ browser }) => {
  const other = await newSession(browser, ACCOUNTS.teacher2);
  for (const path of ["builder", "insights", "publish", "sources"]) {
    const res = await other.page.goto(`${experienceUrl}/${path}`);
    expect(res?.status(), path).toBe(404);
  }
  await other.context.close();
  const student = await newSession(browser, ACCOUNTS.student3);
  await student.page.goto(`${experienceUrl}/builder`);
  await expect(student.page).toHaveURL(/\/learn/);
  await student.context.close();
});
