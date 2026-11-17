"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Lens {
  key: string; name: string; score: number; mechanism: string; prerequisites: string[]; misconceptions: string[];
  limitations: string[]; inquiryQuestion: string; alternativeLens: string; selected: boolean;
}
interface Props {
  experienceId: string;
  lenses: Lens[];
  objectives: Array<{ id: string; code: string; title: string }>;
  initialQuestion: string;
  initialObjectiveIds: string[];
  approved: boolean;
}

export function LensPicker({ experienceId, lenses, objectives, initialQuestion, initialObjectiveIds, approved }: Props) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(lenses.filter((l) => l.selected).map((l) => l.key));
  const [question, setQuestion] = useState(initialQuestion);
  const [objectiveIds, setObjectiveIds] = useState<string[]>(initialObjectiveIds);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(approved);
  const [pending, setPending] = useState(false);

  function toggle(key: string) {
    setSaved(false);
    setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : c.length >= 3 ? c : [...c, key]));
  }
  function suggestQuestion(key: string) {
    const l = lenses.find((x) => x.key === key);
    if (l?.inquiryQuestion && !question) setQuestion(l.inquiryQuestion);
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/experiences/${experienceId}/concepts`, "PATCH", { conceptKeys: chosen, inquiryQuestion: question, objectiveIds });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {lenses.map((l, i) => {
          const checked = chosen.includes(l.key);
          const atLimit = chosen.length >= 3 && !checked;
          return (
            <li key={l.key} className={`rounded-xl border bg-white p-4 ${checked ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200"}`}>
              <div className="flex items-start gap-3">
                <input
                  id={`lens-${l.key}`}
                  type="checkbox"
                  checked={checked}
                  disabled={atLimit}
                  onChange={() => { toggle(l.key); if (!checked) suggestQuestion(l.key); }}
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1 space-y-2 text-sm">
                  <label htmlFor={`lens-${l.key}`} className="flex flex-wrap items-baseline gap-2 font-semibold text-navy-900">
                    #{i + 1} {l.name}
                    <span className="text-xs font-normal text-slate-600">relevance {Math.round(l.score * 100)}%</span>
                  </label>
                  <p><span className="font-medium">How it applies: </span>{l.mechanism}</p>
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-teal-700">Prerequisites, misconceptions, cautions, alternative lens</summary>
                    <div className="mt-2 space-y-1 text-slate-700">
                      {l.prerequisites.length > 0 && <p><span className="font-medium">Prerequisites: </span>{l.prerequisites.join("; ")}</p>}
                      {l.misconceptions.length > 0 && <p><span className="font-medium">Common misconceptions: </span>{l.misconceptions.join("; ")}</p>}
                      {l.limitations.length > 0 && <p><span className="font-medium">Cautions: </span>{l.limitations.join("; ")}</p>}
                      {l.alternativeLens && <p><span className="font-medium">Alternative lens: </span>{l.alternativeLens}</p>}
                      {l.inquiryQuestion && <p><span className="font-medium">Sample inquiry question: </span>{l.inquiryQuestion}</p>}
                    </div>
                  </details>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="space-y-1">
          <label htmlFor="q" className="text-sm font-medium">Central inquiry question</label>
          <textarea
            id="q" value={question} rows={2} maxLength={400}
            onChange={(e) => { setQuestion(e.target.value); setSaved(false); }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Learning objectives (choose 1 to 6)</legend>
          {objectives.length === 0 && <p className="text-sm text-slate-600">No objectives are set up for your institution yet.</p>}
          {objectives.map((o) => (
            <label key={o.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={objectiveIds.includes(o.id)}
                onChange={(e) => { setSaved(false); setObjectiveIds((cur) => e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id)); }}
                className="mt-1"
              />
              <span><span className="font-medium">{o.code}</span> {o.title}</span>
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button" onClick={save}
            disabled={pending || chosen.length === 0 || question.trim().length < 10 || objectiveIds.length === 0}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Confirm lenses and objectives"}
          </button>
          <span className="text-xs text-slate-600">{chosen.length}/3 selected</span>
          {saved && <span role="status" className="text-sm text-teal-700">Saved. <Link className="font-medium underline" href={`/experiences/${experienceId}/blueprint`}>Continue to blueprint</Link></span>}
        </div>
      </section>
    </div>
  );
}
