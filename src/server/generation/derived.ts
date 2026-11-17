import type { Prisma } from "@/generated/prisma/client";
import type { ExperienceDocument } from "@/schemas/experience";

type Tx = Pick<Prisma.TransactionClient, "experienceBlock" | "assessmentItem">;

export const assessmentItemRowId = (versionId: string, itemId: string) => `${versionId}:${itemId}`;

/**
 * Writes the derived/indexed ExperienceBlock and AssessmentItem rows for a version (CLAUDE.md rule 3).
 * `contentJson` on the version remains canonical; these rows must only be written here, in the same transaction.
 */
export async function writeDerivedRows(tx: Tx, versionId: string, doc: ExperienceDocument) {
  for (const [order, b] of doc.blocks.entries()) {
    const row = await tx.experienceBlock.create({
      data: {
        experienceVersionId: versionId, order, type: b.type, title: b.title, durationMinutes: b.minutes,
        contentJson: { body: b.body, table: b.table, scenario: b.scenario } as unknown as Prisma.InputJsonValue,
        teacherNotesJson: { notes: b.teacherNotes }, objectiveIdsJson: b.objectiveIds, sourceIdsJson: b.sourceIds, visibility: "student",
      },
    });
    if (b.items.length) {
      await tx.assessmentItem.createMany({
        data: b.items.map((i) => ({
          // Deterministic id so responses can reference an item of a specific immutable version.
          id: assessmentItemRowId(versionId, i.id),
          experienceVersionId: versionId, blockId: row.id, type: i.kind, promptJson: { text: i.prompt }, optionsJson: i.options,
          answerKeyJson: i.teacher as unknown as Prisma.InputJsonValue, explanationJson: { rationale: i.teacher.rationale },
          rubricJson: i.teacher.rubric, objectiveId: i.objectiveId, independent: i.independent,
        })),
      });
    }
  }
}
