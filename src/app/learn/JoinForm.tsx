"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ name: string }>("/api/join", "POST", { code });
      setMsg({ ok: true, text: `Joined ${r.name}.` });
      router.push("/learn");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor="code" className="text-sm font-medium">Join a class with a code</label>
      <div className="flex gap-2">
        <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} autoComplete="off" required className="w-44 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm" />
        <button type="submit" disabled={busy} className="rounded-md bg-navy-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? "Joining…" : "Join"}</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</p>}
    </form>
  );
}
