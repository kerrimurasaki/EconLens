"use client";

import type { Scenario } from "@/schemas/experience";

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

/** Lets a teacher edit the stylised parameters and effects of the branching scenario. All values stay labelled hypothetical. */
export function ScenarioEditor({ scenario, onChange }: { scenario: Scenario; onChange: (next: Scenario) => void }) {
  const setParam = (id: string, patch: Partial<Scenario["parameters"][number]>) =>
    onChange({ ...scenario, parameters: scenario.parameters.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setOption = (di: number, oi: number, patch: Partial<Scenario["decisions"][number]["options"][number]>) =>
    onChange({
      ...scenario,
      decisions: scenario.decisions.map((d, i) => (i !== di ? d : { ...d, options: d.options.map((o, j) => (j !== oi ? o : { ...o, ...patch })) })),
    });
  const delta = (di: number, oi: number, pid: string) => scenario.decisions[di]!.options[oi]!.effects.find((e) => e.parameterId === pid)?.delta ?? 0;
  const setDelta = (di: number, oi: number, pid: string, value: number) => {
    const rest = scenario.decisions[di]!.options[oi]!.effects.filter((e) => e.parameterId !== pid);
    setOption(di, oi, { effects: value === 0 ? rest : [...rest, { parameterId: pid, delta: value }] });
  };

  return (
    <div className="space-y-4 rounded-md bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">Scenario: stylised model (hypothetical)</h3>
      <label className="block text-xs font-medium">Hypothetical label (shown to students; must say hypothetical or stylised)
        <input className={input} maxLength={300} value={scenario.hypotheticalLabel} onChange={(e) => onChange({ ...scenario, hypotheticalLabel: e.target.value })} />
      </label>
      <label className="block text-xs font-medium">Premise
        <textarea className={input} rows={3} maxLength={2000} value={scenario.premise} onChange={(e) => onChange({ ...scenario, premise: e.target.value })} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold">Parameters (start values)</legend>
        {scenario.parameters.map((p) => (
          <div key={p.id} className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Label<input className={input} maxLength={100} value={p.label} onChange={(e) => setParam(p.id, { label: e.target.value })} /></label>
            <label className="text-xs">Start value<input className={input} type="number" step="any" value={p.start} onChange={(e) => setParam(p.id, { start: Number(e.target.value) || 0 })} /></label>
            <label className="text-xs">Unit<input className={input} maxLength={40} value={p.unit} onChange={(e) => setParam(p.id, { unit: e.target.value })} /></label>
          </div>
        ))}
      </fieldset>

      {scenario.decisions.map((d, di) => (
        <fieldset key={d.id} className="space-y-2 rounded border border-slate-200 bg-white p-2">
          <legend className="px-1 text-xs font-semibold">Decision {di + 1}</legend>
          <label className="block text-xs">Prompt<input className={input} maxLength={600} value={d.prompt} onChange={(e) => onChange({ ...scenario, decisions: scenario.decisions.map((x, i) => (i === di ? { ...x, prompt: e.target.value } : x)) })} /></label>
          {d.options.map((o, oi) => (
            <div key={o.id} className="space-y-1 rounded bg-slate-50 p-2">
              <label className="block text-xs">Option {oi + 1} label<input className={input} maxLength={300} value={o.label} onChange={(e) => setOption(di, oi, { label: e.target.value })} /></label>
              <label className="block text-xs">Explanation shown after choosing<textarea className={input} rows={2} maxLength={800} value={o.explanation} onChange={(e) => setOption(di, oi, { explanation: e.target.value })} /></label>
              <div className="grid gap-2 sm:grid-cols-2">
                {scenario.parameters.map((p) => (
                  <label key={p.id} className="text-xs">Effect on {p.label}<input className={input} type="number" step="any" value={delta(di, oi, p.id)} onChange={(e) => setDelta(di, oi, p.id, Number(e.target.value) || 0)} /></label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      ))}

      <label className="block text-xs font-medium">Rules shown to students
        <textarea className={input} rows={2} maxLength={1500} value={scenario.rules} onChange={(e) => onChange({ ...scenario, rules: e.target.value })} />
      </label>
      <label className="block text-xs font-medium">Debrief (shown only after all decisions are made)
        <textarea className={input} rows={3} maxLength={2500} value={scenario.debrief} onChange={(e) => onChange({ ...scenario, debrief: e.target.value })} />
      </label>
    </div>
  );
}
