import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getRetentionDays, listStudents } from "@/server/privacy";
import { PrivacyControls } from "./PrivacyControls";

export const metadata: Metadata = { title: "Privacy and retention" };

export default async function PrivacyPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") notFound();
  const [days, students] = await Promise.all([getRetentionDays(user.tenantId), listStudents(user)]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Privacy and retention</h1>
        <p className="text-sm text-slate-600">Student attempts and answers are deleted after the retention period. Student details are never sent to the AI provider; only teacher-supplied event text is.</p>
      </header>
      <PrivacyControls
        days={days}
        students={students.map((s) => ({ id: s.id, name: s.name, email: s.email, attempts: s._count.attempts, classes: s._count.enrollments }))}
      />
    </div>
  );
}
