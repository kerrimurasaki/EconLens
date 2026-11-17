import { STAGES, type Block, type Blueprint, type ExperienceDocument } from "@/schemas/experience";
import type { SourceFacts } from "./validate";

const rid = (p: string) => `${p}_${Math.random().toString(16).slice(2, 10)}`;
const isVerifiable = (s?: SourceFacts) => Boolean(s?.url && s?.excerpt && s?.retrievedAt);

/**
 * Cleans a model-produced block: forces fresh unique ids, valid references, never-upgraded claim statuses.
 * Nothing here "fixes" content quality; problems are left for validateExperience to report honestly.
 */
export interface StoredClaim { text: string; status: Block["claims"][number]["status"]; sourceId: string | null }

export function normalizeBlock(raw: Block, opts: { objectiveIds: string[]; sources: SourceFacts[]; storedClaims?: StoredClaim[]; keepId?: string; forceStage?: Block["stage"]; forceType?: Block["type"]; forceMinutes?: number }, usedIds: Set<string>): Block {
  const sourceById = new Map(opts.sources.map((s) => [s.id, s]));
  let id = opts.keepId ?? (raw.id && !usedIds.has(raw.id) ? raw.id : rid("b"));
  while (usedIds.has(id)) id = rid("b");
  usedIds.add(id);
  const itemIds = new Set<string>();
  return {
    ...raw,
    id,
    stage: opts.forceStage ?? raw.stage,
    type: opts.forceType ?? raw.type,
    minutes: opts.forceMinutes ?? raw.minutes,
    objectiveIds: [...new Set(raw.objectiveIds.filter((o) => opts.objectiveIds.includes(o)))],
    sourceIds: [...new Set(raw.sourceIds.filter((s) => sourceById.has(s)))],
    // A claim's status is never taken from the model: it comes from the teacher-reviewed claim stored for the event.
    // Claims that do not match a stored claim can never be "verified" or "teacher_provided".
    claims: raw.claims.map((c) => {
      const stored = opts.storedClaims?.find((x) => x.text.trim() === c.text.trim());
      if (stored) {
        const src = stored.sourceId ? sourceById.get(stored.sourceId) : undefined;
        const status = stored.status === "verified" && !isVerifiable(src) ? "unverified" : stored.status;
        return { ...c, status, sourceId: stored.sourceId && sourceById.has(stored.sourceId) ? stored.sourceId : null };
      }
      return { ...c, status: c.status === "hypothetical" ? ("hypothetical" as const) : ("unverified" as const), sourceId: null };
    }),
    table: raw.table ? { ...raw.table, sourceId: raw.table.sourceId && sourceById.has(raw.table.sourceId) ? raw.table.sourceId : null } : null,
    items: raw.items.map((it, n) => {
      let iid = it.id && !itemIds.has(it.id) ? it.id : `${id}_i${n + 1}`;
      while (itemIds.has(iid)) iid += "x";
      itemIds.add(iid);
      return { ...it, id: iid, objectiveId: opts.objectiveIds.includes(it.objectiveId) ? it.objectiveId : (opts.objectiveIds[0] ?? it.objectiveId) };
    }),
    edited: false,
  };
}

export function assembleDocument(args: {
  title: string; essentialQuestion: string; blueprint: Blueprint; objectiveIds: string[]; blocks: Block[]; sources: SourceFacts[]; storedClaims?: StoredClaim[];
}): ExperienceDocument {
  const used = new Set<string>();
  const blocks = args.blocks
    .map((b) => normalizeBlock(b, { objectiveIds: args.objectiveIds, sources: args.sources, storedClaims: args.storedClaims }, used))
    .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
  return {
    schemaVersion: 1,
    title: args.title.slice(0, 200),
    essentialQuestion: args.essentialQuestion.slice(0, 400),
    durationMinutes: args.blueprint.durationMinutes,
    level: args.blueprint.level,
    objectiveIds: args.objectiveIds,
    blueprint: args.blueprint,
    blocks,
  };
}

const strip = (b: Block) => JSON.stringify({ ...b, edited: false });

/** Server-decided `edited` flag: teachers cannot clear or fake it. */
export function markEdits(prev: ExperienceDocument, next: ExperienceDocument): ExperienceDocument {
  const before = new Map(prev.blocks.map((b) => [b.id, b]));
  return {
    ...next,
    blocks: next.blocks.map((b) => {
      const old = before.get(b.id);
      if (!old) return { ...b, edited: true };
      return { ...b, edited: strip(old) === strip(b) ? old.edited : true };
    }),
  };
}

/** Replaces exactly one block; every other block object is carried over unchanged. */
export function replaceBlock(doc: ExperienceDocument, blockId: string, replacement: Block): ExperienceDocument {
  return { ...doc, blocks: doc.blocks.map((b) => (b.id === blockId ? replacement : b)) };
}
