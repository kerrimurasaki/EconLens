import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { loadOwnedExperience } from "@/server/events";
import { AppError } from "@/server/errors";
import { ProviderBanner, VerificationNotice } from "@/components/ProviderBanner";
import { AnalyzeButton } from "./AnalyzeButton";
import { ClaimRow } from "./ClaimRow";

export const metadata: Metadata = { title: "Sources and claims" };

export default async function SourcesPage({ params }: { params: Promise<{ id: string }> }) {
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
  const analyzed = Boolean(event.analyzedAt);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <nav aria-label="Steps" className="text-sm text-slate-600">
        <span className="font-semibold text-navy-900">1 Sources</span> · <Link className="underline" href={`/experiences/${id}/lenses`} aria-disabled={!analyzed}>2 Lenses</Link> · <Link className="underline" href={`/experiences/${id}/blueprint`}>3 Blueprint</Link>
      </nav>
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">{event.title}</h1>
        <p className="text-sm text-slate-600">
          Input: {event.inputType}
          {event.geography ? ` · ${event.geography}` : ""}
          {event.eventDate ? ` · event date ${event.eventDate.toISOString().slice(0, 10)}` : ""}
        </p>
      </header>
      <ProviderBanner mode={event.analysisMode} />
      <VerificationNotice />

      <section aria-labelledby="src-h" className="space-y-2">
        <h2 id="src-h" className="text-lg font-semibold text-navy-900">Sources</h2>
        <ul className="space-y-2">
          {event.sources.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="font-medium">{s.title}</p>
              <p className="text-xs text-slate-600">
                Status: <span className="font-medium">{s.status.replace("_", " ")}</span>
                {s.url ? <> · <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a></> : " · no URL"}
                {s.retrievedAt ? ` · retrieved ${s.retrievedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}
              </p>
              {s.excerpt && <p className="mt-2 line-clamp-4 whitespace-pre-line text-slate-700">{s.excerpt}</p>}
            </li>
          ))}
        </ul>
      </section>

      {!analyzed ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-navy-900">Analyse this event</h2>
          <p className="mb-3 text-sm text-slate-600">Extracts claims, unknowns and stakeholders, then ranks economics concepts. Your text is treated as data only.</p>
          <AnalyzeButton experienceId={id} />
        </section>
      ) : (
        <>
          <section aria-labelledby="sum-h" className="space-y-2">
            <h2 id="sum-h" className="text-lg font-semibold text-navy-900">Summary</h2>
            <p className="text-sm text-slate-700">{(event.analysisJson as { summary?: string } | null)?.summary}</p>
            <ul className="list-disc pl-5 text-sm text-slate-700">
              {((event.analysisJson as { unknowns?: string[] } | null)?.unknowns ?? []).map((u) => <li key={u}>Unknown: {u}</li>)}
            </ul>
          </section>
          <section aria-labelledby="cl-h" className="space-y-2">
            <h2 id="cl-h" className="text-lg font-semibold text-navy-900">Claims for you to review</h2>
            <p className="text-xs text-slate-600">
              Only a claim linked to a fetched source (URL, excerpt, retrieval time) can be marked verified. Opinions never can.
            </p>
            <ul className="space-y-2">
              {event.claims.map((c) => (
                <ClaimRow
                  key={c.id}
                  experienceId={id}
                  claim={{ id: c.id, text: c.text, type: c.claimType, status: c.verificationStatus, sourceId: c.sourceId }}
                  sources={event.sources.map((s) => ({ id: s.id, title: s.title, verifiable: Boolean(s.url && s.excerpt && s.retrievedAt) }))}
                />
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/experiences/${id}/lenses`} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Continue to economics lenses
            </Link>
            <AnalyzeButton experienceId={id} again />
          </div>
        </>
      )}
    </div>
  );
}
