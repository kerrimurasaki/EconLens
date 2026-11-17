import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { normalizeCode } from "@/server/classes";
import { JoinForm } from "@/app/learn/JoinForm";

export const metadata: Metadata = { title: "Join a class" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const rawCode = (await params).code;
  let decoded = rawCode;
  try { decoded = decodeURIComponent(rawCode); } catch { /* malformed escape: use the raw text */ }
  const code = normalizeCode(decoded).replace(/[^A-Z0-9]/g, "").slice(0, 20);
  const user = await getSessionUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/join/${code}`)}`);
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold text-navy-900">Join a class</h1>
      {user.role !== "STUDENT" ? (
        <p className="text-sm text-slate-700">Only student accounts can join a class. <Link className="underline" href="/dashboard">Back to dashboard</Link></p>
      ) : (
        <JoinForm initialCode={code} />
      )}
    </main>
  );
}
