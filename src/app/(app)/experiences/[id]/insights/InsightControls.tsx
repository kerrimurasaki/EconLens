"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function ReleaseFeedbackButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function release() {
    if (!window.confirm("Release answers and explanations to students who have submitted?")) return;
    setBusy(true);
    try {
      await api(`/api/assignments/${assignmentId}/release-feedback`, "POST");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" onClick={release} disabled={busy} className="rounded-md bg-navy-700 px-3 py-1.5 text-xs text-white disabled:opacity-60">Release answers to students</button>;
}

export function ReviewRow({ row }: { row: { responseId: string; student: string; prompt: string; answer: string; rubric: string[]; scored: boolean } }) {
  const router = useRouter();
  const [score, setScore] = useState("1");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(row.scored);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/responses/${row.responseId}`, "PATCH", { teacherScore: Number(score), feedback: feedback || undefined });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
      <p className="font-medium">{row.student} · {row.prompt}</p>
      <p className="whitespace-pre-line rounded bg-slate-50 p-2">{row.answer || "(blank)"}</p>
      <details><summary className="cursor-pointer text-teal-700">Rubric</summary><ul className="list-disc pl-5">{row.rubric.map((r, i) => <li key={i}>{r}</li>)}</ul></details>
      <div className="flex flex-wrap items-end gap-2">
        <label>Mark<select value={score} onChange={(e) => setScore(e.target.value)} className="ml-1 rounded border border-slate-300 px-1 py-1"><option value="1">Full (1)</option><option value="0.5">Partial (0.5)</option><option value="0">None (0)</option></select></label>
        <label className="flex-1">Feedback for student<input value={feedback} maxLength={1000} onChange={(e) => setFeedback(e.target.value)} className="ml-1 w-full rounded border border-slate-300 px-2 py-1" /></label>
        <button type="button" onClick={save} disabled={busy} className="rounded-md bg-teal-600 px-3 py-1.5 text-white disabled:opacity-60">{saved ? "Update mark" : "Save mark"}</button>
      </div>
      {saved && <p role="status" className="text-teal-700">Marked.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </li>
  );
}
