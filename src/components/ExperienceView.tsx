import { STAGE_LABELS, STAGES, type ExperienceDocument } from "@/schemas/experience";
import type { StudentDocument } from "@/server/generation/studentView";

const STATUS_LABEL: Record<string, string> = {
  verified: "checked against a source", teacher_provided: "teacher-provided, not independently verified", disputed: "disputed", hypothetical: "hypothetical", unverified: "unverified",
};

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</>;
}

/**
 * Renders the student view. It only accepts the StudentDocument projection, so teacher-only fields
 * cannot be rendered here even by mistake. All text is rendered as plain text (React escapes it).
 */
export function StudentExperience({ doc }: { doc: StudentDocument }) {
  return (
    <article className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-navy-900">{doc.title}</h2>
        <p className="text-sm text-slate-600">{doc.durationMinutes} minutes · {doc.level}</p>
        <p className="mt-2 rounded-md bg-teal-50 p-3 text-sm text-teal-900"><span className="font-medium">Essential question: </span>{doc.essentialQuestion}</p>
      </header>
      {STAGES.map((s) => {
        const blocks = doc.blocks.filter((b) => b.stage === s);
        if (!blocks.length) return null;
        return (
          <section key={s} aria-labelledby={`st-${s}`} className="space-y-3">
            <h3 id={`st-${s}`} className="text-sm font-semibold uppercase tracking-wide text-slate-500">{STAGE_LABELS[s]}</h3>
            {blocks.map((b) => (
              <div key={b.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <h4 className="text-base font-semibold text-navy-900">{b.title} <span className="text-xs font-normal text-slate-500">{b.minutes} min</span></h4>
                <Paragraphs text={b.body} />
                {b.claims.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
                    {b.claims.map((c, i) => <li key={i}><span className="font-medium">{STATUS_LABEL[c.status] ?? c.status}:</span> {c.text}</li>)}
                  </ul>
                )}
                {b.table && (
                  <div className="overflow-x-auto">
                    <p className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{b.table.label}</p>
                    <table className="mt-1 w-full text-sm">
                      <caption className="py-1 text-left text-xs text-slate-600">{b.table.caption}</caption>
                      <thead><tr>{b.table.columns.map((c) => <th key={c} scope="col" className="border-b px-2 py-1 text-left">{c}</th>)}</tr></thead>
                      <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b px-2 py-1">{c}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                {b.scenario && (
                  <div className="space-y-2 rounded-md bg-slate-50 p-3">
                    <p className="text-xs font-medium text-amber-900">{b.scenario.hypotheticalLabel}</p>
                    <p>{b.scenario.premise}</p>
                    <ul className="text-xs text-slate-700">{b.scenario.parameters.map((p) => <li key={p.id}>{p.label}: {p.start} {p.unit}</li>)}</ul>
                    {b.scenario.decisions.map((d) => (
                      <fieldset key={d.id} className="text-sm">
                        <legend className="font-medium">{d.prompt}</legend>
                        {d.options.map((o) => <label key={o.id} className="flex items-center gap-2"><input type="radio" name={`${b.id}-${d.id}`} disabled /> {o.label}</label>)}
                      </fieldset>
                    ))}
                    <p className="text-xs text-slate-500">Preview only: the interactive simulation runs in the student activity (Milestone 4).</p>
                  </div>
                )}
                {b.items.length > 0 && (
                  <ol className="list-decimal space-y-3 pl-5">
                    {b.items.map((it) => (
                      <li key={it.id}>
                        <p>{it.prompt}{it.unit ? ` (answer in ${it.unit})` : ""}</p>
                        {(it.kind === "mcq" || it.kind === "multi") && (
                          <ul className="mt-1 space-y-1">{it.options.map((o) => <li key={o.id}><label className="flex items-start gap-2"><input type={it.kind === "multi" ? "checkbox" : "radio"} name={it.id} disabled className="mt-1" /> <span>{o.text}</span></label></li>)}</ul>
                        )}
                        {it.kind === "numeric" && <input disabled aria-label="Your answer" className="mt-1 rounded border border-slate-300 px-2 py-1" placeholder="Number" />}
                        {it.kind === "short" && <textarea disabled aria-label="Your answer" rows={3} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </article>
  );
}

/** Teacher view: full document including notes and answer keys. Teacher-only pages must call this. */
export function TeacherExperience({ doc }: { doc: ExperienceDocument }) {
  return (
    <article className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-navy-900">{doc.title} (teacher guide)</h2>
        <p className="text-sm text-slate-600">{doc.durationMinutes} minutes · {doc.level}</p>
        <p className="mt-2 text-sm"><span className="font-medium">Essential question: </span>{doc.essentialQuestion}</p>
      </header>
      {STAGES.map((s) => {
        const blocks = doc.blocks.filter((b) => b.stage === s);
        if (!blocks.length) return null;
        return (
          <section key={s} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{STAGE_LABELS[s]} · {blocks.reduce((a, b) => a + b.minutes, 0)} min</h3>
            {blocks.map((b) => (
              <div key={b.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <h4 className="text-base font-semibold text-navy-900">{b.title} <span className="text-xs font-normal text-slate-500">{b.minutes} min</span></h4>
                <Paragraphs text={b.body} />
                {b.teacherNotes && <p className="rounded bg-navy-50 p-2 text-xs"><span className="font-medium">Teacher notes: </span>{b.teacherNotes}</p>}
                {b.scenario && <p className="text-xs"><span className="font-medium">Scenario rules: </span>{b.scenario.rules} <span className="font-medium">Debrief: </span>{b.scenario.debrief}</p>}
                {b.items.map((it, n) => (
                  <div key={it.id} className="rounded border border-slate-200 p-2">
                    <p className="font-medium">Q{n + 1}{it.independent ? " (independent)" : ""}: {it.prompt}</p>
                    {it.options.length > 0 && <ul className="ml-4 list-[lower-alpha]">{it.options.map((o) => <li key={o.id} className={it.teacher.correctOptionIds.includes(o.id) ? "font-semibold text-teal-800" : ""}>{o.text}{it.teacher.correctOptionIds.includes(o.id) ? " ✔" : ""}</li>)}</ul>}
                    {it.kind === "numeric" && <p className="text-xs">Answer: {it.teacher.numericAnswer} {it.unit} (± {it.teacher.tolerance})</p>}
                    {it.teacher.rubric.filter(Boolean).length > 0 && <ul className="ml-4 list-disc text-xs">{it.teacher.rubric.filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}</ul>}
                    <p className="text-xs text-slate-600">Explanation: {it.teacher.rationale}</p>
                  </div>
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </article>
  );
}
