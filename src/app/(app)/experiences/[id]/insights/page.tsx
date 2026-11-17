import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getInsights } from "@/server/learn/insights";
import { AppError } from "@/server/errors";
import { ReleaseFeedbackButton, ReviewRow } from "./InsightControls";

export const metadata: Metadata = { title: "Insights" };

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await getInsights(await getSessionUser(), id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav aria-label="Steps" className="text-sm text-slate-600"><Link className="underline" href={`/experiences/${id}/publish`}>← Publish</Link></nav>
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Insights</h1>
        <p className="text-sm text-slate-600">Real student submissions only. Scores support your judgement; they are not automatic grades and never rank students.</p>
      </header>
      {data.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">This experience has not been assigned to a class yet. <Link className="underline" href={`/experiences/${id}/publish`}>Publish it</Link>.</p>}
      {data.map((a) => (
        <section key={a.assignmentId} aria-labelledby={`a-${a.assignmentId}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 id={`a-${a.assignmentId}`} className="text-lg font-semibold text-navy-900">{a.className} · version {a.version}</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Enrolled", a.enrolled], ["Started", a.started], ["Submitted", a.submitted], ["Average independent score", pct(a.averageIndependentScore)]].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-navy-50 p-3"><dt className="text-xs text-slate-600">{k}</dt><dd className="text-xl font-semibold text-navy-900">{v}</dd></div>
            ))}
          </dl>
          {a.feedbackMode === "manual" && <div className="flex items-center gap-3">{a.feedbackReleased ? <span className="text-xs text-teal-700">Answers released to students.</span> : <ReleaseFeedbackButton assignmentId={a.assignmentId} />}</div>}

          <div>
            <h3 className="font-semibold">Not yet submitted ({a.nonSubmitters.length})</h3>
            {a.nonSubmitters.length === 0 ? <p className="text-xs text-slate-600">Everyone enrolled has submitted.</p> : <ul className="list-disc pl-5 text-xs">{a.nonSubmitters.map((n) => <li key={n.name}>{n.name} ({n.state})</li>)}</ul>}
          </div>

          <div>
            <h3 className="font-semibold">By learning objective</h3>
            {a.objectives.length === 0 ? <p className="text-xs text-slate-600">No submitted attempts yet.</p> : (
              <table className="w-full text-xs"><thead><tr><th scope="col" className="py-1 text-left">Objective</th><th scope="col" className="py-1 text-left">Questions</th><th scope="col" className="py-1 text-left">Correct</th></tr></thead>
                <tbody>{a.objectives.map((o) => <tr key={o.code} className="border-t"><td className="py-1">{o.code}</td><td>{o.items}</td><td>{pct(o.correctRate)}</td></tr>)}</tbody></table>
            )}
          </div>

          <div>
            <h3 className="font-semibold">By question and common wrong answers</h3>
            {a.submitted === 0 ? <p className="text-xs text-slate-600">No submitted attempts yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th scope="col" className="py-1 text-left">Question</th><th scope="col" className="py-1 text-left">Section</th><th scope="col" className="py-1 text-left">Objective</th><th scope="col" className="py-1 text-left">Correct</th><th scope="col" className="py-1 text-left">Most common wrong choice (count)</th></tr></thead>
                <tbody>{a.items.map((i) => <tr key={i.itemId} className="border-t align-top"><td className="py-1 pr-2">{i.prompt}</td><td className="pr-2">{i.section}</td><td className="pr-2">{i.objective}</td><td className="pr-2">{pct(i.correctRate)}{i.kind === "short" ? " (marked)" : ""}</td><td>{i.commonWrong ?? "—"}</td></tr>)}</tbody></table></div>
            )}
          </div>

          {a.scenarios.map((s) => (
            <div key={s.title}>
              <h3 className="font-semibold">{s.title}: choices ({s.completed} completed)</h3>
              {s.choices.map((c) => (
                <div key={c.decision} className="mt-1 text-xs"><p className="font-medium">{c.decision}</p><ul className="list-disc pl-5">{c.options.map((o) => <li key={o.label}>{o.label}: {o.count}</li>)}</ul></div>
              ))}
            </div>
          ))}

          <div>
            <h3 className="font-semibold">Review queue: written answers</h3>
            {a.reviewQueue.length === 0 ? <p className="text-xs text-slate-600">Nothing to review.</p> : <ul className="space-y-3">{a.reviewQueue.map((r) => <ReviewRow key={r.responseId} row={r} />)}</ul>}
          </div>
        </section>
      ))}
    </div>
  );
}
