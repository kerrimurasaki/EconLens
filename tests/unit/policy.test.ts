import { describe, expect, it } from "vitest";
import { assertRole, assertSameTenant, assertUser, type SessionUser } from "@/server/auth/policy";
import { AppError, toErrorResponse } from "@/server/errors";

const teacher: SessionUser = { id: "t1", tenantId: "A", role: "TEACHER" };
const student: SessionUser = { id: "s1", tenantId: "A", role: "STUDENT" };

describe("policy", () => {
  it("rejects anonymous users as UNAUTHENTICATED", () => {
    expect(() => assertUser(null)).toThrowError(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });

  it("rejects students from teacher-only resources", () => {
    expect(() => assertRole(student, ["TEACHER", "ADMIN"])).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => assertRole(teacher, ["TEACHER", "ADMIN"])).not.toThrow();
  });

  it("hides cross-tenant resources as NOT_FOUND", () => {
    expect(() => assertSameTenant(teacher, "B")).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
    expect(() => assertSameTenant(teacher, "A")).not.toThrow();
  });
});

describe("toErrorResponse", () => {
  it("returns the consistent payload and status", async () => {
    const res = toErrorResponse(new AppError("FORBIDDEN", "nope"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "nope" } });
  });

  it("does not leak unknown error details", async () => {
    const res = toErrorResponse(new Error("secret db password"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
