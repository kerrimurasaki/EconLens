import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getLearnView } from "@/server/learn/student";
import { AppError } from "@/server/errors";
import { ActivityClient } from "../ActivityClient";

export const metadata: Metadata = { title: "Independent check" };

export default async function CheckPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  let v;
  try {
    v = await getLearnView(await getSessionUser(), assignmentId, "check");
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <>
      <Link href={`/learn/${assignmentId}`} className="text-sm underline">← Back to the activity</Link>
      <ActivityClient assignmentId={v.assignmentId} scope="check" doc={v.doc} attemptId={v.attempt?.id ?? null} submitted={v.attempt?.submitted ?? false} responses={v.responses} scenarios={v.scenarios} />
    </>
  );
}
