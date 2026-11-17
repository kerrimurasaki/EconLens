"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const TABS = [
  { id: "describe", label: "Describe an event" },
  { id: "headline", label: "Paste headline" },
  { id: "url", label: "Add URL" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function NewEventForm() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("describe");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    try {
      const { experienceId } = await api<{ experienceId: string }>("/api/events", "POST", {
        inputType: tab,
        text: tab === "url" ? "" : (get("text") ?? ""),
        url: tab === "url" ? get("url") : undefined,
        eventDate: get("eventDate"),
        geography: get("geography"),
      });
      router.push(`/experiences/${experienceId}/sources`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  const field = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div role="tablist" aria-label="Input type" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="input-panel"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-navy-700 text-white" : "bg-navy-50 text-navy-700 hover:bg-navy-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="input-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-3">
        {tab === "url" ? (
          <div className="space-y-1">
            <label htmlFor="url" className="text-sm font-medium">News or source URL</label>
            <input id="url" name="url" type="url" required placeholder="https://" className={field} />
            <p className="text-xs text-slate-600">
              EconLens fetches the page once (public pages only, respecting robots.txt) and records the URL, an excerpt and the time.
              Paywalled or blocked pages cannot be read: paste the text instead.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <label htmlFor="text" className="text-sm font-medium">{tab === "headline" ? "Headline" : "Describe the situation"}</label>
            <textarea
              id="text"
              name="text"
              required
              minLength={10}
              maxLength={8000}
              rows={tab === "headline" ? 2 : 7}
              className={field}
              placeholder={tab === "headline" ? "e.g. Supermarket raises the price of milk by 12%" : "What happened, who is involved, and what is known?"}
            />
            <p className="text-xs text-slate-600">What you write is recorded as teacher-provided, not as verified fact.</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="eventDate" className="text-sm font-medium">Event date (optional)</label>
            <input id="eventDate" name="eventDate" type="date" className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="geography" className="text-sm font-medium">Country or region (optional)</label>
            <input id="geography" name="geography" maxLength={100} className={field} />
          </div>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {pending ? (tab === "url" ? "Fetching page…" : "Saving…") : "Continue to sources"}
      </button>
    </form>
  );
}
