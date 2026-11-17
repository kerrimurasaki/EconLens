"use client";

import type { Item } from "@/schemas/experience";
import { nextOptionId } from "@/lib/blocks";

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

interface Props {
  item: Item;
  index: number;
  objectives: Array<{ id: string; code: string }>;
  onChange: (next: Item) => void;
  onDelete: () => void;
}

export function ItemEditor({ item, index, objectives, onChange, onDelete }: Props) {
  const t = item.teacher;
  const setTeacher = (patch: Partial<Item["teacher"]>) => onChange({ ...item, teacher: { ...t, ...patch } });
  const toggleCorrect = (id: string) => {
    if (item.kind === "multi") setTeacher({ correctOptionIds: t.correctOptionIds.includes(id) ? t.correctOptionIds.filter((x) => x !== id) : [...t.correctOptionIds, id] });
    else setTeacher({ correctOptionIds: [id] });
  };
  const hasOptions = item.kind === "mcq" || item.kind === "multi";
  const n = index + 1;

  return (
    <li className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-navy-900">Question {n} {item.independent && <span className="ml-1 rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700">independent</span>}</h4>
        <button type="button" onClick={onDelete} className="text-xs text-red-700 underline">Delete question {n}</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-medium">Type
          <select className={input} value={item.kind} onChange={(e) => {
            const kind = e.target.value as Item["kind"];
            onChange({ ...item, kind, unit: kind === "numeric" ? (item.unit ?? "") : null, options: kind === "mcq" || kind === "multi" ? (item.options.length ? item.options : [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }]) : [], teacher: { ...t, correctOptionIds: [] } });
          }}>
            <option value="mcq">Multiple choice (one answer)</option><option value="multi">Multiple select</option><option value="numeric">Numeric</option><option value="short">Short answer (teacher marked)</option>
          </select>
        </label>
        <label className="text-xs font-medium">Objective
          <select className={input} value={item.objectiveId} onChange={(e) => onChange({ ...item, objectiveId: e.target.value })}>
            {objectives.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-1.5 text-xs font-medium">
          <input type="checkbox" checked={item.independent} onChange={(e) => onChange({ ...item, independent: e.target.checked })} /> Independent check
        </label>
      </div>
      <label className="block text-xs font-medium">Question text
        <textarea className={input} rows={2} maxLength={1500} value={item.prompt} onChange={(e) => onChange({ ...item, prompt: e.target.value })} />
      </label>

      {hasOptions && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium">Options (tick the correct {item.kind === "multi" ? "answers" : "answer"})</legend>
          {item.options.map((o, oi) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type={item.kind === "multi" ? "checkbox" : "radio"} name={`correct-${item.id}`} checked={t.correctOptionIds.includes(o.id)}
                onChange={() => toggleCorrect(o.id)} aria-label={`Option ${oi + 1} is correct`}
              />
              <input className={input} maxLength={600} aria-label={`Option ${oi + 1} text`} value={o.text} onChange={(e) => onChange({ ...item, options: item.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
              <button
                type="button" disabled={item.options.length <= 2} aria-label={`Remove option ${oi + 1}`} className="text-xs text-red-700 underline disabled:opacity-40"
                onClick={() => onChange({ ...item, options: item.options.filter((x) => x.id !== o.id), teacher: { ...t, correctOptionIds: t.correctOptionIds.filter((x) => x !== o.id) } })}
              >Remove</button>
            </div>
          ))}
          <button type="button" disabled={item.options.length >= 8} className="text-xs underline" onClick={() => onChange({ ...item, options: [...item.options, { id: nextOptionId(item.options.map((x) => x.id)), text: "" }] })}>Add option</button>
        </fieldset>
      )}

      {item.kind === "numeric" && (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-medium">Correct answer
            <input className={input} type="number" step="any" value={t.numericAnswer ?? ""} onChange={(e) => setTeacher({ numericAnswer: e.target.value === "" ? null : Number(e.target.value), computation: null })} />
          </label>
          <label className="text-xs font-medium">Tolerance (±)
            <input className={input} type="number" step="any" min={0} value={t.tolerance ?? ""} onChange={(e) => setTeacher({ tolerance: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
          <label className="text-xs font-medium">Unit
            <input className={input} maxLength={20} value={item.unit ?? ""} onChange={(e) => onChange({ ...item, unit: e.target.value })} />
          </label>
        </div>
      )}
      {item.kind === "short" && (
        <label className="block text-xs font-medium">Marking rubric (one point per line)
          <textarea className={input} rows={4} value={t.rubric.join("\n")} onChange={(e) => setTeacher({ rubric: e.target.value.split("\n") })} />
        </label>
      )}
      <label className="block text-xs font-medium">Teacher explanation (never shown to students before feedback)
        <textarea className={input} rows={2} maxLength={2000} value={t.rationale} onChange={(e) => setTeacher({ rationale: e.target.value })} />
      </label>
    </li>
  );
}
