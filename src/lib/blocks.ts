import type { Block, BlockType, Item, Stage } from "@/schemas/experience";

export const rid = (p: string) => `${p}_${Math.random().toString(16).slice(2, 10)}`;

export const TYPE_LABELS: Record<BlockType, string> = {
  BRIEFING: "Event briefing",
  EVIDENCE_CARD: "Evidence card",
  DATA_EXPLORER: "Data explorer",
  EXPLAINER: "Concept explainer",
  QUESTION: "Inquiry questions",
  BRANCHING_SCENARIO: "Branching scenario",
  DEBATE: "Role-play / debate",
  WORKSHEET: "Guided worksheet",
  QUIZ: "Formative quiz",
  EXIT_TICKET: "Independent exit ticket",
  REFLECTION: "Reflection",
};

/** Block types a teacher can add by hand. Scenarios and data tables are generated, then edited or regenerated. */
export const ADDABLE_TYPES: BlockType[] = ["QUESTION", "EXPLAINER", "WORKSHEET", "QUIZ", "EXIT_TICKET", "DEBATE", "REFLECTION", "BRIEFING"];

export function blankBlock(type: BlockType, stage: Stage, objectiveId: string): Block {
  return {
    id: rid("b"), stage, type, title: TYPE_LABELS[type], minutes: 1, objectiveIds: objectiveId ? [objectiveId] : [], sourceIds: [], body: "",
    table: null, scenario: null, items: [], teacherNotes: "", claims: [], edited: true,
  };
}

export function blankItem(objectiveId: string, independent: boolean): Item {
  return {
    id: rid("i"), kind: "mcq", prompt: "", unit: null, objectiveId, independent,
    options: [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }],
    teacher: { correctOptionIds: [], numericAnswer: null, tolerance: null, computation: null, rationale: "", rubric: [] },
  };
}

export function nextOptionId(ids: string[]): string {
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(97 + i);
    if (!ids.includes(c)) return c;
  }
  return rid("o");
}
