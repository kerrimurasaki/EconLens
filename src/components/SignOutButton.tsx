"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-navy-100 hover:bg-navy-700"
    >
      <LogOut className="h-4 w-4" aria-hidden /> Sign out
    </button>
  );
}
