import "dotenv/config";
import { db } from "../src/server/db";
import { runRetentionAllTenants } from "../src/server/privacy";

// Scheduled job: deletes student attempts older than each tenant's retention period.
runRetentionAllTenants()
  .then((r) => r.forEach((x) => console.log(`tenant ${x.tenantId}: kept ${x.days} days, deleted ${x.deleted} attempt(s)`)))
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
