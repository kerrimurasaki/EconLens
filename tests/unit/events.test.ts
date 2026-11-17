import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: { experience: { findFirst: vi.fn().mockResolvedValue(null) } } }));

import { db } from "@/server/db";
import { createEvent, loadOwnedExperience } from "@/server/events";

const findFirst = vi.mocked(db.experience.findFirst);

describe("loadOwnedExperience scoping (T9 groundwork)", () => {
  it("scopes teachers to tenant and creator, and reports misses as NOT_FOUND", async () => {
    await expect(loadOwnedExperience({ id: "t1", tenantId: "A", role: "TEACHER" }, "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(findFirst.mock.calls.at(-1)![0]!.where).toEqual({ id: "x", tenantId: "A", creatorId: "t1" });
  });

  it("scopes admins to the tenant only", async () => {
    await loadOwnedExperience({ id: "a1", tenantId: "A", role: "ADMIN" }, "x").catch(() => undefined);
    expect(findFirst.mock.calls.at(-1)![0]!.where).toEqual({ id: "x", tenantId: "A" });
  });

  it("denies students and anonymous users", async () => {
    await expect(loadOwnedExperience({ id: "s", tenantId: "A", role: "STUDENT" }, "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(loadOwnedExperience(null, "x")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("createEvent input handling", () => {
  const teacher = { id: "t1", tenantId: "A", role: "TEACHER" as const };
  it("rejects students and invalid input before any work", async () => {
    await expect(createEvent({ ...teacher, role: "STUDENT" }, { inputType: "describe", text: "a long enough text" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createEvent(teacher, { inputType: "describe", text: "short" })).rejects.toThrow();
    await expect(createEvent(teacher, { inputType: "url", url: "ftp://x.example" })).rejects.toThrow();
  });

  it("maps blocked URLs to a friendly validation error", async () => {
    await expect(createEvent(teacher, { inputType: "url", url: "http://169.254.169.254/latest/meta-data/" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "That address is not allowed.",
    });
  });
});
