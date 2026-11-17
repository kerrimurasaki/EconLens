import { z } from "zod";

export const createClassSchema = z.object({ name: z.string().trim().min(2).max(100), term: z.string().trim().max(50).optional() });
export const joinSchema = z.object({ code: z.string().trim().min(4).max(20) });
export const publishSchema = z.object({
  classId: z.string().min(1).max(60),
  dueAt: z.string().datetime().nullable().optional(),
  feedbackMode: z.enum(["after_submit", "manual"]).default("after_submit"),
});
export const scoreResponseSchema = z.object({
  teacherScore: z.number().min(0).max(1),
  feedback: z.string().trim().max(1000).optional(),
});
export const scenarioChoiceSchema = z.object({ blockId: z.string().max(60), decisionId: z.string().max(60), optionId: z.string().max(60) });
export const scenarioResetSchema = z.object({ blockId: z.string().max(60) });
export const saveResponseSchema = z.object({ itemId: z.string().max(80), response: z.unknown() });
