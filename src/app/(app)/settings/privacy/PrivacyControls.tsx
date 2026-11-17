"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Props { days: number; students: Array<{ id: string; name: string; email: string; attempts: number; classes: number }> }

export function PrivacyControls({ days, students }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(String(days));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => { e.preventDefault(); void run(async () => { await api("/api/privacy/retention", "PATCH", { days: Number(value) }); return "Retention period saved."; }); };
  const purge = () => {
    if (!window.confirm("Permanently delete all student attempts older than the retention period? This cannot be undone.")) return;
    void run(async () => { const r = await api<{ deleted: number }>("/api/privacy/retention/run", "POST"); return `Deleted ${r.deleted} expired attempt(s).`; });
  };
  const erase = (s: Props["students"][number]) => {
    if (!window.confirm(`Permanently delete ${s.name} and all of their attempts and answers? This cannot be undone.`)) return;
    void run(async () => { await api(`/api/privacy/students/${s.id}/delete`, "POST"); return `Deleted ${s.name}.`; });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium">Keep student attempts for (days, 30 to 1825)
          <input type="number" min={30} max={1825} required value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 block w-40 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        <button type="submit" disabled={busy} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Save</button>
        <button type="button" onClick={purge} disabled={busy} className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-800 disabled:opacity-60">Delete expired attempts now</button>
      </form>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</p>}

      <section aria-labelledby="stu" className="space-y-2">
        <h2 id="stu" className="text-lg font-semibold text-navy-900">Student records</h2>
        {students.length === 0 ? <p className="text-sm text-slate-600">No student accounts.</p> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Student accounts</caption>
            <thead><tr><th scope="col" className="py-1 text-left">Name</th><th scope="col" className="py-1 text-left">Email</th><th scope="col" className="py-1 text-left">Attempts</th><th scope="col" className="py-1 text-left">Classes</th><th scope="col" className="py-1 text-left"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-1">{s.name}</td><td>{s.email}</td><td>{s.attempts}</td><td>{s.classes}</td>
                  <td className="text-right"><button type="button" disabled={busy} onClick={() => erase(s)} className="text-xs text-red-700 underline disabled:opacity-60" aria-label={`Delete all data for ${s.name}`}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
