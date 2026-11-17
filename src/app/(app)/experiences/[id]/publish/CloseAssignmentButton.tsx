"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function CloseAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function close() {
    if (!window.confirm("Close this assignment? Students will no longer be able to open or submit it. Results are kept.")) return;
    setBusy(true);
    try {
      await api(`/api/assignments/${assignmentId}/close`, "POST");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" onClick={close} disabled={busy} className="text-xs text-red-700 underline disabled:opacity-60">Close assignment</button>;
}
