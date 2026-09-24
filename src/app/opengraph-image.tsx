import { ImageResponse } from "next/og";

export const alt = "Preflight: check a PreStocks token before you sign";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LIGHTS = [
  ["HOLD", "#f87171"],
  ["DISCLOSE", "#fbbf24"],
  ["CLEAR", "#34d399"],
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#07080a", color: "#eceef1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {LIGHTS.map(([label, color]) => (
              <div key={label} style={{ width: 18, height: 18, borderRadius: 9, background: color }} />
            ))}
          </div>
          Preflight
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -2 }}>Check the token before you sign.</div>
          <div style={{ fontSize: 30, color: "#8a919b" }}>Issuer lifecycle, current mint, price against mark, and the exact transaction, on Solana mainnet.</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {LIGHTS.map(([label, color]) => (
            <div key={label} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, border: `2px solid ${color}`, color, fontSize: 24 }}>
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
