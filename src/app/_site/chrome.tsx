import Link from "next/link";

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="none" stroke="currentColor" strokeOpacity="0.25" />
      <circle cx="7" cy="12" r="2.4" fill="var(--hold)" />
      <circle cx="12" cy="12" r="2.4" fill="var(--disclose)" />
      <circle cx="17" cy="12" r="2.4" fill="var(--clear)" />
    </svg>
  );
}

export function SiteHeader({ links = true }: { links?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Mark className="h-6 w-6" />
          Preflight
        </Link>
        <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-clear" />
          Solana mainnet
        </span>
        {links && (
          <nav className="ml-auto hidden gap-6 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#stack" className="hover:text-foreground">
              Stack
            </a>
            <a href="#proof" className="hover:text-foreground">
              Proof
            </a>
            <a href="#limits" className="hover:text-foreground">
              Limits
            </a>
          </nav>
        )}
        <Link href="/app" className={`${links ? "" : "ml-auto"} rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background hover:opacity-90`}>
          Launch app
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted">
        <span className="flex items-center gap-2 text-foreground">
          <Mark className="h-5 w-5" /> Preflight
        </span>
        <span>Built for Stocklana on Solana mainnet with PreStocks, Jupiter and Token-2022.</span>
        <span className="ml-auto">Not investment advice. Preflight does not determine eligibility.</span>
      </div>
    </footer>
  );
}
