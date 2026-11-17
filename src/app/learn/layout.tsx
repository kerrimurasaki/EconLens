import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { SignOutButton } from "@/components/SignOutButton";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT") redirect("/dashboard");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between bg-navy-900 px-4 py-3 text-white">
        <span className="font-semibold">EconLens AI</span>
        <div className="flex items-center gap-3 text-sm"><span className="hidden sm:inline">{user.name ?? user.email}</span><div className="w-28"><SignOutButton /></div></div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">{children}</main>
    </div>
  );
}
