"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function ClassForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await api("/api/classes", "POST", { name: String(f.get("name") ?? ""), term: String(f.get("term") ?? "") || undefined });
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="text-sm font-medium">Class name<input name="name" required minLength={2} maxLength={100} className="mt-1 block w-60 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
      <label className="text-sm font-medium">Term (optional)<input name="term" maxLength={50} className="mt-1 block w-40 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
      <button type="submit" disabled={busy} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? "Creating…" : "Create class"}</button>
      {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}

export function RotateCodeButton({ classId }: { classId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function rotate() {
    if (!window.confirm("Make a new join code? The old code stops working.")) return;
    setBusy(true);
    try {
      await api(`/api/classes/${classId}/rotate`, "POST");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" onClick={rotate} disabled={busy} className="mt-1 text-xs underline disabled:opacity-60">New code</button>;
}
