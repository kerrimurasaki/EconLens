import { createHash } from "node:crypto";
import { db } from "./db";
import { AppError } from "./errors";
import { getProvider } from "./ai";
import { AIProviderError, type LLMProvider } from "./ai/provider";
import type { SessionUser } from "./auth/policy";

export const AI_JOBS_PER_HOUR = 20;

export function resolveProvider(provider?: LLMProvider): LLMProvider {
  try {
    return provider ?? getProvider();
  } catch (e) {
    if (e instanceof AIProviderError) throw new AppError("AI_ERROR", e.message);
    throw e;
  }
}

/** Enforces the per-user hourly limit and records a RUNNING job. Stores a hash of the input, never the content. */
export async function startJob(user: SessionUser, operation: string, input: string, provider: LLMProvider, promptVersion: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  // The advisory lock makes "count then create" atomic per user, so parallel requests cannot slip past the limit.
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${user.id}))`;
    const recent = await tx.aIJob.count({ where: { tenantId: user.tenantId, userId: user.id, createdAt: { gte: since } } });
    if (recent >= AI_JOBS_PER_HOUR) throw new AppError("RATE_LIMITED", "AI request limit reached for this hour. Please try again later.");
    return tx.aIJob.create({
      data: {
        tenantId: user.tenantId, userId: user.id, operation, status: "RUNNING", promptVersion, modelId: provider.modelId,
        inputHash: createHash("sha256").update(input).digest("hex"),
      },
    });
  });
}

export async function finishJob(jobId: string, error?: unknown) {
  if (!error) {
    await db.aIJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED" } });
    return;
  }
  const code = error instanceof AIProviderError ? error.code : error instanceof AppError ? error.code : "INTERNAL";
  await db.aIJob.update({ where: { id: jobId }, data: { status: "FAILED", errorCode: code } });
}
