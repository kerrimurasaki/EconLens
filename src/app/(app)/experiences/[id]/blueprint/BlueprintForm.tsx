"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { planStages } from "@/server/generation/stages";
import { DURATIONS, STAGE_LABELS, STAGES, type Blueprint } from "@/schemas/experience";

const field = "rounded-md border border-slate-300 px-3 py-2 text-sm";

export function BlueprintForm({ experienceId, initial, hasDraft }: { experienceId: string; initial: Blueprint; hasDraft: boolean }) {
  const router = useRouter();
  const [bp, setBp] = useState<Blueprint>(initial);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "generating">("idle");
  const plan = planStages(bp.durationMinutes);
  const set = <K extends keyof Blueprint>(k: K, v: Blueprint[K]) => setBp((b) => ({ ...b, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setPhase("saving");
      await api(`/api/experiences/${experienceId}/blueprint`, "PATCH", bp);
      if (hasDraft) {
        router.push(`/experiences/${experienceId}/builder`);
        return;
      }
      setPhase("generating");
      await api(`/api/experiences/${experienceId}/generate`, "POST");
      router.push(`/experiences/${experienceId}/builder`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">Lesson length
          <select className={`${field} w-full`} value={bp.durationMinutes} disabled={hasDraft} onChange={(e) => set("durationMinutes", Number(e.target.value) as Blueprint["durationMinutes"])}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Level
          <select className={`${field} w-full`} value={bp.level} disabled={hasDraft} onChange={(e) => set("level", e.target.value as Blueprint["level"])}>
            <option>Foundation</option><option>Standard</option><option>Stretch</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Class readiness
          <select className={`${field} w-full`} value={bp.readiness} onChange={(e) => set("readiness", e.target.value as Blueprint["readiness"])}>
            <option value="low">Mostly new to economics</option><option value="mixed">Mixed</option><option value="high">Mostly confident</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Academic English
          <select className={`${field} w-full`} value={bp.english} onChange={(e) => set("english", e.target.value as Blueprint["english"])}>
            <option value="developing">Developing (adds sentence starters)</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Mathematics level
          <select className={`${field} w-full`} value={bp.quant} onChange={(e) => set("quant", e.target.value as Blueprint["quant"])}>
            <option value="low">Low (shows formulas)</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Student devices
          <select className={`${field} w-full`} value={bp.devices} onChange={(e) => set("devices", e.target.value as Blueprint["devices"])}>
            <option value="one_per_student">One per student</option><option value="shared">Shared</option><option value="none">None (print)</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Class size
          <input type="number" min={1} max={300} className={`${field} w-full`} value={bp.classSize} onChange={(e) => set("classSize", Math.min(300, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
      </div>
      <fieldset className="space-y-1 text-sm">
        <legend className="font-medium">Optional activities</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={bp.includeDebate} onChange={(e) => set("includeDebate", e.target.checked)} /> Stakeholder debate</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={bp.includeWorksheet} onChange={(e) => set("includeWorksheet", e.target.checked)} /> Guided worksheet</label>
        <p className="text-xs text-slate-600">A branching scenario, evidence review, concept explainers and an independent exit ticket are always included.</p>
      </fieldset>
      <p className="rounded-md bg-slate-100 p-3 text-xs text-slate-700">
        Data in the lesson is synthetic teaching data and is labelled as such. Real, sourced datasets need a data integration that is not available yet.
        {hasDraft && " Length and level are fixed once a draft exists; edit blocks in the builder instead."}
      </p>

      <section aria-labelledby="pace">
        <h2 id="pace" className="text-sm font-semibold text-navy-900">Time by stage ({bp.durationMinutes} min)</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {STAGES.map((s) => (
            <li key={s} className="flex justify-between rounded bg-navy-50 px-3 py-1.5"><span>{STAGE_LABELS[s]}</span><span className="font-medium">{plan[s]} min</span></li>
          ))}
        </ul>
      </section>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
          {phase === "saving" ? "Saving…" : phase === "generating" ? "Generating your lesson…" : hasDraft ? "Save blueprint and open builder" : "Approve blueprint and generate lesson"}
        </button>
        {hasDraft && <Link className="text-sm underline" href={`/experiences/${experienceId}/builder`}>Open builder</Link>}
      </div>
    </form>
  );
}
