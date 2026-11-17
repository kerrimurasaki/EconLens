export function ProviderBanner({ mode }: { mode: string | null | undefined }) {
  if (mode === "demo") {
    return (
      <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Demo mode.</strong> No AI provider is configured. Claims below are your own sentences; concept suggestions come from a built-in
        template chosen by keywords, not from analysis of your text. Nothing here has been web-verified.
      </div>
    );
  }
  return null;
}

export function VerificationNotice() {
  return (
    <p className="rounded-md bg-slate-100 p-3 text-xs text-slate-700">
      Source verification is unavailable: no search provider is configured. EconLens only records what you provide or what a URL you give returns,
      and never marks anything as verified on its own.
    </p>
  );
}
