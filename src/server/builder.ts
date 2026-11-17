import { db } from "./db";
import { AppError } from "./errors";
import { recordAudit } from "./audit";
import { assertRole, TEACHING_ROLES, type SessionUser } from "./auth/policy";
import { loadOwnedExperience } from "./events";
import { finishJob, resolveProvider, startJob } from "./aiJobs";
import { generateWithRetry, type LLMProvider } from "./ai/provider";
import { loadPrompt, PROMPT_VERSIONS, wrapUntrusted } from "./ai/prompts";
import { assembleDocument, markEdits, normalizeBlock, replaceBlock } from "./generation/assemble";
import type { GenContext, GenLens } from "./generation/templates";
import { writeDerivedRows } from "./generation/derived";
import { validateExperience, type SourceFacts } from "./generation/validate";
import { CONCEPTS, type ConceptKey } from "@/schemas/taxonomy";
import {
  blueprintSchema, documentSchema, generatedBlockSchema, generatedExperienceSchema, regenerateSchema, restoreSchema, saveDraftSchema,
  type Blueprint, type ExperienceDocument, type ValidationResult,
} from "@/schemas/experience";
import type { Prisma } from "@/generated/prisma/client";

type Owned = Awaited<ReturnType<typeof loadOwnedExperience>>;
type Settings = { inquiryQuestion?: string; objectiveIds?: string[]; lensesApproved?: boolean; blueprint?: Blueprint; blueprintApproved?: boolean };

const settingsOf = (exp: Owned) => (exp.settingsJson ?? {}) as Settings;
const sourceFacts = (exp: Owned): SourceFacts[] => exp.eventCase.sources.map((s) => ({ id: s.id, url: s.url, excerpt: s.excerpt, retrievedAt: s.retrievedAt }));
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

async function buildContext(user: SessionUser, exp: Owned, blueprint: Blueprint): Promise<GenContext> {
  const s = settingsOf(exp);
  const objectives = await db.curriculumObjective.findMany({ where: { tenantId: user.tenantId, id: { in: s.objectiveIds ?? [] } }, orderBy: { code: "asc" } });
  const toLens = (c: Owned["eventCase"]["concepts"][number]): GenLens => {
    const d = (c.detailsJson ?? {}) as { inquiryQuestion?: string; alternativeLens?: string; misconceptionCorrections?: string[] };
    return {
      key: c.conceptKey, name: CONCEPTS[c.conceptKey as ConceptKey] ?? c.conceptKey, mechanism: c.explanation,
      prerequisites: c.prerequisitesJson as string[], misconceptions: c.misconceptionJson as string[], limitations: c.limitationsJson as string[],
      inquiryQuestion: d.inquiryQuestion ?? "", alternativeLens: d.alternativeLens ?? "", corrections: d.misconceptionCorrections ?? [],
    };
  };
  const all = exp.eventCase.concepts.map(toLens);
  const selected = exp.eventCase.concepts.filter((c) => c.selected).map(toLens);
  const analysis = (exp.eventCase.analysisJson ?? {}) as { summary?: string; stakeholders?: Array<{ name: string; position: string }>; unknowns?: string[] };
  return {
    title: exp.title, summary: analysis.summary ?? exp.eventCase.title, essentialQuestion: s.inquiryQuestion ?? "", blueprint,
    objectives: objectives.map((o) => ({ id: o.id, code: o.code, title: o.title, concepts: Array.isArray(o.conceptsJson) ? (o.conceptsJson as string[]) : [] })),
    selected, allLenses: all,
    claims: exp.eventCase.claims.map((c) => ({ text: c.text, type: c.claimType, status: c.verificationStatus, sourceId: c.sourceId })),
    stakeholders: analysis.stakeholders ?? [], unknowns: analysis.unknowns ?? [],
    sources: exp.eventCase.sources.map((x) => ({ id: x.id, title: x.title })),
  };
}

async function currentVersion(exp: Owned) {
  if (!exp.currentVersionId) return null;
  return db.experienceVersion.findUnique({ where: { id: exp.currentVersionId } });
}

function parseDoc(json: unknown): ExperienceDocument | null {
  const r = documentSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** Writes a new immutable version plus derived block/item rows in one transaction. */
async function writeVersion(
  exp: Owned, user: SessionUser, doc: ExperienceDocument, validation: ValidationResult,
  meta: { promptVersion?: string; modelId?: string },
) {
  try {
    return await db.$transaction(async (tx) => {
      const last = await tx.experienceVersion.findFirst({ where: { experienceId: exp.id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      const versionNumber = (last?.versionNumber ?? 0) + 1;
      const v = await tx.experienceVersion.create({
        data: {
          experienceId: exp.id, versionNumber, createdBy: user.id, contentJson: doc as unknown as Prisma.InputJsonValue,
          validationJson: validation as unknown as Prisma.InputJsonValue, promptVersion: meta.promptVersion ?? null, modelId: meta.modelId ?? null,
        },
      });
      await writeDerivedRows(tx, v.id, doc);
      await tx.experience.update({ where: { id: exp.id }, data: { currentVersionId: v.id, title: doc.title, durationMinutes: doc.durationMinutes, level: doc.level } });
      return v;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "This experience was changed elsewhere. Reload to continue.");
    throw e;
  }
}

function requireDraftBase(exp: Owned) {
  if (!exp.currentVersionId) throw new AppError("NOT_FOUND", "This experience has no draft yet.");
}

// ---------- blueprint ----------
export async function saveBlueprint(user: SessionUser | null | undefined, experienceId: string, raw: unknown) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const bp = blueprintSchema.parse(raw);
  const s = settingsOf(exp);
  if (!s.lensesApproved) throw new AppError("VALIDATION", "Confirm your economics lenses and objectives first.");
  await db.experience.update({ where: { id: exp.id }, data: { durationMinutes: bp.durationMinutes, level: bp.level, settingsJson: { ...s, blueprint: bp, blueprintApproved: true } } });
  await recordAudit(user, "blueprint.approve", "Experience", exp.id, { duration: bp.durationMinutes, level: bp.level });
}

// ---------- generate ----------
export async function generateDraft(user: SessionUser | null | undefined, experienceId: string, provider?: LLMProvider) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const s = settingsOf(exp);
  // FR-04: no generation before concept/objective selection and blueprint approval.
  if (!s.lensesApproved || !(s.objectiveIds?.length)) throw new AppError("VALIDATION", "Confirm your economics lenses and objectives first.");
  if (!s.blueprintApproved || !s.blueprint) throw new AppError("VALIDATION", "Approve the blueprint first.");
  const existing = await currentVersion(exp);
  if (existing && (parseDoc(existing.contentJson)?.blocks.length ?? 0) > 0) {
    throw new AppError("CONFLICT", "A draft already exists. Edit it or regenerate individual blocks instead.");
  }

  const bp = blueprintSchema.parse(s.blueprint);
  const ctx = await buildContext(user, exp, bp);
  if (ctx.selected.length === 0 || ctx.objectives.length === 0) throw new AppError("VALIDATION", "Select at least one concept and one objective.");
  const p = resolveProvider(provider);
  const pv = PROMPT_VERSIONS.generateExperience;
  const job = await startJob(user, "generateExperience", JSON.stringify([experienceId, bp]), p, pv);
  try {
    const { data } = await generateWithRetry(p, {
      operation: "generateExperience", promptVersion: pv, system: loadPrompt("generateExperience"), user: wrapUntrusted(JSON.stringify(ctx).replace(/</g, "\\u003c")),
      schema: generatedExperienceSchema, schemaName: "experience", demoInput: { text: "", context: { ctx, variant: 0 } },
    });
    const sources = sourceFacts(exp);
    const doc = assembleDocument({ title: data.title || exp.title, essentialQuestion: data.essentialQuestion || ctx.essentialQuestion, blueprint: bp, objectiveIds: ctx.objectives.map((o) => o.id), blocks: data.blocks, sources, storedClaims: ctx.claims.map((c) => ({ text: c.text, status: c.status, sourceId: c.sourceId })) });
    const validation = validateExperience(doc, sources);
    const v = await writeVersion(exp, user, doc, validation, { promptVersion: pv, modelId: p.modelId });
    await finishJob(job.id);
    await recordAudit(user, "experience.generate", "Experience", exp.id, { version: v.versionNumber, mode: p.isDemo ? "demo" : "ai", blocking: validation.blocking.length });
    return { version: v.versionNumber };
  } catch (e) {
    await finishJob(job.id, e);
    throw e;
  }
}

// ---------- read ----------
export async function getDraft(user: SessionUser | null | undefined, experienceId: string) {
  const exp = await loadOwnedExperience(user, experienceId);
  const v = await currentVersion(exp);
  const doc = v ? parseDoc(v.contentJson) : null;
  if (!v || !doc) return { exp, version: null, doc: null, validation: null, history: [] as Array<{ versionNumber: number; createdAt: string }> };
  const history = await db.experienceVersion.findMany({ where: { experienceId: exp.id }, orderBy: { versionNumber: "desc" }, take: 30, select: { versionNumber: true, generatedAt: true } });
  return {
    exp, version: v.versionNumber, doc, validation: validateExperience(doc, sourceFacts(exp)),
    history: history.map((h) => ({ versionNumber: h.versionNumber, createdAt: h.generatedAt.toISOString() })),
  };
}

// ---------- save / validate ----------
export async function saveDraft(user: SessionUser | null | undefined, experienceId: string, raw: unknown) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const body = saveDraftSchema.parse(raw);
  requireDraftBase(exp);
  const cur = await currentVersion(exp);
  if (!cur || cur.versionNumber !== body.baseVersion) throw new AppError("CONFLICT", "This experience was changed elsewhere. Reload to continue.");
  const prev = parseDoc(cur.contentJson);
  if (!prev) throw new AppError("INTERNAL", "Stored draft is unreadable.");

  const sources = sourceFacts(exp);
  const sourceIds = new Set(sources.map((x) => x.id));
  const allowedObjectives = new Set((await db.curriculumObjective.findMany({ where: { tenantId: user.tenantId }, select: { id: true } })).map((o) => o.id));
  const next = body.doc;
  if (next.objectiveIds.some((o) => !allowedObjectives.has(o))) throw new AppError("VALIDATION", "One or more objectives are not valid.");
  const ids = new Set<string>();
  const itemIdsSeen = new Set<string>();
  const storedClaims = exp.eventCase.claims;
  for (const b of next.blocks) {
    if (ids.has(b.id)) throw new AppError("VALIDATION", "Duplicate block ids.");
    ids.add(b.id);
    if (b.sourceIds.some((x) => !sourceIds.has(x)) || b.claims.some((c) => c.sourceId && !sourceIds.has(c.sourceId))) throw new AppError("VALIDATION", "A block references an unknown source.");
    for (const i of b.items) {
      if (itemIdsSeen.has(i.id)) throw new AppError("VALIDATION", "Duplicate question ids.");
      itemIdsSeen.add(i.id);
    }
    for (const c of b.claims) {
      // A teacher cannot mark a claim verified from the builder: it must match a claim already verified on the Sources page.
      if (c.status === "verified" && !storedClaims.some((s) => s.text.trim() === c.text.trim() && s.verificationStatus === "verified")) {
        throw new AppError("VALIDATION", "Claims can only be marked verified on the Sources page, against a fetched source.");
      }
    }
  }
  // Fields the teacher cannot change from the builder.
  const doc = markEdits(prev, { ...next, schemaVersion: 1, blueprint: prev.blueprint, level: prev.level, durationMinutes: prev.durationMinutes });
  const validation = validateExperience(doc, sources);
  const v = await writeVersion(exp, user, doc, validation, {});
  return { version: v.versionNumber, validation };
}

export async function validateCurrent(user: SessionUser | null | undefined, experienceId: string) {
  const d = await getDraft(user, experienceId);
  if (!d.doc) throw new AppError("NOT_FOUND", "This experience has no draft yet.");
  return { version: d.version!, validation: d.validation! };
}

// ---------- regenerate one block ----------
export async function regenerateBlock(user: SessionUser | null | undefined, experienceId: string, blockId: string, raw: unknown, provider?: LLMProvider) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const body = regenerateSchema.parse(raw);
  requireDraftBase(exp);
  const cur = await currentVersion(exp);
  if (!cur || cur.versionNumber !== body.baseVersion) throw new AppError("CONFLICT", "This experience was changed elsewhere. Reload to continue.");
  const doc = parseDoc(cur.contentJson);
  if (!doc) throw new AppError("INTERNAL", "Stored draft is unreadable.");
  const index = doc.blocks.findIndex((b) => b.id === blockId);
  if (index < 0) throw new AppError("NOT_FOUND", "Block not found.");
  const old = doc.blocks[index]!;
  if (old.edited && !body.confirmOverwrite) {
    throw new AppError("CONFIRMATION_REQUIRED", "This block has your edits. Regenerating will replace them. Confirm to continue.");
  }

  const ctx = await buildContext(user, exp, doc.blueprint);
  const ordinal = doc.blocks.slice(0, index).filter((b) => b.type === old.type).length;
  const spec = { stage: old.stage, type: old.type, minutes: old.minutes, ordinal };
  const p = resolveProvider(provider);
  const pv = PROMPT_VERSIONS.regenerateBlock;
  const job = await startJob(user, "regenerateBlock", JSON.stringify([experienceId, blockId, cur.versionNumber, body.instruction ?? ""]), p, pv);
  try {
    const { data } = await generateWithRetry(p, {
      operation: "regenerateBlock", promptVersion: pv, system: loadPrompt("regenerateBlock"),
      user: wrapUntrusted(JSON.stringify({ ctx, previous: old, instruction: body.instruction ?? null }).replace(/</g, "\\u003c")),
      schema: generatedBlockSchema, schemaName: "block",
      demoInput: { text: "", context: { ctx, spec, index, previous: old, variant: Math.floor(Math.random() * 1000) } },
    });
    const sources = sourceFacts(exp);
    const used = new Set(doc.blocks.filter((b) => b.id !== blockId).map((b) => b.id));
    const fresh = normalizeBlock(data.block, { objectiveIds: doc.objectiveIds, sources, storedClaims: ctx.claims.map((c) => ({ text: c.text, status: c.status, sourceId: c.sourceId })), keepId: blockId, forceStage: old.stage, forceType: old.type, forceMinutes: old.minutes }, used);
    const next = replaceBlock(doc, blockId, fresh);
    const validation = validateExperience(next, sources);
    const v = await writeVersion(exp, user, next, validation, { promptVersion: pv, modelId: p.modelId });
    await finishJob(job.id);
    await recordAudit(user, "block.regenerate", "Experience", exp.id, { version: v.versionNumber, overwroteEdits: old.edited });
    return { version: v.versionNumber, validation, doc: next };
  } catch (e) {
    await finishJob(job.id, e);
    throw e;
  }
}

// ---------- restore ----------
export async function restoreVersion(user: SessionUser | null | undefined, experienceId: string, raw: unknown) {
  const exp = await loadOwnedExperience(user, experienceId);
  assertRole(user, TEACHING_ROLES);
  const body = restoreSchema.parse(raw);
  requireDraftBase(exp);
  const cur = await currentVersion(exp);
  if (!cur || cur.versionNumber !== body.baseVersion) throw new AppError("CONFLICT", "This experience was changed elsewhere. Reload to continue.");
  const target = await db.experienceVersion.findFirst({ where: { experienceId: exp.id, versionNumber: body.versionNumber } });
  const doc = target ? parseDoc(target.contentJson) : null;
  if (!target || !doc) throw new AppError("NOT_FOUND", "Version not found.");
  const validation = validateExperience(doc, sourceFacts(exp));
  const v = await writeVersion(exp, user, doc, validation, {});
  await recordAudit(user, "version.restore", "Experience", exp.id, { from: body.versionNumber, to: v.versionNumber });
  return { version: v.versionNumber, validation, doc };
}

