import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { loadOwnedExperience } from "@/server/events";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { ProviderBanner } from "@/components/ProviderBanner";
import { CONCEPTS, type ConceptKey } from "@/schemas/taxonomy";
import { blueprintSchema, DEFAULT_BLUEPRINT } from "@/schemas/experience";
import { BlueprintForm } from "./BlueprintForm";

export const metadata: Metadata = { title: "Blueprint" };

export default async function BlueprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  let exp;
  try {
    exp = await loadOwnedExperience(user, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const s = (exp.settingsJson ?? {}) as { inquiryQuestion?: string; objectiveIds?: string[]; lensesApproved?: boolean; blueprint?: unknown };

  if (!s.lensesApproved) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold text-navy-900">Blueprint</h1>
        <p className="text-sm text-slate-700">Confirm your economics lenses, inquiry question and objectives before planning the lesson.</p>
        <Link href={`/experiences/${id}/lenses`} className="inline-block rounded-md bg-navy-700 px-4 py-2 text-sm font-medium text-white">Go to lenses</Link>
      </div>
    );
  }

  const objectives = await db.curriculumObjective.findMany({ where: { tenantId: user!.tenantId, id: { in: s.objectiveIds ?? [] } }, orderBy: { code: "asc" } });
  const selected = exp.eventCase.concepts.filter((c) => c.selected).map((c) => CONCEPTS[c.conceptKey as ConceptKey] ?? c.conceptKey);
  const parsed = blueprintSchema.safeParse(s.blueprint);
  const hasDraft = Boolean(exp.currentVersionId) && (await db.experienceBlock.count({ where: { experienceVersionId: exp.currentVersionId! } })) > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav aria-label="Steps" className="text-sm text-slate-600">
        <Link className="underline" href={`/experiences/${id}/sources`}>1 Sources</Link> · <Link className="underline" href={`/experiences/${id}/lenses`}>2 Lenses</Link> ·{" "}
        <span className="font-semibold text-navy-900">3 Blueprint</span>
        {hasDraft && <> · <Link className="underline" href={`/experiences/${id}/builder`}>4 Builder</Link></>}
      </nav>
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Plan the lesson</h1>
        <p className="text-sm text-slate-600">Choose pacing and scaffolds. Nothing is generated until you approve this blueprint.</p>
      </header>
      <ProviderBanner mode={exp.eventCase.analysisMode} />
      <section aria-labelledby="sum" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 id="sum" className="font-semibold text-navy-900">Your selections</h2>
        <p className="mt-1"><span className="font-medium">Lenses:</span> {selected.join(", ")}</p>
        <p><span className="font-medium">Inquiry question:</span> {s.inquiryQuestion}</p>
        <p><span className="font-medium">Objectives:</span> {objectives.map((o) => o.code).join(", ")}</p>
      </section>
      <BlueprintForm experienceId={id} initial={parsed.success ? parsed.data : DEFAULT_BLUEPRINT} hasDraft={hasDraft} />
    </div>
  );
}
