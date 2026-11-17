import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { listClasses } from "@/server/classes";
import { ClassForm, RotateCodeButton } from "./ClassControls";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const classes = await listClasses(await getSessionUser());
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Classes</h1>
        <p className="text-sm text-slate-600">Create a class, share its join code with students, then publish an experience to it. Codes expire after 14 days and can be renewed.</p>
      </header>
      <ClassForm />
      {classes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">No classes yet.</p>
      ) : (
        <ul className="space-y-3">
          {classes.map((c) => {
            const expired = c.joinExpiresAt ? c.joinExpiresAt < new Date() : false;
            return (
              <li key={c.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-navy-900">{c.name}{c.term ? ` · ${c.term}` : ""}</h2>
                    <p className="text-xs text-slate-600">{c._count.enrollments} student(s) enrolled</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600">Join code {expired ? "(expired)" : ""}</p>
                    <p className={`font-mono text-lg font-semibold tracking-wider ${expired ? "text-slate-400 line-through" : "text-navy-900"}`}>{c.joinCode}</p>
                    <p className="text-xs text-slate-500">{c.joinExpiresAt ? `${expired ? "expired" : "expires"} ${c.joinExpiresAt.toLocaleDateString("en-GB")}` : "no expiry"} · link: /join/{c.joinCode}</p>
                    <RotateCodeButton classId={c.id} />
                  </div>
                </div>
                {c.assignments.length > 0 && (
                  <ul className="border-t pt-2 text-xs">
                    {c.assignments.map((a) => (
                      <li key={a.id}><Link className="underline" href={`/experiences/${a.experience.id}/insights`}>{a.experience.title}</Link> (version {a.publishedVersion.versionNumber})</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
