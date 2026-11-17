import { STAGES, type Block, type ExperienceDocument, type Item, type ValidationIssue, type ValidationResult } from "@/schemas/experience";

export const MIN_FORMATIVE = 5;
export const MIN_INDEPENDENT = 3;

export interface SourceFacts {
  id: string;
  url: string | null;
  excerpt: string | null;
  retrievedAt: Date | string | null;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const pct = (from: number, to: number) => Math.round(((to - from) / from) * 1000) / 10;

/** Student-visible text of a block (what a student could read before submitting). */
function studentText(b: Block): string[] {
  return [
    b.title, b.body,
    ...(b.table ? [b.table.caption, b.table.label, ...b.table.columns, ...b.table.rows.flat()] : []),
    ...(b.scenario ? [b.scenario.premise, b.scenario.rules, b.scenario.debrief, ...b.scenario.decisions.flatMap((d) => [d.prompt, ...d.options.map((o) => o.label)])] : []),
    ...b.items.flatMap((i) => [i.prompt, ...i.options.map((o) => o.text)]),
  ];
}

/**
 * Deterministic quality gate (FR-16). Blocking issues prevent publication in M4.
 * Pure: takes the document and the event's source facts; never touches the database.
 */
export function validateExperience(doc: ExperienceDocument, sources: SourceFacts[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const block = (code: string, message: string, extra: Partial<ValidationIssue> = {}) => issues.push({ severity: "blocking", code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<ValidationIssue> = {}) => issues.push({ severity: "warning", code, message, ...extra });

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const items: Array<{ item: Item; block: Block }> = doc.blocks.flatMap((b) => b.items.map((item) => ({ item, block: b })));
  const total = doc.blocks.reduce((a, b) => a + b.minutes, 0);
  const independent = items.filter((x) => x.item.independent);
  const formative = items.filter((x) => !x.item.independent);

  // Objectives
  if (doc.objectiveIds.length === 0) block("NO_OBJECTIVES", "No learning objectives are selected.");
  for (const b of doc.blocks) {
    if (b.objectiveIds.length === 0) block("BLOCK_NO_OBJECTIVE", `"${b.title}" is not aligned to any objective.`, { blockId: b.id });
    else if (b.objectiveIds.some((o) => !doc.objectiveIds.includes(o))) block("BLOCK_BAD_OBJECTIVE", `"${b.title}" references an objective that is not selected for this experience.`, { blockId: b.id });
  }

  // Time
  if (total !== doc.durationMinutes) block("DURATION_MISMATCH", `Block minutes add up to ${total}, but the lesson is ${doc.durationMinutes} minutes.`);
  for (const b of doc.blocks) {
    if (b.minutes < 1) block("BAD_MINUTES", `"${b.title}" needs at least 1 minute.`, { blockId: b.id });
    else if (doc.durationMinutes > 0 && b.minutes / doc.durationMinutes > 0.4) warn("LONG_BLOCK", `"${b.title}" takes over 40% of the lesson. Consider splitting it.`, { blockId: b.id });
  }

  // Stage coverage
  for (const s of STAGES) if (!doc.blocks.some((b) => b.stage === s)) block("MISSING_STAGE", `The ${s} stage has no blocks.`);
  if (!doc.blocks.some((b) => b.type === "BRANCHING_SCENARIO")) block("NO_SCENARIO", "There is no interactive branching scenario.");
  if (!doc.blocks.some((b) => b.type === "REFLECTION")) warn("NO_REFLECTION", "There is no reflection block.");

  // Assessment counts
  if (independent.length < MIN_INDEPENDENT) block("NO_INDEPENDENT_CHECK", `At least ${MIN_INDEPENDENT} independent exit-ticket questions are required (found ${independent.length}).`);
  if (formative.length < MIN_FORMATIVE) block("TOO_FEW_FORMATIVE", `At least ${MIN_FORMATIVE} formative questions are required (found ${formative.length}).`);
  if (independent.some((x) => x.block.type !== "EXIT_TICKET")) block("INDEPENDENT_OUTSIDE_EXIT", "Independent questions must sit in the exit ticket so they are not shown during practice.");

  // Item correctness
  const seen = new Map<string, string>();
  for (const { item, block: b } of items) {
    const at = { blockId: b.id, itemId: item.id };
    const label = `A question in "${b.title}"`;
    if (!item.prompt.trim()) block("EMPTY_PROMPT", `${label} has no question text.`, at);
    if (!doc.objectiveIds.includes(item.objectiveId)) block("ITEM_BAD_OBJECTIVE", `${label} is not mapped to a selected objective.`, at);
    const t = item.teacher;
    if (item.kind === "mcq" || item.kind === "multi") {
      const ids = new Set(item.options.map((o) => o.id));
      if (item.options.length < 3) block("TOO_FEW_OPTIONS", `${label} needs at least 3 options.`, at);
      if (new Set(item.options.map((o) => o.text.trim().toLowerCase())).size !== item.options.length) block("DUPLICATE_OPTIONS", `${label} has duplicate options.`, at);
      if (t.correctOptionIds.length === 0) block("ANSWER_KEY_MISSING", `${label} has no correct answer set.`, at);
      else if (t.correctOptionIds.some((c) => !ids.has(c))) block("ANSWER_KEY_INVALID", `${label} has an answer key that does not match its options.`, at);
      else if (item.kind === "mcq" && t.correctOptionIds.length !== 1) block("ANSWER_KEY_INVALID", `${label} is single-choice but has ${t.correctOptionIds.length} correct answers.`, at);
      else if (item.kind === "multi" && t.correctOptionIds.length >= item.options.length) block("ANSWER_KEY_INVALID", `${label} marks every option as correct.`, at);
    } else if (item.kind === "numeric") {
      if (t.numericAnswer === null || !Number.isFinite(t.numericAnswer)) block("ANSWER_KEY_MISSING", `${label} has no numeric answer.`, at);
      else {
        if (t.tolerance === null || t.tolerance < 0) block("ANSWER_KEY_INVALID", `${label} needs a non-negative tolerance.`, at);
        if (!item.unit?.trim()) warn("NO_UNIT", `${label} has no unit.`, at);
        if (t.computation && t.computation.from !== 0) {
          const expected = pct(t.computation.from, t.computation.to);
          if (Math.abs(expected - t.numericAnswer) > (t.tolerance ?? 0) + 1e-9) block("ANSWER_KEY_INCONSISTENT", `${label}: the keyed answer (${t.numericAnswer}) does not match its own calculation (${expected}).`, at);
        }
      }
    } else if (item.kind === "short") {
      if (t.rubric.filter((r) => r.trim()).length === 0) block("ANSWER_KEY_MISSING", `${label} has no marking rubric.`, at);
    }
    if (!t.rationale.trim()) warn("NO_RATIONALE", `${label} has no explanation for teachers.`, at);

    const key = item.prompt.trim().toLowerCase();
    if (seen.has(key)) warn("DUPLICATE_QUESTION", `${label} repeats another question.`, at);
    seen.set(key, item.id);
  }

  // Answer leakage: teacher-only text or keyed answers must not appear in student-visible text.
  const everything = doc.blocks.map((b) => ({ b, text: studentText(b).join("\n") }));
  for (const { item, block: b } of items) {
    const t = item.teacher;
    const secrets = [t.rationale, ...t.rubric].map((s) => s.trim()).filter((s) => s.length >= 25);
    for (const { b: other, text } of everything) {
      if (secrets.some((s) => text.includes(s))) block("ANSWER_LEAK", `Teacher-only answer text appears in student-facing content of "${other.title}".`, { blockId: other.id, itemId: item.id });
    }
    if (item.independent) {
      const correct = item.options.filter((o) => t.correctOptionIds.includes(o.id)).map((o) => o.text.trim()).filter((s) => s.length >= 20);
      for (const { item: other } of items) {
        if (other.id === item.id) continue;
        const otherText = [other.prompt, ...other.options.map((o) => o.text)].join("\n");
        if (correct.some((c) => otherText.includes(c))) block("ANSWER_LEAK", `The correct answer to an independent question appears in another question ("${other.prompt.slice(0, 50)}").`, { blockId: b.id, itemId: item.id });
      }
    }
    if (/\b(correct answer|answer key|the answer is)\b/i.test(item.prompt)) block("ANSWER_LEAK", `A question prompt in "${b.title}" appears to state its own answer.`, { blockId: b.id, itemId: item.id });
  }

  // Provenance and labelling
  for (const b of doc.blocks) {
    for (const c of b.claims) {
      if (c.status === "verified") {
        const s = c.sourceId ? sourceById.get(c.sourceId) : undefined;
        if (!s || !s.url || !s.excerpt || !s.retrievedAt) block("UNSOURCED_VERIFIED_CLAIM", `A claim in "${b.title}" is marked verified but has no fetched source (URL, excerpt, retrieval time).`, { blockId: b.id });
      } else if (c.status === "unverified" || c.status === "teacher_provided") {
        warn("UNVERIFIED_CLAIM_SHOWN", `"${b.title}" shows a claim that is not independently verified. Students will see it labelled.`, { blockId: b.id });
      }
    }
    for (const sid of b.sourceIds) if (!sourceById.has(sid)) block("UNKNOWN_SOURCE", `"${b.title}" cites a source that does not exist.`, { blockId: b.id });
    if (b.table) {
      const tb = b.table;
      if (!tb.caption.trim() || tb.columns.length === 0 || tb.columns.some((c) => !c.trim())) block("TABLE_UNLABELLED", `The table in "${b.title}" needs a caption and labelled columns (with units).`, { blockId: b.id });
      if (tb.rows.some((r) => r.length !== tb.columns.length)) block("TABLE_SHAPE", `The table in "${b.title}" has rows that do not match its columns.`, { blockId: b.id });
      if (tb.synthetic && !/synthetic teaching data/i.test(tb.label)) block("SYNTHETIC_UNLABELLED", `The table in "${b.title}" is synthetic but is not labelled "synthetic teaching data".`, { blockId: b.id });
      if (!tb.synthetic) {
        const s = tb.sourceId ? sourceById.get(tb.sourceId) : undefined;
        if (!s || !tb.asOf) block("DATA_UNSOURCED", `The data in "${b.title}" is presented as real but has no dated source.`, { blockId: b.id });
      }
    }
    if (b.scenario) {
      const sc = b.scenario;
      if (!/hypothetical|stylised|stylized|synthetic/i.test(sc.hypotheticalLabel)) block("SCENARIO_UNLABELLED", `The scenario in "${b.title}" must be labelled hypothetical.`, { blockId: b.id });
      const params = new Set(sc.parameters.map((p) => p.id));
      if (sc.decisions.length === 0 || sc.decisions.some((d) => d.options.length < 2)) block("SCENARIO_INCOMPLETE", `The scenario in "${b.title}" needs decisions with at least 2 options each.`, { blockId: b.id });
      if (sc.decisions.some((d) => d.options.some((o) => o.effects.some((e) => !params.has(e.parameterId))))) block("SCENARIO_BAD_EFFECT", `The scenario in "${b.title}" has an effect on an unknown parameter.`, { blockId: b.id });
      if (!sc.rules.trim() || !sc.debrief.trim()) block("SCENARIO_NO_DEBRIEF", `The scenario in "${b.title}" needs rules and a debrief.`, { blockId: b.id });
    }
    if (words(b.body) > 350) warn("LONG_TEXT", `"${b.title}" has over 350 words of reading. Consider shortening it for foundation students.`, { blockId: b.id });
    if (b.type !== "REFLECTION" && b.type !== "BRANCHING_SCENARIO" && !b.teacherNotes.trim()) warn("NO_TEACHER_NOTES", `"${b.title}" has no teacher notes.`, { blockId: b.id });
  }

  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { passed: blocking.length === 0, blocking, warnings, stats: { formativeItems: formative.length, independentItems: independent.length, totalMinutes: total, blocks: doc.blocks.length } };
}
