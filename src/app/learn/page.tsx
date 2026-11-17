import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { listMyAssignments } from "@/server/learn/student";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = { title: "Your activities" };

const STATE = { not_started: "Not started", in_progress: "In progress", submitted: "Submitted" } as const;

export default async function LearnHome() {
  const assignments = await listMyAssignments(await getSessionUser());
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Your activities</h1>
      {assignments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">No activities yet. Join your class with the code from your teacher.</p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-navy-900">{a.title}</p>
                  <p className="text-xs text-slate-600">{a.className}{a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleDateString("en-GB")}` : ""} · {STATE[a.state]}</p>
                </div>
                <Link href={a.state === "submitted" ? `/learn/${a.id}/feedback` : `/learn/${a.id}`} className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
                  {a.state === "submitted" ? "See feedback" : a.state === "in_progress" ? "Continue" : "Open"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <JoinForm />
    </>
  );
}
