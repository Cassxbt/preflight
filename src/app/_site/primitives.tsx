import Link from "next/link";

// A machined card: a hairline tray holding an inner plate with its own top highlight.
export function Bezel({ children, className = "", inner = "" }: { children: React.ReactNode; className?: string; inner?: string }) {
  return (
    <div className={`rounded-[1.75rem] bg-white/[0.03] p-1.5 ring-1 ring-white/[0.07] ${className}`}>
      <div className={`h-full rounded-[calc(1.75rem-0.375rem)] bg-surface shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] ${inner}`}>{children}</div>
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-white/[0.04] px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted ring-1 ring-white/[0.07]">
      {children}
    </span>
  );
}

export function Cta({ href, children, variant = "solid" }: { href: string; children: React.ReactNode; variant?: "solid" | "quiet" }) {
  const solid = variant === "solid";
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-5 text-sm font-semibold transition-transform duration-500 ease-spring active:scale-[0.98] ${
        solid ? "bg-foreground text-background" : "bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/[0.07]"
      }`}
    >
      {children}
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-500 ease-spring group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105 ${
          solid ? "bg-background/10" : "bg-white/10"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M5 11 11 5M6 5h5v5" />
        </svg>
      </span>
    </Link>
  );
}
