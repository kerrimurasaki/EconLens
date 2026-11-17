import { describe, expect, it, vi } from "vitest";
import { generatePassword, newUserSchema, parseUserCsv } from "@/server/provision";

vi.mock("@/server/privacy", () => ({ runRetentionAllTenants: vi.fn().mockResolvedValue([{ tenantId: "A", days: 365, deleted: 2 }]) }));
import { GET } from "@/app/api/cron/retention/route";

describe("account provisioning helpers", () => {
  it("generates strong, distinct passwords", () => {
    const set = new Set(Array.from({ length: 100 }, () => generatePassword()));
    expect(set.size).toBe(100);
    for (const p of set) expect(p).toMatch(/^[A-Za-z2-9]{16}$/);
  });

  it("validates a new user and normalises the email", () => {
    expect(newUserSchema.parse({ name: "Ada L", email: " ADA@Example.COM ", role: "TEACHER" }).email).toBe("ada@example.com");
    expect(newUserSchema.safeParse({ name: "Ada", email: "x@y.z", role: "ROOT" }).success).toBe(false);
    expect(newUserSchema.safeParse({ name: "Ada", email: "x@y.zz", role: "ADMIN", password: "short" }).success).toBe(false);
    expect(newUserSchema.safeParse({ name: "A", email: "x@y.zz", role: "ADMIN" }).success).toBe(false);
  });

  it("parses a roster CSV and reports bad or duplicate lines", () => {
    const csv = 'name,email,role\nAda Lovelace,ada@x.org,student\n"Bo Peep",bo@x.org,STUDENT\nBad,not-an-email,STUDENT\nDup,ada@x.org,STUDENT\nNo Role,nr@x.org,wizard\n';
    const r = parseUserCsv(csv);
    expect(r.users.map((u) => u.email)).toEqual(["ada@x.org", "bo@x.org"]);
    expect(r.users[0]!.role).toBe("STUDENT");
    expect(r.errors).toHaveLength(3);
    expect(parseUserCsv("email,role\na@b.co,STUDENT").errors[0]).toMatch(/header/);
    expect(parseUserCsv("").errors).toHaveLength(1);
  });
});

describe("retention cron route", () => {
  const call = (auth?: string) => GET(new Request("http://x/api/cron/retention", { headers: auth ? { authorization: auth } : {} }));

  it("is unavailable without a configured secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything")).status).toBe(503);
    process.env.CRON_SECRET = "short";
    expect((await call("Bearer short")).status).toBe(503);
  });

  it("rejects missing or wrong credentials and runs for the right one", async () => {
    process.env.CRON_SECRET = "a-long-random-cron-secret-1234";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret-of-different-len")).status).toBe(401);
    expect((await call("Bearer a-long-random-cron-secret-123X")).status).toBe(401);
    const ok = await call("Bearer a-long-random-cron-secret-1234");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: [{ tenantId: "A", days: 365, deleted: 2 }] });
    delete process.env.CRON_SECRET;
  });
});
