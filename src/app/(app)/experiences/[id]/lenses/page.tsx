import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { loadOwnedExperience } from "@/server/events";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { CONCEPTS, type ConceptKey } from "@/schemas/taxonomy";
import { ProviderBanner } from "@/components/ProviderBanner";
import { LensPicker } from "./LensPicker";

export const metadata: Metadata = { title: "Economics lenses" };

interface Details { inquiryQuestion?: string; alternativeLens?: string }

export default async function LensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  let exp;
  try {
    exp = await loadOwnedExperience(user, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const event = exp.eventCase;

  if (!event.analyzedAt) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold text-navy-900">Economics lenses</h1>
        <p className="text-sm text-slate-700">Analyse the event first so concepts can be suggested.</p>
        <Link href={`/experiences/${id}/sources`} className="inline-block rounded-md bg-navy-700 px-4 py-2 text-sm font-medium text-white">Go to sources</Link>
      </div>
    );
  }

  const objectives = await db.curriculumObjective.findMany({ where: { tenantId: user!.tenantId }, orderBy: { code: "asc" } });
  const settings = (exp.settingsJson ?? {}) as { inquiryQuestion?: string; objectiveIds?: string[]; lensesApproved?: boolean };

  const lenses = event.concepts.map((c) => {
    const d = (c.detailsJson ?? {}) as Details;
    return {
      key: c.conceptKey,
      name: CONCEPTS[c.conceptKey as ConceptKey] ?? c.conceptKey,
      score: c.score,
      mechanism: c.explanation,
      prerequisites: c.prerequisitesJson as string[],
      misconceptions: c.misconceptionJson as string[],
      limitations: c.limitationsJson as string[],
      inquiryQuestion: d.inquiryQuestion ?? "",
      alternativeLens: d.alternativeLens ?? "",
      selected: c.selected,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <nav aria-label="Steps" className="text-sm text-slate-600">
        <Link className="underline" href={`/experiences/${id}/sources`}>1 Sources</Link> · <span className="font-semibold text-navy-900">2 Lenses</span> · <Link className="underline" href={`/experiences/${id}/blueprint`}>3 Blueprint</Link>
      </nav>
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Choose your economics lenses</h1>
        <p className="text-sm text-slate-600">Ranked suggestions for “{event.title}”. Select 1 to 3, set the inquiry question and confirm learning objectives.</p>
      </header>
      <ProviderBanner mode={event.analysisMode} />
      <LensPicker
        experienceId={id}
        lenses={lenses}
        objectives={objectives.map((o) => ({ id: o.id, code: o.code, title: o.title }))}
        initialQuestion={settings.inquiryQuestion ?? ""}
        initialObjectiveIds={settings.objectiveIds ?? []}
        approved={Boolean(settings.lensesApproved)}
      />
    </div>
  );
}
