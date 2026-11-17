"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md bg-navy-700 px-3 py-1.5 text-sm text-white">
      Print / save as PDF
    </button>
  );
}
