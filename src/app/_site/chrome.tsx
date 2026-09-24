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

export function SiteHeader({ links = true, action }: { links?: boolean; action?: React.ReactNode }) {
  return (
    <div className="pointer-events-none sticky top-4 z-40 flex justify-center px-4">
      <header className="pointer-events-auto flex items-center gap-2 rounded-full bg-background/70 py-1.5 pr-1.5 pl-4 shadow-[0_8px_32px_rgb(0_0_0/0.45)] ring-1 ring-white/10 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 pr-3 text-sm font-semibold tracking-tight">
          <Mark className="h-5 w-5" />
          Preflight
        </Link>
        {links && (
          <nav className="hidden items-center gap-1 text-sm text-muted md:flex">
            {[
              ["#how", "How it works"],
              ["#stack", "Stack"],
              ["#proof", "Proof"],
              ["#limits", "Limits"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3 py-1.5 transition-colors duration-300 hover:bg-white/[0.06] hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        )}
        <span className="hidden items-center gap-1.5 px-3 font-mono text-[11px] text-muted sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-clear shadow-[0_0_8px_var(--clear)]" />
          mainnet
        </span>
        {action ?? (
          <Link href="/app" className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background transition-transform duration-500 ease-spring active:scale-[0.97]">
            Launch app
          </Link>
        )}
      </header>
    </div>
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
