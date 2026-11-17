import { db } from "./db";
import { AppError } from "./errors";
import { recordAudit } from "./audit";
import { assertRole, TEACHING_ROLES, type SessionUser } from "./auth/policy";
import { getProvider } from "./ai";
import { startJob } from "./aiJobs";
import { rateLimit } from "./rateLimit";
import { AIProviderError, type LLMProvider } from "./ai/provider";
import { PROMPT_VERSIONS } from "./ai/prompts";
import { canMarkVerified, inferEconomics, initialClaimStatus, normalizeEvent } from "./analysis";
import { extractExcerpt, FetchBlockedError, safeFetch } from "./sources/safeFetch";
import {
  claimUpdateSchema,
  eventInputSchema,
  lensSelectionSchema,
  type EventInput,
  type LensSelection,
} from "@/schemas/events";
import { CONCEPTS } from "@/schemas/taxonomy";


/** Loads an experience the user may manage. Other tenants and other teachers' drafts are NOT_FOUND. */
export async function loadOwnedExperience(user: SessionUser | null | undefined, id: string) {
  assertRole(user, TEACHING_ROLES);
  const exp = await db.experience.findFirst({
    where: { id, tenantId: user.tenantId, ...(user.role === "TEACHER" ? { creatorId: user.id } : {}) },
    include: {
      eventCase: { include: { sources: true, claims: { orderBy: { id: "asc" } }, concepts: { orderBy: { rank: "asc" } } } },
    },
  });
  if (!exp) throw new AppError("NOT_FOUND", "Not found.");
  return exp;
}

const FETCH_MESSAGES: Partial<Record<FetchBlockedError["reason"], string>> = {
  ROBOTS_DISALLOWED: "That site does not allow automated access. Paste the relevant text instead.",
  BAD_CONTENT_TYPE: "That URL is not a readable web page. Paste the relevant text instead.",
};

export async function createEvent(user: SessionUser | null | undefined, raw: unknown) {
  assertRole(user, TEACHING_ROLES);
  const input: EventInput = eventInputSchema.parse(raw);
  rateLimit(`event:${user.id}`, 30, 60 * 60_000); // each URL event triggers an outbound fetch

  let text = input.text;
  let title = input.title || "";
  const sources: Array<{
    url: string | null; title: string; publisher: string | null; retrievedAt: Date | null; excerpt: string | null;
    status: "teacher_provided" | "unverified";
  }> = [];
  let sourceKind: "pasted" | "fetched" = "pasted";

  if (input.inputType === "url") {
    try {
      const res = await safeFetch(input.url!);
      const { title: pageTitle, excerpt } = extractExcerpt(res.text);
      if (excerpt.length < 50) throw new AppError("VALIDATION", "Could not read enough text from that page. Paste the relevant text instead.");
      text = excerpt;
      title ||= pageTitle ?? new URL(res.finalUrl).hostname;
      sourceKind = "fetched";
      sources.push({
        url: res.finalUrl,
        title: pageTitle ?? res.finalUrl,
        publisher: new URL(res.finalUrl).hostname,
        retrievedAt: res.retrievedAt,
        excerpt: excerpt.slice(0, 1500),
        status: "unverified",
      });
    } catch (e) {
      if (e instanceof FetchBlockedError) throw new AppError("VALIDATION", FETCH_MESSAGES[e.reason] ?? e.message);
      throw e;
    }
  } else {
    sources.push({
      url: null,
      title: input.inputType === "headline" ? "Teacher-provided headline" : "Teacher-provided description",
      publisher: null,
      retrievedAt: null,
      excerpt: text.slice(0, 1500),
      status: "teacher_provided",
    });
  }
  title ||= text.slice(0, 80);

  const result = await db.$transaction(async (tx) => {
    const event = await tx.eventCase.create({
      data: {
        tenantId: user.tenantId,
        creatorId: user.id,
        title: title.slice(0, 200),
        inputType: input.inputType,
        inputText: text,
        sourceUrl: sources[0]?.url ?? null,
        eventDate: input.eventDate ? new Date(input.eventDate) : null,
        geography: input.geography ?? null,
        factStatus: sourceKind === "pasted" ? "teacher_provided" : "unverified",
        sources: { create: sources },
      },
    });
    const exp = await tx.experience.create({
      data: {
        tenantId: user.tenantId, eventCaseId: event.id, creatorId: user.id, title: title.slice(0, 200), durationMinutes: 90,
        settingsJson: { sourceKind },
      },
    });
    return { experienceId: exp.id };
  });
  await recordAudit(user, "event.create", "Experience", result.experienceId, { inputType: input.inputType });
  return result;
}

export async function analyzeEvent(user: SessionUser | null | undefined, experienceId: string, provider?: LLMProvider) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const event = exp.eventCase;

  let p: LLMProvider;
  try {
    p = provider ?? getProvider();
  } catch (e) {
    if (e instanceof AIProviderError) throw new AppError("AI_ERROR", e.message);
    throw e;
  }
  const job = await startJob(user, "analyzeEvent", event.inputText, p, `${PROMPT_VERSIONS.normalizeEvent}+${PROMPT_VERSIONS.inferEconomics}`);

  try {
    const normalized = await normalizeEvent(p, event.inputText);
    const lenses = await inferEconomics(p, normalized, event.inputText);
    const sourceKind = (exp.settingsJson as { sourceKind?: "pasted" | "fetched" } | null)?.sourceKind ?? "pasted";
    const primary = event.sources[0] ?? null;

    await db.$transaction(async (tx) => {
      await tx.evidenceClaim.deleteMany({ where: { eventCaseId: event.id } });
      await tx.conceptSuggestion.deleteMany({ where: { eventCaseId: event.id } });
      await tx.evidenceClaim.createMany({
        data: normalized.claims.map((c) => ({
          eventCaseId: event.id, text: c.text.slice(0, 1000), claimType: c.type,
          verificationStatus: initialClaimStatus(c.type, sourceKind), sourceId: primary?.id ?? null,
        })),
      });
      await tx.conceptSuggestion.createMany({
        data: lenses.map((l, rank) => ({
          eventCaseId: event.id, conceptKey: l.conceptKey, score: l.relevance, explanation: l.mechanism, rank,
          limitationsJson: l.limitations, prerequisitesJson: l.prerequisites, misconceptionJson: l.misconceptions,
          detailsJson: { inquiryQuestion: l.inquiryQuestion, alternativeLens: l.alternativeLens, evidenceClaimIndexes: l.evidenceClaimIndexes, misconceptionCorrections: l.misconceptionCorrections },
        })),
      });
      await tx.eventCase.update({
        where: { id: event.id },
        data: {
          analysisJson: normalized, analysisMode: p.isDemo ? "demo" : "ai", analysisModel: p.modelId,
          analysisPromptVersion: job.promptVersion, analyzedAt: new Date(),
        },
      });
      await tx.aIJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED" } });
    });
    await recordAudit(user, "event.analyze", "Experience", experienceId, { mode: p.isDemo ? "demo" : "ai" });
    return { mode: p.isDemo ? ("demo" as const) : ("ai" as const) };
  } catch (e) {
    const code = e instanceof AIProviderError ? e.code : e instanceof AppError ? e.code : "INTERNAL";
    await db.aIJob.update({ where: { id: job.id }, data: { status: "FAILED", errorCode: code } });
    if (e instanceof AIProviderError) throw new AppError("AI_ERROR", e.message);
    throw e;
  }
}

export async function updateClaim(user: SessionUser | null | undefined, experienceId: string, claimId: string, raw: unknown) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const body = claimUpdateSchema.parse(raw);
  const claim = exp.eventCase.claims.find((c) => c.id === claimId);
  if (!claim) throw new AppError("NOT_FOUND", "Not found.");

  let sourceId: string | null = body.sourceId === undefined ? claim.sourceId : body.sourceId;
  const source = sourceId ? exp.eventCase.sources.find((s) => s.id === sourceId) ?? null : null;
  if (sourceId && !source) throw new AppError("VALIDATION", "That source does not belong to this event.");

  if (body.verificationStatus === "verified") {
    const check = canMarkVerified(claim.claimType, source);
    if (!check.ok) throw new AppError("VALIDATION", check.reason);
  }
  if (!source) sourceId = null;
  await db.evidenceClaim.update({ where: { id: claim.id }, data: { verificationStatus: body.verificationStatus, sourceId } });
  await recordAudit(user, "claim.review", "EvidenceClaim", claim.id, { status: body.verificationStatus });
}

export async function selectLenses(user: SessionUser | null | undefined, experienceId: string, raw: unknown) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const sel: LensSelection = lensSelectionSchema.parse(raw);
  const available = new Set(exp.eventCase.concepts.map((c) => c.conceptKey));
  if (new Set(sel.conceptKeys).size !== sel.conceptKeys.length || !sel.conceptKeys.every((k) => available.has(k))) {
    throw new AppError("VALIDATION", "Choose 1 to 3 different concepts from the suggestions.");
  }
  const objs = await db.curriculumObjective.findMany({ where: { tenantId: user.tenantId, id: { in: sel.objectiveIds } }, select: { id: true } });
  if (objs.length !== new Set(sel.objectiveIds).size) throw new AppError("VALIDATION", "One or more learning objectives are not valid.");

  const prior = (exp.settingsJson ?? {}) as Record<string, unknown>;
  await db.$transaction([
    db.conceptSuggestion.updateMany({ where: { eventCaseId: exp.eventCaseId }, data: { selected: false } }),
    db.conceptSuggestion.updateMany({ where: { eventCaseId: exp.eventCaseId, conceptKey: { in: sel.conceptKeys } }, data: { selected: true } }),
    db.experience.update({
      where: { id: exp.id },
      data: { settingsJson: { ...prior, inquiryQuestion: sel.inquiryQuestion, objectiveIds: sel.objectiveIds, lensesApproved: true } },
    }),
  ]);
  await recordAudit(user, "lenses.select", "Experience", exp.id, { concepts: sel.conceptKeys.map((k) => CONCEPTS[k]).join(", ") });
}
