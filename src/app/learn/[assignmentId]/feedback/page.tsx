import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getFeedback } from "@/server/learn/student";
import { AppError } from "@/server/errors";

export const metadata: Metadata = { title: "Feedback" };

const RESULT = { correct: "Correct", incorrect: "Not correct", partial: "Partly correct", awaiting_teacher: "Waiting for your teacher to mark", unanswered: "Not answered" } as const;

export default async function FeedbackPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  let f;
  try {
    f = await getFeedback(await getSessionUser(), assignmentId);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <>
      <Link href="/learn" className="text-sm underline">← Your activities</Link>
      <h1 className="text-xl font-semibold text-navy-900">Feedback</h1>
      {f.status === "not_submitted" && (
        <p className="rounded-md bg-slate-100 p-4 text-sm">Feedback appears after you submit the independent check. <Link className="underline" href={`/learn/${assignmentId}/check`}>Go to the check</Link></p>
      )}
      {f.status === "withheld" && (
        <p role="status" className="rounded-md bg-teal-50 p-4 text-sm text-teal-900">Thank you, your work is submitted. Your teacher will release answers and feedback later.</p>
      )}
      {f.status === "released" && (
        <>
          <p className="rounded-md bg-teal-50 p-4 text-sm text-teal-900">
            {f.score === null ? "Your independent check score will appear once your teacher has marked your written answers." : `Independent check: ${Math.round(f.score * 100)}% of scored questions correct.`}
          </p>
          <ol className="space-y-3">
            {f.items.map((it, i) => (
              <li key={it.id} className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <p className="text-xs text-slate-500">{it.section} · question {i + 1}</p>
                <p className="font-medium">{it.prompt}</p>
                <p><span className="font-medium">Your answer:</span> {it.yourAnswer ?? "No answer"} <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${it.result === "correct" ? "bg-teal-100 text-teal-900" : it.result === "incorrect" ? "bg-red-100 text-red-900" : "bg-slate-100"}`}>{RESULT[it.result]}</span></p>
                {it.correctAnswer && it.result !== "correct" && <p><span className="font-medium">Correct answer:</span> {it.correctAnswer}</p>}
                <p className="text-slate-700"><span className="font-medium">Why:</span> {it.explanation}</p>
                {it.teacherFeedback && <p className="rounded bg-navy-50 p-2"><span className="font-medium">Teacher feedback:</span> {it.teacherFeedback}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
