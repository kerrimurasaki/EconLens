import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getPublishState } from "@/server/publish";
import { AppError } from "@/server/errors";
import { PublishForm } from "./PublishForm";
import { CloseAssignmentButton } from "./CloseAssignmentButton";

export const metadata: Metadata = { title: "Publish" };

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let s;
  try {
    s = await getPublishState(await getSessionUser(), id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { d } = s;
  if (!d.doc || !d.validation) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold text-navy-900">Publish</h1>
        <p className="text-sm text-slate-700">There is no draft to publish yet.</p>
        <Link href={`/experiences/${id}/blueprint`} className="underline">Go to blueprint</Link>
      </div>
    );
  }
  const v = d.validation;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav aria-label="Steps" className="text-sm text-slate-600">
        <Link className="underline" href={`/experiences/${id}/builder`}>← Builder</Link> · <Link className="underline" href={`/experiences/${id}/preview`}>Preview</Link> · <Link className="underline" href={`/experiences/${id}/insights`}>Insights</Link>
      </nav>
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Publish “{d.doc.title}”</h1>
        <p className="text-sm text-slate-600">Publishing freezes draft version {d.version} as an immutable snapshot for the class. Later edits create a new draft and never change work already assigned.</p>
      </header>

      <section aria-labelledby="qa" className={`rounded-xl border p-4 text-sm ${v.passed ? "border-teal-300 bg-teal-50" : "border-red-300 bg-red-50"}`}>
        <h2 id="qa" className="font-semibold">{v.passed ? "Quality check passed" : `Quality check failed: ${v.blocking.length} blocking issue(s)`}</h2>
        <p className="text-xs">{v.stats.formativeItems} formative and {v.stats.independentItems} independent questions · {v.stats.totalMinutes}/{d.doc.durationMinutes} minutes · {v.warnings.length} warning(s)</p>
        {(v.blocking.length > 0 || v.warnings.length > 0) && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            {[...v.blocking, ...v.warnings].map((i, n) => <li key={n}><span className="font-medium">{i.severity === "blocking" ? "Blocking: " : "Warning: "}</span>{i.message}</li>)}
          </ul>
        )}
        {!v.passed && <p className="mt-2"><Link className="underline" href={`/experiences/${id}/builder`}>Fix these in the builder</Link></p>}
      </section>

      {s.currentIsPublished && <p role="status" className="rounded-md bg-slate-100 p-3 text-sm">This exact version is already published. Assigning it to another class does not change it.</p>}

      <PublishForm experienceId={id} blocked={!v.passed} classes={s.classes.map((c) => ({ id: c.id, name: c.name, students: c._count.enrollments }))} />

      {s.assignments.length > 0 && (
        <section aria-labelledby="as" className="space-y-2">
          <h2 id="as" className="text-lg font-semibold text-navy-900">Assignments</h2>
          <ul className="space-y-2 text-sm">
            {s.assignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">{a.classroom.name} · version {a.publishedVersion.versionNumber} · {a._count.attempts} attempt(s) · feedback: {a.feedbackMode === "manual" ? "released by you" : "after submission"} · {a.status === "OPEN" ? <CloseAssignmentButton assignmentId={a.id} /> : <span className="text-slate-500">closed</span>}</li>
            ))}
          </ul>
          <Link href={`/experiences/${id}/insights`} className="text-sm underline">View insights</Link>
        </section>
      )}
    </div>
  );
}
