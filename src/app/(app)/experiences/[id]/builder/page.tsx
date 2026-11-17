import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getDraft } from "@/server/builder";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { BuilderClient } from "./BuilderClient";

export const metadata: Metadata = { title: "Builder" };

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  let d;
  try {
    d = await getDraft(user, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  if (!d.doc || !d.version || !d.validation) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold text-navy-900">Builder</h1>
        <p className="text-sm text-slate-700">There is no draft yet. Approve a blueprint to generate your first version.</p>
        <Link href={`/experiences/${id}/blueprint`} className="inline-block rounded-md bg-navy-700 px-4 py-2 text-sm font-medium text-white">Go to blueprint</Link>
      </div>
    );
  }
  const objectives = await db.curriculumObjective.findMany({ where: { tenantId: user!.tenantId, id: { in: d.doc.objectiveIds } }, orderBy: { code: "asc" } });
  return (
    <div className="mx-auto max-w-[1400px] space-y-3">
      <nav aria-label="Steps" className="text-sm text-slate-600">
        <Link className="underline" href={`/experiences/${id}/sources`}>1 Sources</Link> · <Link className="underline" href={`/experiences/${id}/lenses`}>2 Lenses</Link> ·{" "}
        <Link className="underline" href={`/experiences/${id}/blueprint`}>3 Blueprint</Link> · <span className="font-semibold text-navy-900">4 Builder</span> · <Link className="underline" href={`/experiences/${id}/publish`}>5 Publish</Link> · <Link className="underline" href={`/experiences/${id}/insights`}>Insights</Link>
      </nav>
      <h1 className="text-2xl font-semibold text-navy-900">{d.doc.title}</h1>
      <BuilderClient
        experienceId={id}
        initialDoc={d.doc}
        initialVersion={d.version}
        initialValidation={d.validation}
        history={d.history}
        objectives={objectives.map((o) => ({ id: o.id, code: o.code, title: o.title }))}
        sources={d.exp.eventCase.sources.map((s) => ({ id: s.id, title: s.title }))}
        demo={d.exp.eventCase.analysisMode === "demo"}
      />
    </div>
  );
}
