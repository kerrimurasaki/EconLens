import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: { experience: { findMany: vi.fn().mockResolvedValue([]) } } }));

import { db } from "@/server/db";
import { listExperiences } from "@/server/experiences";

const findMany = vi.mocked(db.experience.findMany);

describe("listExperiences", () => {
  it("denies students and anonymous users", async () => {
    await expect(listExperiences(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(listExperiences({ id: "s", tenantId: "A", role: "STUDENT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("scopes teachers to their tenant and own experiences", async () => {
    await listExperiences({ id: "t1", tenantId: "A", role: "TEACHER" }, { q: "tax" });
    const where = findMany.mock.calls.at(-1)![0]!.where as Record<string, unknown>;
    expect(where.tenantId).toBe("A");
    expect(where.creatorId).toBe("t1");
  });

  it("scopes admins to the tenant only", async () => {
    await listExperiences({ id: "a1", tenantId: "A", role: "ADMIN" });
    const where = findMany.mock.calls.at(-1)![0]!.where as Record<string, unknown>;
    expect(where.tenantId).toBe("A");
    expect(where.creatorId).toBeUndefined();
  });
});
