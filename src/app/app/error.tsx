"use client";

import Link from "next/link";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-6 px-4 py-24">
      <p className="font-mono text-[10px] tracking-[0.18em] text-hold uppercase">Something broke on this page</p>
      <h1 className="font-display text-5xl leading-none tracking-tight">Nothing was signed or sent.</h1>
      <p className="text-[15px] leading-relaxed text-muted">The page hit an error before any order was built. Reload to try again; a purchase you already signed keeps its receipt.</p>
      <div className="flex gap-3">
        <button onClick={retry} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background">
          Reload
        </button>
        <Link href="/" className="rounded-full bg-white/[0.06] px-5 py-2.5 text-sm font-semibold ring-1 ring-white/10">
          Home
        </Link>
      </div>
    </main>
  );
}
