import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getDraft } from "@/server/builder";
import { AppError } from "@/server/errors";
import { toStudentView } from "@/server/generation/studentView";
import { StudentExperience, TeacherExperience } from "@/components/ExperienceView";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Print" };

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const view = (await searchParams).view === "teacher" ? "teacher" : "student";
  let d;
  try {
    d = await getDraft(await getSessionUser(), id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  if (!d.doc) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-600">{view === "teacher" ? "Teacher guide (contains answer keys)" : "Student worksheet"}. Use your browser&apos;s print or save as PDF.</p>
        <PrintButton />
      </div>
      {view === "teacher" ? <TeacherExperience doc={d.doc} /> : <StudentExperience doc={toStudentView(d.doc)} />}
    </div>
  );
}
