"use client";

import { AreaSeries, ColorType, createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { fmtUsd } from "@/lib/format";

type Candle = [number, number];
const RANGES = ["1D", "1W", "1M"] as const;
type Range = (typeof RANGES)[number];

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function readout(candles: Candle[], hovered: Candle | null) {
  const last = candles[candles.length - 1];
  const point = hovered ?? last;
  const first = candles[0];
  const change = point && first ? (point[1] / first[1] - 1) * 100 : null;
  return { point, change };
}

function stamp(seconds: number, range: Range): string {
  const d = new Date(seconds * 1000);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return range === "1M" ? day : `${day}, ${d.toISOString().slice(11, 16)} UTC`;
}

export function PriceChart({ mint, initial, mark }: { mint: string; initial: Candle[]; mark: number }) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState<Range>("1W");
  const [candles, setCandles] = useState<Candle[]>(initial);
  const [hovered, setHovered] = useState<Candle | null>(null);
  const [status, setStatus] = useState<"ready" | "loading" | "failed">(initial.length ? "ready" : "loading");

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const instance = createChart(node, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css("--muted"), fontFamily: css("--font-geist-mono") || "monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "rgba(255,255,255,0.25)", width: 1, style: LineStyle.Solid, labelVisible: false },
        horzLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: css("--raised") },
      },
      handleScroll: false,
      handleScale: false,
    });
    const area = instance.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4 });
    area.createPriceLine({ price: mark, color: css("--disclose"), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "mark" });
    instance.subscribeCrosshairMove((param) => {
      const point = param.seriesData.get(area) as { time: number; value: number } | undefined;
      setHovered(point && param.time ? [point.time, point.value] : null);
    });
    chart.current = instance;
    series.current = area;
    return () => {
      instance.remove();
      chart.current = null;
      series.current = null;
    };
  }, [mark]);

  useEffect(() => {
    const area = series.current;
    if (!area || candles.length < 2) return;
    const up = candles[candles.length - 1][1] >= candles[0][1];
    const color = css(up ? "--clear" : "--hold");
    area.applyOptions({ lineColor: color, topColor: `${color}40`, bottomColor: `${color}00` });
    area.setData(candles.map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    chart.current?.timeScale().fitContent();
  }, [candles]);

  async function load(next: Range, attempt = 0) {
    setRange(next);
    setStatus("loading");
    try {
      const res = await fetch(`/api/token/${mint}/chart?range=${next}`);
      if (res.ok) {
        const body = (await res.json()) as { candles: Candle[] };
        setCandles(body.candles);
        setStatus(body.candles.length > 1 ? "ready" : "failed");
        return;
      }
    } catch {}
    if (attempt < 1) {
      setTimeout(() => void load(next, attempt + 1), 2500);
      return;
    }
    setStatus("failed");
  }

  const loadMissingHistory = useEffectEvent(() => {
    if (!initial.length) void load("1W");
  });

  useEffect(() => {
    const start = setTimeout(loadMissingHistory, 0);
    return () => clearTimeout(start);
  }, []);

  const { point, change } = readout(candles, hovered);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="tabular font-mono text-3xl tracking-tight">{point ? fmtUsd(point[1]) : "—"}</p>
          <p className="tabular mt-1 font-mono text-[11px] text-muted">
            {change !== null && <span className={change >= 0 ? "text-clear" : "text-hold"}>{`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}</span>}
            {point && <span> · {hovered ? stamp(point[0], range) : `past ${range === "1D" ? "day" : range === "1W" ? "week" : "month"}`}</span>}
          </p>
        </div>
        <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => void load(r)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] transition-colors duration-300 ${r === range ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-56">
        <div ref={container} className={`absolute inset-0 transition-opacity duration-500 ${status === "ready" ? "opacity-100" : "opacity-30"}`} />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center">
            {status === "loading" ? (
              <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" /> Loading price history
              </span>
            ) : (
              <button onClick={() => void load(range)} className="rounded-full bg-white/[0.06] px-4 py-2 font-mono text-[11px] text-muted ring-1 ring-white/10 hover:text-foreground">
                Price history unavailable · retry
              </button>
            )}
          </div>
        )}
      </div>
      <p className="font-mono text-[10px] text-muted">On-chain price via GeckoTerminal · chart by TradingView Lightweight Charts</p>
    </div>
  );
}
