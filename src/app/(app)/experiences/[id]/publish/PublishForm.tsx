"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function PublishForm({ experienceId, blocked, classes }: { experienceId: string; blocked: boolean; classes: Array<{ id: string; name: string; students: number }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ joinCode: string; version: number } | null>(null);

  if (classes.length === 0) {
    return <p className="rounded-md bg-slate-100 p-4 text-sm">Create a class first. <Link className="underline" href="/classes">Go to classes</Link></p>;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const due = String(f.get("dueAt") ?? "");
    if (!window.confirm("Publish this version to the selected class? Students will be able to open it.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ joinCode: string; version: number }>(`/api/experiences/${experienceId}/publish`, "POST", {
        classId: String(f.get("classId")), dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null, feedbackMode: String(f.get("feedbackMode")),
      });
      setDone(r);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <label className="block text-sm font-medium">Class
        <select name="classId" required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.students} students)</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Due date (optional)<input type="date" name="dueAt" className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
      <fieldset className="space-y-1 text-sm">
        <legend className="font-medium">Answers and explanations</legend>
        <label className="flex items-center gap-2"><input type="radio" name="feedbackMode" value="after_submit" defaultChecked /> Show after each student submits the independent check</label>
        <label className="flex items-center gap-2"><input type="radio" name="feedbackMode" value="manual" /> Hold until I release them</label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {done && <p role="status" className="rounded-md bg-teal-50 p-3 text-sm text-teal-900">Published version {done.version}. Students join at <span className="font-mono">/join/{done.joinCode}</span> or enter code <span className="font-mono font-semibold">{done.joinCode}</span> on their activities page.</p>}
      <button type="submit" disabled={busy || blocked} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Publishing…" : "Publish to class"}</button>
      {blocked && <p className="text-xs text-red-700">Publishing is disabled until the quality check has no blocking issues.</p>}
    </form>
  );
}
