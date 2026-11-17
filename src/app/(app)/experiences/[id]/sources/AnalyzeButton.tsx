"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function AnalyzeButton({ experienceId, again = false }: { experienceId: string; again?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (again && !window.confirm("Re-analysing replaces the current claims, reviews and concept selection. Continue?")) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/experiences/${experienceId}/analyze`, "POST");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={again ? "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60" : "rounded-md bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-60"}
      >
        {pending ? "Analysing…" : again ? "Re-analyse" : "Analyse event"}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
