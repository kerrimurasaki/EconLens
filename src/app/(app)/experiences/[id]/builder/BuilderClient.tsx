"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { ADDABLE_TYPES, blankBlock, blankItem, TYPE_LABELS } from "@/lib/blocks";
import { STAGE_LABELS, STAGES, type Block, type BlockType, type ExperienceDocument, type Item, type Stage, type ValidationResult } from "@/schemas/experience";
import { ItemEditor } from "./ItemEditor";
import { ScenarioEditor } from "./ScenarioEditor";

interface Props {
  experienceId: string;
  initialDoc: ExperienceDocument;
  initialVersion: number;
  initialValidation: ValidationResult;
  history: Array<{ versionNumber: number; createdAt: string }>;
  objectives: Array<{ id: string; code: string; title: string }>;
  sources: Array<{ id: string; title: string }>;
  demo: boolean;
}

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

/** Debounced autosave with optimistic-concurrency (baseVersion). Plain class so no refs are touched during render. */
class Autosaver {
  dirty = false;
  conflict = false;
  private doc: ExperienceDocument;
  private saving: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly experienceId: string,
    doc: ExperienceDocument,
    public version: number,
    private readonly cb: { state: (s: SaveState) => void; saved: (r: { version: number; validation: ValidationResult }) => void; error: (m: string) => void },
  ) {
    this.doc = doc;
  }
  edit(doc: ExperienceDocument) {
    this.doc = doc;
    this.dirty = true;
    this.cb.state(this.conflict ? "conflict" : "dirty");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), 1200);
  }
  /** Replace local state with a server-provided document (after regenerate/restore). */
  reset(doc: ExperienceDocument, version: number) {
    this.doc = doc;
    this.version = version;
    this.dirty = false;
    this.cb.state("saved");
  }
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    await this.save();
    if (this.dirty) throw new Error("Your latest changes could not be saved yet.");
  }
  async save(): Promise<void> {
    if (this.saving) await this.saving;
    if (!this.dirty || this.conflict) return;
    this.dirty = false;
    this.cb.state("saving");
    const run = (async () => {
      try {
        const res = await api<{ version: number; validation: ValidationResult }>(`/api/experiences/${this.experienceId}/draft`, "PUT", { baseVersion: this.version, doc: this.doc });
        this.version = res.version;
        this.cb.saved(res);
        this.cb.state(this.dirty ? "dirty" : "saved");
      } catch (e) {
        this.dirty = true;
        if (e instanceof ApiError && e.code === "CONFLICT") { this.conflict = true; this.cb.state("conflict"); }
        else { this.cb.state("error"); this.cb.error(e instanceof Error ? e.message : "Could not save."); }
      }
    })();
    this.saving = run;
    await run;
    this.saving = null;
    if (this.dirty && !this.conflict) this.timer = setTimeout(() => void this.save(), 1200);
  }
  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function BuilderClient({ experienceId, initialDoc, initialVersion, initialValidation, history: initialHistory, objectives, sources, demo }: Props) {
  const [doc, setDoc] = useState(initialDoc);
  const [version, setVersion] = useState(initialVersion);
  const [validation, setValidation] = useState(initialValidation);
  const [history, setHistory] = useState(initialHistory);
  const [selectedId, setSelectedId] = useState(initialDoc.blocks[0]?.id ?? "");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [addType, setAddType] = useState<BlockType>("QUESTION");
  const [addStage, setAddStage] = useState<Stage>("MODEL");

  const [saver] = useState(() => new Autosaver(experienceId, initialDoc, initialVersion, {
    state: (st) => setSaveState(st),
    saved: (r) => {
      setVersion(r.version);
      setValidation(r.validation);
      setHistory((h) => [{ versionNumber: r.version, createdAt: new Date().toISOString() }, ...h].slice(0, 30));
    },
    error: (m) => setMessage(m),
  }));

  const selected = doc.blocks.find((b) => b.id === selectedId) ?? null;
  const total = doc.blocks.reduce((a, b) => a + b.minutes, 0);

  const update = (fn: (d: ExperienceDocument) => ExperienceDocument) => {
    const next = fn(doc);
    setDoc(next);
    saver.edit(next);
  };

  useEffect(() => () => saver.dispose(), [saver]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saver.dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saver]);

  const patchBlock = (id: string, patch: Partial<Block>) => update((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  function move(id: string, dir: -1 | 1) {
    update((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.blocks.length || d.blocks[j]!.stage !== d.blocks[i]!.stage) return d;
      const blocks = [...d.blocks];
      [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
      return { ...d, blocks };
    });
  }
  function remove(b: Block) {
    if (!window.confirm(`Delete "${b.title}"? You can restore an earlier version from history.`)) return;
    update((d) => ({ ...d, blocks: d.blocks.filter((x) => x.id !== b.id) }));
    setSelectedId(doc.blocks.find((x) => x.id !== b.id)?.id ?? "");
  }
  function addBlock() {
    const b = blankBlock(addType, addStage, doc.objectiveIds[0] ?? "");
    update((d) => {
      const lastOfStage = d.blocks.map((x) => x.stage).lastIndexOf(addStage);
      const at = lastOfStage >= 0 ? lastOfStage + 1 : d.blocks.length;
      const blocks = [...d.blocks];
      blocks.splice(at, 0, b);
      return { ...d, blocks };
    });
    setSelectedId(b.id);
  }

  async function regenerate(b: Block, confirm = false) {
    setBusy(true);
    setMessage(null);
    try {
      await saver.flush();
      const res = await api<{ version: number; validation: ValidationResult; doc: ExperienceDocument }>(`/api/experiences/${experienceId}/blocks/${b.id}/regenerate`, "POST", {
        baseVersion: saver.version, instruction: instruction.trim() || undefined, confirmOverwrite: confirm,
      });
      saver.reset(res.doc, res.version); setVersion(res.version); setValidation(res.validation); setDoc(res.doc);
      setHistory((h) => [{ versionNumber: res.version, createdAt: new Date().toISOString() }, ...h].slice(0, 30));
      setMessage(`Regenerated "${b.title}". Other blocks were not changed. Use history to undo.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFIRMATION_REQUIRED") {
        if (window.confirm(`${e.message}`)) { await regenerate(b, true); return; }
      } else if (e instanceof ApiError && e.code === "CONFLICT") { saver.conflict = true; setSaveState("conflict"); }
      else setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(n: number) {
    if (!window.confirm(`Restore version ${n}? Your current draft stays in history.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await saver.flush();
      const res = await api<{ version: number; validation: ValidationResult; doc: ExperienceDocument }>(`/api/experiences/${experienceId}/restore`, "POST", { baseVersion: saver.version, versionNumber: n });
      saver.reset(res.doc, res.version); setVersion(res.version); setValidation(res.validation); setDoc(res.doc);
      setSelectedId(res.doc.blocks[0]?.id ?? "");
      setHistory((h) => [{ versionNumber: res.version, createdAt: new Date().toISOString() }, ...h].slice(0, 30));
      setMessage(`Restored version ${n} as version ${res.version}.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT") { saver.conflict = true; setSaveState("conflict"); }
      else setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      await saver.flush();
      const res = await api<{ validation: ValidationResult }>(`/api/experiences/${experienceId}/validate`, "POST");
      setValidation(res.validation);
      setMessage(res.validation.passed ? "Quality check passed: no blocking issues." : `${res.validation.blocking.length} blocking issue(s) to fix before publishing.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const issuesFor = (id: string) => [...validation.blocking, ...validation.warnings].filter((i) => i.blockId === id);
  const stateText: Record<SaveState, string> = { saved: `Saved (version ${version})`, dirty: "Unsaved changes…", saving: "Saving…", error: "Save failed. Retrying on next edit.", conflict: "Changed elsewhere" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="status" aria-live="polite" className={`text-sm ${saveState === "error" || saveState === "conflict" ? "text-red-700" : "text-slate-600"}`}>{stateText[saveState]}</div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={check} disabled={busy} className="rounded-md border border-slate-300 bg-white px-3 py-1.5">Check quality</button>
          <Link href={`/experiences/${experienceId}/preview`} className="rounded-md border border-slate-300 bg-white px-3 py-1.5">Preview</Link>
          <Link href={`/experiences/${experienceId}/print?view=teacher`} target="_blank" className="rounded-md border border-slate-300 bg-white px-3 py-1.5">Print teacher guide</Link>
          <Link href={`/experiences/${experienceId}/print?view=student`} target="_blank" className="rounded-md border border-slate-300 bg-white px-3 py-1.5">Print worksheet</Link>
          <a href={`/api/experiences/${experienceId}/export`} className="rounded-md border border-slate-300 bg-white px-3 py-1.5">Download JSON</a>
        </div>
      </div>
      {saveState === "conflict" && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          This experience was changed in another tab or session, so your latest edits were not saved. <button className="underline" onClick={() => window.location.reload()}>Reload the latest version</button>.
        </div>
      )}
      {demo && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"><strong>Demo mode.</strong> This lesson was assembled from built-in templates and your selections, not written by an AI model. Review every block.</div>}
      {message && <p role="status" className="rounded-md bg-teal-50 p-2 text-sm text-teal-900">{message}</p>}

      <div className={`rounded-md p-3 text-sm ${validation.passed ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-900"}`}>
        <p className="font-medium">
          {validation.passed ? "No blocking issues." : `${validation.blocking.length} blocking issue(s) must be fixed before publishing.`} {validation.warnings.length} warning(s). {total}/{doc.durationMinutes} min planned ·{" "}
          {validation.stats.formativeItems} formative and {validation.stats.independentItems} independent questions.
        </p>
        {(validation.blocking.length > 0 || validation.warnings.length > 0) && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs underline">Show issues</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {[...validation.blocking, ...validation.warnings].map((i, n) => (
                <li key={n}>
                  <span className="font-medium">{i.severity === "blocking" ? "Blocking: " : "Warning: "}</span>{i.message}
                  {i.blockId && <> <button type="button" className="underline" onClick={() => setSelectedId(i.blockId!)}>Go to block</button></>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)_290px]">
        {/* Outline */}
        <nav aria-label="Lesson outline" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          {STAGES.map((s) => {
            const blocks = doc.blocks.filter((b) => b.stage === s);
            return (
              <div key={s}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{STAGE_LABELS[s]} · {blocks.reduce((a, b) => a + b.minutes, 0)} min</h2>
                {blocks.length === 0 && <p className="text-xs text-red-700">No blocks in this stage.</p>}
                <ul className="mt-1 space-y-1">
                  {blocks.map((b) => {
                    const idx = doc.blocks.findIndex((x) => x.id === b.id);
                    const iss = issuesFor(b.id);
                    const hasBlocking = iss.some((i) => i.severity === "blocking");
                    return (
                      <li key={b.id} className={`flex items-center gap-1 rounded-md ${b.id === selectedId ? "bg-navy-50 ring-1 ring-navy-600" : ""}`}>
                        <button type="button" onClick={() => setSelectedId(b.id)} aria-current={b.id === selectedId} className="flex-1 truncate px-2 py-1.5 text-left text-sm">
                          {b.title} <span className="text-xs text-slate-600">{b.minutes}m</span>
                          {iss.length > 0 && <span className={`ml-1 text-xs ${hasBlocking ? "text-red-700" : "text-amber-700"}`} aria-label={`${iss.length} issue(s)`}>●{iss.length}</span>}
                        </button>
                        <button type="button" aria-label={`Move ${b.title} up`} disabled={idx === 0 || doc.blocks[idx - 1]!.stage !== b.stage} onClick={() => move(b.id, -1)} className="h-7 w-7 shrink-0 rounded hover:bg-slate-100 disabled:opacity-30">↑</button>
                        <button type="button" aria-label={`Move ${b.title} down`} disabled={idx === doc.blocks.length - 1 || doc.blocks[idx + 1]!.stage !== b.stage} onClick={() => move(b.id, 1)} className="h-7 w-7 shrink-0 rounded hover:bg-slate-100 disabled:opacity-30">↓</button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <fieldset className="space-y-1 border-t pt-2">
            <legend className="text-xs font-semibold text-slate-500">Add a block</legend>
            <label className="sr-only" htmlFor="add-stage">Stage</label>
            <select id="add-stage" className={input} value={addStage} onChange={(e) => setAddStage(e.target.value as Stage)}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}</select>
            <label className="sr-only" htmlFor="add-type">Block type</label>
            <select id="add-type" className={input} value={addType} onChange={(e) => setAddType(e.target.value as BlockType)}>{ADDABLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select>
            <button type="button" onClick={addBlock} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">Add block</button>
          </fieldset>
        </nav>

        {/* Canvas */}
        <section aria-label="Block editor" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          {!selected ? (
            <p className="text-sm text-slate-600">Select a block from the outline.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">{STAGE_LABELS[selected.stage]} · {TYPE_LABELS[selected.type]}{selected.edited ? " · edited by you" : ""}</p>
                <button type="button" onClick={() => remove(selected)} className="text-xs text-red-700 underline">Delete block</button>
              </div>
              <label className="block text-sm font-medium">Title
                <input className={input} maxLength={200} value={selected.title} onChange={(e) => patchBlock(selected.id, { title: e.target.value })} />
              </label>
              <label className="block text-sm font-medium">Student-facing text (plain text; blank line = new paragraph)
                <textarea className={`${input} font-normal`} rows={9} maxLength={6000} value={selected.body} onChange={(e) => patchBlock(selected.id, { body: e.target.value })} />
              </label>

              {selected.table && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Data table <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">{selected.table.label}</span></h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="py-1 text-left text-xs text-slate-600">{selected.table.caption}</caption>
                      <thead><tr>{selected.table.columns.map((c) => <th key={c} scope="col" className="border-b px-2 py-1 text-left">{c}</th>)}</tr></thead>
                      <tbody>{selected.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b px-2 py-1">{c}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500">Generated data is read-only here. Regenerate the block for a different dataset.</p>
                </div>
              )}

              {selected.scenario && <ScenarioEditor scenario={selected.scenario} onChange={(next) => patchBlock(selected.id, { scenario: next })} />}

              {selected.claims.length > 0 && (
                <div className="text-sm">
                  <h3 className="font-semibold">Claims shown to students</h3>
                  <ul className="list-disc pl-5 text-xs text-slate-700">{selected.claims.map((c, i) => <li key={i}>[{c.status.replace("_", " ")}] {c.text}</li>)}</ul>
                  <p className="text-xs text-slate-500">Change claim status on the Sources page; it will not be upgraded here.</p>
                </div>
              )}

              {["QUIZ", "EXIT_TICKET", "WORKSHEET", "DATA_EXPLORER", "QUESTION", "EXPLAINER", "BRIEFING", "DEBATE", "REFLECTION"].includes(selected.type) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Questions ({selected.items.length})</h3>
                  <ul className="space-y-3">
                    {selected.items.map((it, n) => (
                      <ItemEditor
                        key={it.id} item={it} index={n} objectives={objectives}
                        onChange={(next) => patchBlock(selected.id, { items: selected.items.map((x) => (x.id === it.id ? next : x)) })}
                        onDelete={() => patchBlock(selected.id, { items: selected.items.filter((x) => x.id !== it.id) })}
                      />
                    ))}
                  </ul>
                  <button type="button" onClick={() => patchBlock(selected.id, { items: [...selected.items, blankItem(selected.objectiveIds[0] ?? doc.objectiveIds[0] ?? "", selected.type === "EXIT_TICKET") as Item] })} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Add question</button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Inspector */}
        <aside aria-label="Inspector" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          {selected && (
            <>
              <label className="block font-medium">Minutes
                <input type="number" min={1} max={120} className={input} value={selected.minutes} onChange={(e) => patchBlock(selected.id, { minutes: Math.min(120, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
              </label>
              <fieldset>
                <legend className="font-medium">Learning objectives</legend>
                {objectives.map((o) => (
                  <label key={o.id} className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5" checked={selected.objectiveIds.includes(o.id)} onChange={(e) => patchBlock(selected.id, { objectiveIds: e.target.checked ? [...selected.objectiveIds, o.id] : selected.objectiveIds.filter((x) => x !== o.id) })} />
                    <span><span className="font-medium">{o.code}</span> {o.title}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend className="font-medium">Provenance (sources)</legend>
                {sources.map((s) => (
                  <label key={s.id} className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5" checked={selected.sourceIds.includes(s.id)} onChange={(e) => patchBlock(selected.id, { sourceIds: e.target.checked ? [...selected.sourceIds, s.id] : selected.sourceIds.filter((x) => x !== s.id) })} />
                    <span>{s.title}</span>
                  </label>
                ))}
              </fieldset>
              <label className="block font-medium">Teacher notes (hidden from students)
                <textarea className={`${input} font-normal`} rows={6} maxLength={4000} value={selected.teacherNotes} onChange={(e) => patchBlock(selected.id, { teacherNotes: e.target.value })} />
              </label>
              <div className="space-y-1 border-t pt-3">
                <label className="block font-medium" htmlFor="regen-note">Regenerate this block only</label>
                <input id="regen-note" className={input} maxLength={500} placeholder="Optional focus, e.g. make it easier" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                <button type="button" disabled={busy} onClick={() => regenerate(selected)} className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-white disabled:opacity-60">{busy ? "Working…" : "Regenerate block"}</button>
                <p className="text-xs text-slate-500">Other blocks stay as they are. If this block has your edits you will be asked to confirm.</p>
              </div>
            </>
          )}
          <div className="space-y-1 border-t pt-3">
            <h3 className="font-medium">Version history</h3>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {history.map((h) => (
                <li key={h.versionNumber} className="flex items-center justify-between gap-2">
                  <span>v{h.versionNumber}{h.versionNumber === version ? " (current)" : ""} · {new Date(h.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                  {h.versionNumber !== version && <button type="button" disabled={busy} className="underline" onClick={() => restore(h.versionNumber)}>Restore</button>}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
