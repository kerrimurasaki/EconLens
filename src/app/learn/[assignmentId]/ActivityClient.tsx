"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { STAGE_LABELS, STAGES } from "@/schemas/experience";
import type { StudentDocument, StudentItem, StudentScenario } from "@/server/generation/studentView";

type Resp = { optionIds?: string[]; value?: number; text?: string };
interface ScenarioStateView { values: Record<string, number>; steps: Array<{ decisionId: string; optionId: string; label: string; explanation: string }>; complete: boolean; debrief: string | null }

interface Props {
  assignmentId: string;
  scope: "learn" | "check";
  doc: StudentDocument;
  attemptId: string | null;
  submitted: boolean;
  responses: Record<string, unknown>;
  scenarios: Record<string, ScenarioStateView>;
}

const STATUS_LABEL: Record<string, string> = {
  verified: "checked against a source", teacher_provided: "teacher-provided, not independently verified", disputed: "disputed", hypothetical: "hypothetical", unverified: "unverified",
};

export function ActivityClient({ assignmentId, scope, doc, attemptId, submitted, responses, scenarios }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Resp>>(responses as Record<string, Resp>);
  const [saveState, setSaveState] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const locked = submitted;

  useEffect(() => { const t = timers.current; return () => Object.values(t).forEach(clearTimeout); }, []);

  async function persist(itemId: string, response: Resp) {
    if (!attemptId) return;
    setSaveState((s) => ({ ...s, [itemId]: "saving" }));
    try {
      await api(`/api/attempts/${attemptId}/responses`, "POST", { itemId, response });
      setSaveState((s) => ({ ...s, [itemId]: "saved" }));
    } catch (e) {
      setSaveState((s) => ({ ...s, [itemId]: "error" }));
      setError(e instanceof Error ? e.message : "Could not save your answer.");
    }
  }
  function answer(item: StudentItem, response: Resp, delay = 0) {
    setAnswers((a) => ({ ...a, [item.id]: response }));
    setError(null);
    clearTimeout(timers.current[item.id]);
    if (delay) timers.current[item.id] = setTimeout(() => void persist(item.id, response), delay);
    else void persist(item.id, response);
  }

  async function start() {
    setBusy(true);
    try {
      await api(`/api/assignments/${assignmentId}/attempts`, "POST");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!attemptId) return;
    const items = doc.blocks.flatMap((b) => b.items);
    const missing = items.filter((i) => {
      const a = answers[i.id];
      return !a || (a.optionIds ? a.optionIds.length === 0 : a.value === undefined && !a.text?.trim());
    }).length;
    const msg = missing > 0 ? `You have ${missing} unanswered question(s). Unanswered questions score zero. Submit anyway?` : "Submit your independent check? You cannot change your answers afterwards.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await Promise.all(Object.keys(timers.current).map(async (id) => { clearTimeout(timers.current[id]); const a = answers[id]; if (a) await persist(id, a); }));
      await api(`/api/attempts/${attemptId}/submit`, "POST");
      router.push(`/learn/${assignmentId}/feedback`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit.");
      setBusy(false);
    }
  }

  if (!attemptId) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-navy-900">{scope === "check" ? "Independent check" : doc.title}</h2>
        <p className="text-sm text-slate-700">{scope === "check" ? "Start the activity first." : `${doc.durationMinutes} minutes. Your answers are saved as you go.`}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {scope === "learn" && <button type="button" onClick={start} disabled={busy} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? "Starting…" : "Start activity"}</button>}
        {scope === "check" && <Link className="underline" href={`/learn/${assignmentId}`}>Go to the activity</Link>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {scope === "learn" && (
        <header className="space-y-2">
          <h2 className="text-xl font-semibold text-navy-900">{doc.title}</h2>
          <p className="rounded-md bg-teal-50 p-3 text-sm text-teal-900"><span className="font-medium">Essential question: </span>{doc.essentialQuestion}</p>
        </header>
      )}
      {scope === "check" && (
        <header className="space-y-2">
          <h2 className="text-xl font-semibold text-navy-900">Independent check</h2>
          <p className="text-sm text-slate-700">Answer on your own, without notes or help. You will see answers and explanations after you submit.</p>
        </header>
      )}
      {locked && (
        <p role="status" className="rounded-md bg-slate-100 p-3 text-sm">You have submitted this activity. <Link className="underline" href={`/learn/${assignmentId}/feedback`}>See feedback</Link></p>
      )}
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {STAGES.map((s) => {
        const blocks = doc.blocks.filter((b) => b.stage === s);
        if (!blocks.length) return null;
        return (
          <section key={s} aria-labelledby={`st-${s}`} className="space-y-3">
            {scope === "learn" && <h3 id={`st-${s}`} className="text-sm font-semibold uppercase tracking-wide text-slate-500">{STAGE_LABELS[s]}</h3>}
            {blocks.map((b) => (
              <div key={b.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                {scope === "learn" && <h4 className="text-base font-semibold text-navy-900">{b.title} <span className="text-xs font-normal text-slate-500">{b.minutes} min</span></h4>}
                {scope === "learn" && b.body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
                {b.claims.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">{b.claims.map((c, i) => <li key={i}><span className="font-medium">{STATUS_LABEL[c.status] ?? c.status}:</span> {c.text}</li>)}</ul>
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
                {b.scenario && <ScenarioWidget attemptId={attemptId} blockId={b.id} scenario={b.scenario} initial={scenarios[b.id]} disabled={locked} />}
                {b.items.length > 0 && (
                  <ol className="list-decimal space-y-4 pl-5">
                    {b.items.map((it) => (
                      <li key={it.id}>
                        <ItemInput item={it} value={answers[it.id]} disabled={locked} onChange={(r, delay) => answer(it, r, delay)} />
                        <p className="mt-1 text-xs text-slate-500" aria-live="polite">{saveState[it.id] === "saving" ? "Saving…" : saveState[it.id] === "saved" ? "Saved" : saveState[it.id] === "error" ? "Not saved" : ""}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </section>
        );
      })}

      {!locked && scope === "learn" && (
        <Link href={`/learn/${assignmentId}/check`} className="inline-block rounded-md bg-navy-700 px-4 py-2 text-sm font-medium text-white">Continue to the independent check</Link>
      )}
      {!locked && scope === "check" && (
        <button type="button" onClick={submit} disabled={busy} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? "Submitting…" : "Submit independent check"}</button>
      )}
    </div>
  );
}

function ItemInput({ item, value, disabled, onChange }: { item: StudentItem; value: Resp | undefined; disabled: boolean; onChange: (r: Resp, delay?: number) => void }) {
  const name = `q-${item.id}`;
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="font-medium">{item.prompt}{item.kind === "multi" ? " (select all that apply)" : ""}{item.unit ? ` (answer in ${item.unit})` : ""}</legend>
      {(item.kind === "mcq" || item.kind === "multi") && (
        <ul className="space-y-1">
          {item.options.map((o) => {
            const sel = value?.optionIds ?? [];
            const checked = sel.includes(o.id);
            return (
              <li key={o.id}>
                <label className="flex items-start gap-2">
                  <input
                    type={item.kind === "multi" ? "checkbox" : "radio"} name={name} className="mt-1" checked={checked}
                    onChange={() => onChange({ optionIds: item.kind === "multi" ? (checked ? sel.filter((x) => x !== o.id) : [...sel, o.id]) : [o.id] })}
                  />
                  <span>{o.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {item.kind === "numeric" && (
        <input
          type="number" step="any" inputMode="decimal" aria-label="Your answer" className="w-40 rounded border border-slate-300 px-2 py-1" value={value?.value ?? ""}
          onChange={(e) => { if (e.target.value !== "" && Number.isFinite(Number(e.target.value))) onChange({ value: Number(e.target.value) }, 800); }}
        />
      )}
      {item.kind === "short" && (
        <textarea aria-label="Your answer" rows={4} maxLength={3000} className="w-full rounded border border-slate-300 px-2 py-1" value={value?.text ?? ""} onChange={(e) => onChange({ text: e.target.value }, 800)} />
      )}
    </fieldset>
  );
}

function ScenarioWidget({ attemptId, blockId, scenario, initial, disabled }: { attemptId: string; blockId: string; scenario: StudentScenario; initial: ScenarioStateView | undefined; disabled: boolean }) {
  const start = Object.fromEntries(scenario.parameters.map((p) => [p.id, p.start]));
  const [state, setState] = useState<ScenarioStateView>(initial ?? { values: start, steps: [], complete: false, debrief: null });
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decision = scenario.decisions[state.steps.length];

  async function confirm() {
    if (!decision || !pick) return;
    setBusy(true);
    setError(null);
    try {
      setState(await api<ScenarioStateView>(`/api/attempts/${attemptId}/scenario`, "POST", { blockId, decisionId: decision.id, optionId: pick }));
      setPick("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record your choice.");
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      setState(await api<ScenarioStateView>(`/api/attempts/${attemptId}/scenario/reset`, "POST", { blockId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restart.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md bg-slate-50 p-3">
      <p className="text-xs font-medium text-amber-900">{scenario.hypotheticalLabel}</p>
      <p>{scenario.premise}</p>
      <details><summary className="cursor-pointer text-xs font-medium text-teal-700">How the model works</summary><p className="mt-1 text-xs text-slate-700">{scenario.rules}</p></details>
      <table className="w-full text-sm" aria-live="polite">
        <caption className="py-1 text-left text-xs text-slate-600">Current stylised outcomes (not real data)</caption>
        <thead><tr><th scope="col" className="border-b px-2 py-1 text-left">Measure</th><th scope="col" className="border-b px-2 py-1 text-left">Start</th><th scope="col" className="border-b px-2 py-1 text-left">Now</th></tr></thead>
        <tbody>{scenario.parameters.map((p) => <tr key={p.id}><td className="border-b px-2 py-1">{p.label} ({p.unit})</td><td className="border-b px-2 py-1">{p.start}</td><td className="border-b px-2 py-1 font-medium">{state.values[p.id]}</td></tr>)}</tbody>
      </table>
      {state.steps.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-700">
          {state.steps.map((s) => <li key={s.decisionId}><span className="font-medium">You chose: {s.label}.</span> {s.explanation}</li>)}
        </ol>
      )}
      {decision && !disabled && (
        <fieldset className="space-y-1">
          <legend className="font-medium">{decision.prompt}</legend>
          {decision.options.map((o) => (
            <label key={o.id} className="flex items-start gap-2"><input type="radio" name={`${blockId}-${decision.id}`} className="mt-1" checked={pick === o.id} onChange={() => setPick(o.id)} /> <span>{o.label}</span></label>
          ))}
          <button type="button" onClick={confirm} disabled={!pick || busy} className="mt-1 rounded-md bg-navy-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Confirm choice</button>
        </fieldset>
      )}
      {state.complete && state.debrief && (
        <div className="space-y-2 rounded-md bg-teal-50 p-3 text-teal-900"><p className="font-medium">Debrief</p><p>{state.debrief}</p>
          {!disabled && <button type="button" onClick={reset} disabled={busy} className="rounded-md border border-teal-700 px-3 py-1 text-xs">Try different choices</button>}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
