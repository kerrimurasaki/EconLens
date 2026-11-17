import type { Block, ExperienceDocument } from "@/schemas/experience";

/**
 * Student-safe projection. This is an ALLOW-LIST: only listed fields are copied, so any field added to the
 * document later is hidden from students by default.
 * Omits: teacherNotes, item.teacher (answer keys, rationale, rubric), the `edited` flag, objective/source ids,
 * and scenario effects, explanations and debrief (the server reveals those one decision at a time).
 */
export interface StudentItem { id: string; kind: string; prompt: string; options: Array<{ id: string; text: string }>; unit: string | null; independent: boolean }
export interface StudentScenario {
  premise: string;
  hypotheticalLabel: string;
  parameters: Array<{ id: string; label: string; start: number; unit: string }>;
  decisions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>;
  rules: string;
}
export interface StudentBlock {
  id: string; stage: string; type: string; title: string; minutes: number; body: string;
  table: Block["table"]; scenario: StudentScenario | null; items: StudentItem[];
  claims: Array<{ text: string; status: string }>;
}
export interface StudentDocument { title: string; essentialQuestion: string; durationMinutes: number; level: string; blocks: StudentBlock[] }

/** "all" for teacher preview; "learn" is the guided activity (no independent check); "check" is the exit ticket only. */
export type StudentScope = "all" | "learn" | "check";

export function toStudentView(doc: ExperienceDocument, scope: StudentScope = "all"): StudentDocument {
  const blocks = doc.blocks.filter((b) => (scope === "all" ? true : scope === "check" ? b.type === "EXIT_TICKET" : b.type !== "EXIT_TICKET"));
  return {
    title: doc.title,
    essentialQuestion: doc.essentialQuestion,
    durationMinutes: doc.durationMinutes,
    level: doc.level,
    blocks: blocks.map((b) => ({
      id: b.id, stage: b.stage, type: b.type, title: b.title, minutes: b.minutes, body: b.body,
      table: b.table ? { caption: b.table.caption, columns: b.table.columns, rows: b.table.rows, synthetic: b.table.synthetic, label: b.table.label, sourceId: null, asOf: b.table.asOf } : null,
      scenario: b.scenario
        ? {
            premise: b.scenario.premise,
            hypotheticalLabel: b.scenario.hypotheticalLabel,
            parameters: b.scenario.parameters.map((p) => ({ id: p.id, label: p.label, start: p.start, unit: p.unit })),
            decisions: b.scenario.decisions.map((d) => ({ id: d.id, prompt: d.prompt, options: d.options.map((o) => ({ id: o.id, label: o.label })) })),
            rules: b.scenario.rules,
          }
        : null,
      items: b.items.filter((i) => scope !== "learn" || !i.independent).map((i) => ({ id: i.id, kind: i.kind, prompt: i.prompt, options: i.options.map((o) => ({ id: o.id, text: o.text })), unit: i.unit, independent: i.independent })),
      claims: b.claims.map((c) => ({ text: c.text, status: c.status })),
    })),
  };
}
