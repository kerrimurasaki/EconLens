import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { listExperiences } from "@/server/experiences";
import { experienceListQuery } from "@/schemas/experiences";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_LABEL = { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" } as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const raw = await searchParams;
  const parsed = experienceListQuery.safeParse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: typeof raw.status === "string" && raw.status !== "" ? raw.status : undefined,
  });
  const query = parsed.success ? parsed.data : {};

  let experiences: Awaited<ReturnType<typeof listExperiences>> = [];
  let loadError = false;
  try {
    experiences = await listExperiences(user, query);
  } catch {
    loadError = true;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Your experiences</h1>
          <p className="text-sm text-slate-600">Lessons built from real-world events, reviewed by you before students see them.</p>
        </div>
        <Link
          href="/experiences/new"
          className="flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" aria-hidden /> Create from event
        </Link>
      </header>

      <form method="get" className="flex flex-wrap gap-2" role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <label htmlFor="q" className="sr-only">
            Search experiences
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search by title"
            className="rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={query.status ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium">
          Filter
        </button>
      </form>

      {loadError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load experiences. <Link href="/dashboard" className="underline">Try again</Link>.
        </div>
      ) : experiences.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No experiences match yet.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {experiences.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium text-navy-900"><Link href={e.hasDraft ? `/experiences/${e.id}/builder` : `/experiences/${e.id}/sources`} className="hover:underline">{e.title}</Link></h2>
                <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs text-navy-700">{STATUS_LABEL[e.status]}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {e.durationMinutes} min · {e.level} · updated {new Date(e.updatedAt).toLocaleDateString("en-GB")}
              </p>
              {e.isDemo && (
                <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                  Sample / synthetic data
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
