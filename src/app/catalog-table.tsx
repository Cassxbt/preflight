import Image from "next/image";
import { signedPct, utc } from "./ui";

export type CatalogView = {
  retrievedAt: string;
  tokens: {
    symbol: string;
    name: string;
    mint: string;
    image?: string;
    markPrice: number;
    tokenPrice: number;
    listedPremiumPct: number;
    deadline: string | null;
  }[];
  retired: { symbol: string; mint: string; deadline: string }[];
};

export function CatalogTable({ catalog, selected, onPick }: { catalog: CatalogView; selected: string; onPick: (mint: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-current/15">
        <table className="w-full text-sm">
          <thead className="text-left text-xs opacity-60">
            <tr>
              <th className="px-3 py-2 font-medium">PreStocks token</th>
              <th className="px-3 py-2 text-right font-medium">Mark</th>
              <th className="px-3 py-2 text-right font-medium">Listed price</th>
              <th className="px-3 py-2 text-right font-medium">vs mark</th>
            </tr>
          </thead>
          <tbody>
            {catalog.tokens.map((t) => (
              <tr
                key={t.mint}
                onClick={() => onPick(t.mint)}
                className={`cursor-pointer border-t border-current/10 hover:bg-current/5 ${t.mint === selected ? "bg-current/5" : ""}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {t.image && <Image src={t.image} alt="" width={20} height={20} className="rounded-full" />}
                    <span className="font-semibold">{t.symbol}</span>
                    {t.deadline && <span className="rounded bg-amber-400 px-1.5 text-[10px] font-semibold text-black">deadline {t.deadline.slice(0, 10)}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono">${t.markPrice.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono">${t.tokenPrice.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right font-mono ${t.listedPremiumPct > 5 ? "font-semibold text-amber-600" : "opacity-70"}`}>
                  {signedPct(t.listedPremiumPct)}
                </td>
              </tr>
            ))}
            {catalog.retired.map((r) => (
              <tr key={r.mint} onClick={() => onPick(r.mint)} className="cursor-pointer border-t border-current/10 opacity-60 hover:bg-current/5">
                <td className="px-3 py-2" colSpan={4}>
                  <span className="font-semibold">{r.symbol}</span>{" "}
                  <span className="text-xs">issuer conversion window closed {r.deadline.slice(0, 10)}, no longer listed</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-60">
        Mark and listed price from the PreStocks catalog, read at {utc(catalog.retrievedAt)}. Select a row to check it.
      </p>
    </div>
  );
}
