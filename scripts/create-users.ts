import "dotenv/config";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generatePassword, MIN_PASSWORD_LENGTH, newUserSchema, parseUserCsv, type NewUser } from "../src/server/provision";

/**
 * Creates accounts (EconLens has no self-service sign-up). Works for production: it never seeds demo data.
 *
 *   npm run users:create -- --new-tenant "My College" --email admin@college.edu --name "Admin Name" --role ADMIN
 *   npm run users:create -- --tenant <tenantId> --email t@college.edu --name "Teacher" --role TEACHER --password "<12+ chars>"
 *   npm run users:create -- --tenant <tenantId> --csv students.csv     (header: name,email,role)
 *
 * Without --password a random one is generated and printed ONCE. Existing emails are skipped, never overwritten.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    let tenantId = arg("tenant");
    const newTenant = arg("new-tenant");
    if (newTenant) {
      tenantId = (await db.tenant.create({ data: { name: newTenant } })).id;
      console.log(`Created institution "${newTenant}" with id ${tenantId}`);
    } else if (!tenantId) {
      const all = await db.tenant.findMany({ select: { id: true, name: true } });
      if (all.length !== 1) throw new Error(`Pass --tenant <id> or --new-tenant "<name>". Existing: ${all.map((t) => `${t.id} (${t.name})`).join(", ") || "none"}`);
      tenantId = all[0]!.id;
    }
    if (!(await db.tenant.findUnique({ where: { id: tenantId! } }))) throw new Error(`Unknown tenant ${tenantId}`);

    let rows: Array<Omit<NewUser, "password"> & { password?: string }>;
    const csv = arg("csv");
    if (csv) {
      const parsed = parseUserCsv(fs.readFileSync(csv, "utf8"));
      if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
      rows = parsed.users;
    } else {
      const one = newUserSchema.safeParse({ name: arg("name"), email: arg("email"), role: (arg("role") ?? "").toUpperCase(), password: arg("password") });
      if (!one.success) throw new Error(`Provide --name, --email, --role (ADMIN|TEACHER|STUDENT) and an optional --password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      rows = [one.data];
    }

    for (const r of rows) {
      if (await db.user.findUnique({ where: { email: r.email } })) {
        console.log(`skipped (already exists): ${r.email}`);
        continue;
      }
      const password = r.password ?? generatePassword();
      await db.user.create({ data: { tenantId: tenantId!, name: r.name, email: r.email, role: r.role, passwordHash: await bcrypt.hash(password, 12) } });
      console.log(r.password ? `created ${r.role} ${r.email}` : `created ${r.role} ${r.email}  temporary password: ${password}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
