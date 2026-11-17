import { z } from "zod";

export const experienceListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});
export type ExperienceListQuery = z.infer<typeof experienceListQuery>;

export const experienceSummary = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  durationMinutes: z.number().int(),
  level: z.string(),
  isDemo: z.boolean(),
  hasDraft: z.boolean(),
  updatedAt: z.string(),
});
export type ExperienceSummary = z.infer<typeof experienceSummary>;
