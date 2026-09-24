import Checker from "./checker";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Preflight</h1>
        <p className="opacity-80">
          Before you buy a PreStocks token, check whether the issuer still honours it, whether it is the current mint, and what you
          actually pay versus the issuer&apos;s mark. Every check runs again, on the exact transaction you sign.
        </p>
      </header>
      <Checker />
    </main>
  );
}
