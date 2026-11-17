"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const STATUSES = ["unverified", "teacher_provided", "verified", "disputed", "hypothetical"] as const;

interface Props {
  experienceId: string;
  claim: { id: string; text: string; type: string; status: string; sourceId: string | null };
  sources: Array<{ id: string; title: string; verifiable: boolean }>;
}

export function ClaimRow({ experienceId, claim, sources }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(claim.status);
  const [sourceId, setSourceId] = useState(claim.sourceId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(nextStatus: string, nextSource: string) {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/experiences/${experienceId}/claims/${claim.id}`, "PATCH", {
        verificationStatus: nextStatus,
        sourceId: nextSource || null,
      });
      setStatus(nextStatus);
      setSourceId(nextSource);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <p>
        <span className="mr-2 rounded bg-navy-50 px-1.5 py-0.5 text-xs font-medium text-navy-700">{claim.type}</span>
        {claim.text}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="text-xs">
          <span className="mr-1 text-slate-600">Status</span>
          <select
            value={status}
            disabled={saving}
            onChange={(e) => save(e.target.value, sourceId)}
            className="rounded border border-slate-300 px-2 py-1"
            aria-label={`Verification status for claim: ${claim.text.slice(0, 60)}`}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mr-1 text-slate-600">Source</span>
          <select
            value={sourceId}
            disabled={saving}
            onChange={(e) => save(status, e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
            aria-label={`Linked source for claim: ${claim.text.slice(0, 60)}`}
          >
            <option value="">None</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.title}{s.verifiable ? "" : " (cannot verify)"}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  );
}
