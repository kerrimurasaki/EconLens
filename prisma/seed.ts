import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedSampleExperience } from "./seedSample";

// LOCAL DEMO DATA ONLY. All people, classes and content here are fictitious.
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DEMO_PASSWORD = "EconLens-demo-1!";
const TENANT_ID = "demo-tenant";

const objectives = [
  ["MIC-01", "Explain how an externality causes a gap between private and social cost", "Foundation", "Understand", ["externalities"]],
  ["MIC-02", "Predict how a per-unit tax changes price, quantity and who bears the burden", "Foundation", "Apply", ["tax incidence", "elasticity"]],
  ["MIC-03", "Distinguish a change in one relative price from a general rise in the price level", "Foundation", "Analyse", ["inflation", "supply and demand"]],
  ["DAT-01", "Interpret a simple table or graph and state what it does and does not show", "Foundation", "Analyse", ["data literacy"]],
  ["POL-01", "Evaluate a policy using efficiency, distribution and uncertainty", "Foundation", "Evaluate", ["government intervention"]],
] as const;

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await db.tenant.upsert({ where: { id: TENANT_ID }, update: {}, create: { id: TENANT_ID, name: "Demo Foundation College (fictitious)" } });

  const people = [
    ["admin@demo.econlens.test", "Alex Admin (demo)", "ADMIN"],
    ["teacher1@demo.econlens.test", "Taylor Teacher (demo)", "TEACHER"],
    ["teacher2@demo.econlens.test", "Jordan Teacher (demo)", "TEACHER"],
    ["student1@demo.econlens.test", "Sam Student (demo)", "STUDENT"],
    ["student2@demo.econlens.test", "Riley Student (demo)", "STUDENT"],
    ["student3@demo.econlens.test", "Casey Student (demo)", "STUDENT"],
  ] as const;
  const users: Record<string, string> = {};
  for (const [email, name, role] of people) {
    const u = await db.user.upsert({
      where: { email },
      update: { passwordHash: hash, name, role },
      create: { tenantId: TENANT_ID, email, name, role, passwordHash: hash },
    });
    users[email] = u.id;
  }

  for (const [code, title, level, bloomLevel, concepts] of objectives) {
    await db.curriculumObjective.upsert({
      where: { tenantId_code: { tenantId: TENANT_ID, code } },
      update: { title, level, bloomLevel, conceptsJson: [...concepts] },
      create: { tenantId: TENANT_ID, code, title, level, bloomLevel, conceptsJson: [...concepts] },
    });
  }

  const teacherId = users["teacher1@demo.econlens.test"]!;
  const event = await db.eventCase.upsert({
    where: { id: "demo-event-carbon-tax" },
    update: {},
    create: {
      id: "demo-event-carbon-tax",
      tenantId: TENANT_ID,
      creatorId: teacherId,
      title: "Carbon tax on fuel (illustrative sample scenario)",
      inputType: "scenario",
      inputText:
        "ILLUSTRATIVE SAMPLE, not live news: a government introduces a per-litre tax on petrol to reduce emissions.",
      factStatus: "hypothetical",
      isDemo: true,
    },
  });

  const existing = await db.experience.findFirst({ where: { eventCaseId: event.id } });
  if (!existing) await seedSampleExperience(db, TENANT_ID, teacherId, event.id, event.inputText);
  console.log("Seed complete. Demo password for all demo users is documented in README.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
