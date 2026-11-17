import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getDraft } from "@/server/builder";
import { AppError } from "@/server/errors";
import { toStudentView } from "@/server/generation/studentView";
import { StudentExperience, TeacherExperience } from "@/components/ExperienceView";

export const metadata: Metadata = { title: "Preview" };

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string; device?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const as = q.as === "teacher" ? "teacher" : "student";
  const device = q.device === "mobile" ? "mobile" : "desktop";
  let d;
  try {
    d = await getDraft(await getSessionUser(), id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  if (!d.doc) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold text-navy-900">Preview</h1>
        <p className="text-sm text-slate-700">There is no draft to preview yet.</p>
        <Link href={`/experiences/${id}/blueprint`} className="underline">Go to blueprint</Link>
      </div>
    );
  }
  const tab = (label: string, href: string, on: boolean) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-sm ${on ? "bg-navy-700 text-white" : "bg-navy-50 text-navy-700"}`}>{label}</Link>
  );
  const base = `/experiences/${id}/preview`;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <nav aria-label="Steps" className="text-sm text-slate-600"><Link className="underline" href={`/experiences/${id}/builder`}>← Back to builder</Link></nav>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">View as</span>
        {tab("Student", `${base}?as=student&device=${device}`, as === "student")}
        {tab("Teacher", `${base}?as=teacher&device=${device}`, as === "teacher")}
        <span className="ml-3 text-sm font-medium">Device</span>
        {tab("Desktop", `${base}?as=${as}&device=desktop`, device === "desktop")}
        {tab("Mobile", `${base}?as=${as}&device=mobile`, device === "mobile")}
      </div>
      <p className="text-xs text-slate-600">
        {as === "student" ? "This is exactly what the student view contains: answer keys, rubrics and teacher notes are removed on the server." : "Teacher view includes notes and answer keys. Students never receive these."} Draft version {d.version}, not published.
      </p>
      <div className={`mx-auto rounded-2xl border-4 border-slate-300 bg-slate-50 p-4 ${device === "mobile" ? "max-w-[390px]" : ""}`}>
        {as === "student" ? <StudentExperience doc={toStudentView(d.doc)} /> : <TeacherExperience doc={d.doc} />}
      </div>
    </div>
  );
}
