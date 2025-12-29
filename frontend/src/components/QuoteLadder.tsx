/**
 * QuoteLadder - Shows DEX quotes at multiple trade sizes
 * 
 * This is the "source of truth" - actual scraped quotes from Uniswap UI.
 * Required trade sizes MUST come from this ladder, never invented.
 */

import { useEffect, useState } from "react";

interface LadderQuote {
  usdt_in: number;
  tokens_out: number;
  exec_price: number;
  price_impact_pct: number | null;
  deviation_pct: number | null;
  gas_usdt: number | null;
  age_seconds: number | null;
  valid: boolean;
  error: string | null;
}

interface LadderResponse {
  token: string;
  cex_mid: number | null;
  spot_price: number | null;
  quotes: LadderQuote[];
  total: number;
  valid: number;
}

interface QuoteLadderProps {
  token: "CSR" | "CSR25";
}

export function QuoteLadder({ token }: QuoteLadderProps) {
  const [data, setData] = useState<LadderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLadder = async () => {
      try {
        const resp = await fetch(`/api/ladder/${token}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        setData(json);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLadder();
    const interval = setInterval(fetchLadder, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [token]);

  // Color code vs CEX: green near 0% (balanced), yellow/orange/red further away
  const getDeviationColor = (deviation: number | null) => {
    if (deviation === null) return "text-slate-500";
    const abs = Math.abs(deviation);
    if (abs <= 0.5) return "text-emerald-400"; // Very close to balance
    if (abs <= 1.0) return "text-emerald-300"; // Close to balance
    if (abs <= 2.0) return "text-yellow-400"; // Moderate deviation
    if (abs <= 5.0) return "text-orange-400"; // High deviation
    return "text-red-400"; // Very high deviation
  };

  // No color coding for Impact - just neutral color
  const getImpactColor = (_impact: number | null) => {
    return "text-slate-300"; // Neutral color for all impact values
  };

  const getAgeColor = (age: number | null) => {
    if (age === null) return "text-slate-500";
    if (age <= 30) return "text-emerald-400";
    if (age <= 60) return "text-blue-400";
    if (age <= 120) return "text-yellow-400";
    return "text-red-400";
  };

  const formatPrice = (price: number | null) => {
    if (!price || price <= 0) return "—";
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };

  const formatTokens = (tokens: number | null) => {
    if (!tokens || tokens <= 0) return "—";
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(2)}K`;
    return tokens.toFixed(2);
  };

  if (loading) {
    return (
      <div className="rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-slate-800/50 flex items-center justify-center">
            <span className="text-sm">📊</span>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200 block">
              Trade Simulations
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              {token}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
            <span className="text-sm">❌</span>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200 block">
              Trade Simulations
            </span>
            <span className="text-[10px] text-red-400 font-medium">
              Error: {error}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.quotes.length === 0) {
    return (
      <div className="rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <span className="text-sm">⚠️</span>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200 block">
              Trade Simulations
            </span>
            <span className="text-[10px] text-amber-400 font-medium">
              No quotes available
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-800/50 flex items-center justify-center">
            <span className="text-sm">📊</span>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200 block">
              Trade Simulations
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              {token}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-3">
            <div className="px-2 py-1 rounded-lg bg-slate-950/50 border border-slate-800/30">
              <span className="text-[10px] text-slate-500 block">CEX</span>
              <span className="text-xs font-mono font-bold text-white">
                ${formatPrice(data.cex_mid)}
              </span>
            </div>
            <div className="px-2 py-1 rounded-lg bg-slate-950/50 border border-slate-800/30">
              <span className="text-[10px] text-slate-500 block">Spot</span>
              <span className="text-xs font-mono font-bold text-blue-400">
                ${formatPrice(data.spot_price)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-7 gap-1 text-[10px] font-black uppercase tracking-wider text-slate-600 mb-2 pb-2 border-b border-slate-800/50 px-2">
        <div>USDT</div>
        <div className="text-right">Tokens</div>
        <div className="text-right">Price</div>
        <div className="text-right">Impact</div>
        <div className="text-right">vs CEX</div>
        <div className="text-right">Gas</div>
        <div className="text-right">Age</div>
      </div>

      {/* Ladder rows */}
      <div className="space-y-1 max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {data.quotes.map((quote, idx) => (
          <div
            key={idx}
            className={`grid grid-cols-7 gap-1 text-xs py-2 px-2 rounded-xl transition-all duration-200 ${
              quote.valid
                ? "hover:bg-slate-800/30 border border-transparent hover:border-slate-700/30"
                : "opacity-30 bg-red-900/5 border border-red-500/10"
            }`}
          >
            <div className="font-mono font-bold text-slate-300">
              ${quote.usdt_in}
            </div>
            <div className="text-right font-mono text-slate-400">
              {formatTokens(quote.tokens_out)}
            </div>
            <div className="text-right font-mono font-bold text-blue-400">
              ${formatPrice(quote.exec_price)}
            </div>
            <div
              className={`text-right font-mono ${getImpactColor(
                quote.price_impact_pct
              )}`}
            >
              {quote.price_impact_pct !== null
                ? `${quote.price_impact_pct.toFixed(2)}%`
                : "—"}
            </div>
            <div
              className={`text-right font-mono font-bold ${getDeviationColor(
                quote.deviation_pct
              )}`}
            >
              {quote.deviation_pct !== null
                ? `${
                    quote.deviation_pct >= 0 ? "+" : ""
                  }${quote.deviation_pct.toFixed(2)}%`
                : "—"}
            </div>
            <div className="text-right font-mono text-slate-500">
              {quote.gas_usdt !== null ? `$${quote.gas_usdt.toFixed(2)}` : "—"}
            </div>
            <div
              className={`text-right font-mono ${getAgeColor(
                quote.age_seconds
              )}`}
            >
              {quote.age_seconds !== null ? `${quote.age_seconds}s` : "—"}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-3 border-t border-slate-800/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
              data.valid === data.total
                ? "bg-emerald-500/10 text-emerald-400"
                : data.valid > 0
                ? "bg-amber-500/10 text-amber-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {data.valid}/{data.total} valid
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-medium">
          Uniswap UI Scrape
        </span>
      </div>
    </div>
  );
}
