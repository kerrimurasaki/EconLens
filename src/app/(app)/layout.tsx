import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Users, BookOpenCheck } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { SignOutButton } from "@/components/SignOutButton";

const soon = [{ label: "Curriculum", icon: BookOpenCheck, milestone: "a later milestone" }];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "STUDENT") redirect("/learn");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-navy-900 text-white md:w-60 md:shrink-0">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <p className="text-lg font-semibold">EconLens AI</p>
          <p className="hidden text-xs text-navy-100 md:block">{user.name ?? user.email}</p>
        </div>
        <nav aria-label="Main" className="flex flex-wrap gap-1 px-2 pb-2 md:flex-col md:flex-nowrap md:pb-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md bg-navy-700 px-3 py-2 text-sm font-medium"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden /> Dashboard
          </Link>
          <Link href="/classes" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-navy-700">
            <Users className="h-4 w-4" aria-hidden /> Classes
          </Link>
          {soon.map(({ label, icon: Icon, milestone }) => (
            <span
              key={label}
              aria-disabled="true"
              title={`Available in ${milestone}`}
              className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-navy-100/60"
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </span>
          ))}
          <div className="md:mt-4">
            <SignOutButton />
          </div>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
