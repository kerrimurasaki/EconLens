"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/** Accepts only same-origin paths; anything else (including tab/backslash tricks) falls back to "/". */
function safeNext(raw: string): string {
  try {
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin && raw.startsWith("/") ? u.pathname + u.search : "/";
  } catch {
    return "/";
  }
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  // Only same-site relative paths are accepted (prevents open redirects).
  const raw = params.get("callbackUrl") ?? "/";
  const next = safeNext(raw);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    setPending(false);
    if (res?.ok) {
      router.replace(next);
      router.refresh();
    } else {
      setError("Email or password is incorrect.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="login-title"
      >
        <div>
          <h1 id="login-title" className="text-xl font-semibold text-navy-900">
            Sign in to EconLens AI
          </h1>
          <p className="mt-1 text-sm text-slate-600">Teacher-authored economics inquiry, from real-world events.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-navy-700 px-3 py-2 font-medium text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
