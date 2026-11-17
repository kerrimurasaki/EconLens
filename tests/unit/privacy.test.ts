import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), delete: vi.fn() },
  attempt: { deleteMany: vi.fn() },
  tenant: { findUnique: vi.fn(), update: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
vi.mock("@/server/db", () => ({ db: mockDb }));

import { deleteStudentData, getRetentionDays, purgeExpiredAttempts, runRetention, setRetentionDays, DEFAULT_RETENTION_DAYS } from "@/server/privacy";

const admin = { id: "a1", tenantId: "A", role: "ADMIN" as const };
beforeEach(() => vi.clearAllMocks());

describe("retention and deletion", () => {
  it("only admins may change retention, delete students or run the purge", async () => {
    for (const role of ["TEACHER", "STUDENT"] as const) {
      const u = { id: "x", tenantId: "A", role };
      await expect(setRetentionDays(u, { days: 90 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(deleteStudentData(u, "s1")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(runRetention(u)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(deleteStudentData(null, "s1")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("validates the retention period", async () => {
    mockDb.tenant.findUnique.mockResolvedValue({ settingsJson: { other: 1 } });
    await expect(setRetentionDays(admin, { days: 5 })).rejects.toThrow();
    await expect(setRetentionDays(admin, { days: 99999 })).rejects.toThrow();
    await expect(setRetentionDays(admin, { days: 90 })).resolves.toEqual({ days: 90 });
    expect(mockDb.tenant.update.mock.calls[0]![0].data.settingsJson).toEqual({ other: 1, retentionDays: 90 }); // keeps other settings
  });

  it("defaults to a year when nothing is configured", async () => {
    mockDb.tenant.findUnique.mockResolvedValue({ settingsJson: {} });
    expect(await getRetentionDays("A")).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("deletes only students of the admin's own tenant and audits only the opaque id", async () => {
    mockDb.user.findFirst.mockResolvedValueOnce(null);
    await expect(deleteStudentData(admin, "other")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.user.findFirst.mock.calls[0]![0].where).toEqual({ id: "other", tenantId: "A", role: "STUDENT" });
    mockDb.user.findFirst.mockResolvedValueOnce({ id: "s1" });
    await deleteStudentData(admin, "s1");
    expect(mockDb.user.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    const audit = mockDb.auditEvent.create.mock.calls.at(-1)![0].data;
    expect(audit.action).toBe("privacy.delete_student");
    expect(JSON.stringify(audit)).not.toMatch(/@|name/i);
  });

  it("purges attempts older than the cutoff within the tenant", async () => {
    mockDb.attempt.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-06-01T00:00:00Z");
    const r = await purgeExpiredAttempts("A", 30, now);
    expect(r.deleted).toBe(3);
    const where = mockDb.attempt.deleteMany.mock.calls[0]![0].where;
    expect(where.startedAt.lt.toISOString()).toBe("2026-05-02T00:00:00.000Z");
    expect(where.assignment).toEqual({ classroom: { tenantId: "A" } });
  });
});
