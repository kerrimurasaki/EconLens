import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getLearnView } from "@/server/learn/student";
import { AppError } from "@/server/errors";
import { ActivityClient } from "./ActivityClient";

export const metadata: Metadata = { title: "Activity" };

export default async function LearnPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  let v;
  try {
    v = await getLearnView(await getSessionUser(), assignmentId, "learn");
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <>
      <Link href="/learn" className="text-sm underline">← Your activities</Link>
      <ActivityClient assignmentId={v.assignmentId} scope="learn" doc={v.doc} attemptId={v.attempt?.id ?? null} submitted={v.attempt?.submitted ?? false} responses={v.responses} scenarios={v.scenarios} />
    </>
  );
}
