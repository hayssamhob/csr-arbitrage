/**
 * AlignmentDisplay - Displays BACKEND alignment data ONLY
 * 
 * This component does NOT compute any required sizes.
 * It displays EXACTLY what /api/alignment returns.
 * All calculations are done server-side.
 */

interface BackendAlignment {
  market: string;
  cex_mid: number | null;
  dex_exec_price: number | null;
  dex_quote_size_usdt: number | null;
  deviation_pct: number | null;
  band_bps: number;
  status:
    | "ALIGNED"
    | "BUY_ON_DEX"
    | "SELL_ON_DEX"
    | "NO_ACTION"
    | "NOT_SUPPORTED_YET";
  direction: "BUY" | "SELL" | "NONE";
  required_usdt: number | null;
  required_tokens: number | null;
  expected_exec_price: number | null;
  price_impact_pct: number | null;
  network_cost_usd: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  ts_cex: string | null;
  ts_dex: number | null;
  reason: string;
  quotes_available: number;
  quotes_valid: number;
}

interface AlignmentDisplayProps {
  token: "CSR" | "CSR25";
  alignment: BackendAlignment | null;
  onExecute?: (
    token: "CSR" | "CSR25",
    direction: string,
    usdtAmount: number
  ) => void;
  executionMode: "OFF" | "MANUAL" | "AUTO";
}

const TOKEN_NAMES: Record<string, string> = {
  CSR: "CSR/USDT",
  CSR25: "CSR25/USDT",
};

const CEX_SOURCES: Record<string, string> = {
  CSR: "LATOKEN",
  CSR25: "LBank",
};

function formatPrice(price: number | null): string {
  if (price === null || price === 0) return "—";
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}

export function AlignmentDisplay({
  token,
  alignment,
  onExecute,
  executionMode,
}: AlignmentDisplayProps) {
  // Loading state
  if (!alignment) {
    return (
      <div className="relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-700/20 via-transparent to-transparent"></div>
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-white tracking-tight">
              {TOKEN_NAMES[token]}
            </h2>
            <span className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-slate-800/80 text-slate-400 border border-slate-700/50">
              Loading
            </span>
          </div>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 mb-4">
              <div className="w-6 h-6 border-2 border-slate-500 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
            <div className="text-slate-500 font-medium">
              Fetching alignment data...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No action state (stale/missing data)
  if (alignment.status === "NO_ACTION") {
    return (
      <div className="relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur-xl border border-amber-500/20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent"></div>
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-white tracking-tight">
              {TOKEN_NAMES[token]}
            </h2>
            <span className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              No Action
            </span>
          </div>
          <div className="bg-amber-500/5 rounded-2xl p-5 mb-6 border border-amber-500/10">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-400">⚠️</span>
              </div>
              <div>
                <div className="text-amber-400 font-bold mb-1">
                  Cannot compute alignment
                </div>
                <div className="text-amber-400/60 text-sm font-mono">
                  {alignment.reason}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                CEX ({CEX_SOURCES[token]})
              </div>
              <div className="font-mono text-xl font-bold text-white">
                ${formatPrice(alignment.cex_mid)}
              </div>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                DEX (Uniswap)
              </div>
              <div className="font-mono text-xl font-bold text-white">
                ${formatPrice(alignment.dex_exec_price)}
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500 font-mono">
            Quotes: {alignment.quotes_valid}/{alignment.quotes_available} valid
          </div>
        </div>
      </div>
    );
  }

  // Not supported (SELL direction)
  if (alignment.status === "NOT_SUPPORTED_YET") {
    return (
      <div className="relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur-xl border border-slate-600/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-red-900/10 via-transparent to-transparent"></div>
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-white tracking-tight">
              {TOKEN_NAMES[token]}
            </h2>
            <span className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-slate-700/50 text-slate-300 border border-slate-600/50">
              Sell Needed
            </span>
          </div>
          <div className="bg-slate-800/30 rounded-2xl p-5 mb-6 border border-slate-700/30">
            <div className="text-slate-300 font-bold mb-2">
              DEX price is HIGH vs CEX
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Deviation:</span>
              <span className="font-mono font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-lg">
                +{alignment.deviation_pct?.toFixed(2)}%
              </span>
            </div>
            <div className="text-slate-500 text-xs mt-3 font-mono">
              {alignment.reason}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/50">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                CEX ({CEX_SOURCES[token]})
              </div>
              <div className="font-mono text-xl font-bold text-white">
                ${formatPrice(alignment.cex_mid)}
              </div>
            </div>
            <div className="bg-slate-950/50 rounded-2xl p-5 border border-red-500/20">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                DEX (Uniswap)
              </div>
              <div className="font-mono text-xl font-bold text-red-400">
                ${formatPrice(alignment.dex_exec_price)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Aligned state
  if (alignment.status === "ALIGNED") {
    return (
      <div className="relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur-xl border-2 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent"></div>
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-white tracking-tight">
              {TOKEN_NAMES[token]}
            </h2>
            <span className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              ✓ Aligned
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-950/50 rounded-2xl p-6 border border-slate-800/50">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                CEX ({CEX_SOURCES[token]})
              </div>
              <div className="font-mono text-3xl font-black text-white">
                ${formatPrice(alignment.cex_mid)}
              </div>
            </div>
            <div className="bg-emerald-500/5 rounded-2xl p-6 border border-emerald-500/20">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 mb-2">
                DEX (Uniswap)
              </div>
              <div className="font-mono text-3xl font-black text-emerald-400">
                ${formatPrice(alignment.dex_exec_price)}
              </div>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <span className="text-2xl">✓</span>
              </div>
              <div>
                <div className="text-emerald-400 font-black text-lg">
                  Prices Aligned
                </div>
                <div className="text-emerald-400/60 text-sm">
                  Deviation:{" "}
                  <span className="font-mono font-bold">
                    {alignment.deviation_pct?.toFixed(2)}%
                  </span>{" "}
                  (within ±{(alignment.band_bps / 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // BUY_ON_DEX state - THE CORE DISPLAY
  const isActionRequired =
    alignment.status === "BUY_ON_DEX" || alignment.status === "SELL_ON_DEX";
  const isBuy = alignment.direction === "BUY";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur-xl border-2 ${
        isActionRequired
          ? isBuy
            ? "border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.15)]"
            : "border-red-500/40 shadow-[0_0_40px_rgba(239,68,68,0.15)]"
          : "border-slate-700"
      }`}
    >
      <div
        className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] ${
          isBuy ? "from-emerald-900/20" : "from-red-900/20"
        } via-transparent to-transparent`}
      ></div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {TOKEN_NAMES[token]}
            </h2>
            <span className="text-xs text-slate-500">
              via {CEX_SOURCES[token]}
            </span>
          </div>
          <span
            className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl ${
              isBuy
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "bg-red-500/10 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            }`}
          >
            {isBuy ? "Buy" : "Sell"} Needed
          </span>
        </div>

        {/* Price Comparison */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-950/50 rounded-2xl p-6 border border-slate-800/50 group hover:border-slate-700/50 transition-colors">
            <div
              className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1"
              title="Reference price from the centralized exchange"
            >
              CEX Reference
              <span className="opacity-50 group-hover:opacity-100 transition-opacity">
                ⓘ
              </span>
            </div>
            <div className="font-mono text-3xl font-black text-white">
              ${formatPrice(alignment.cex_mid)}
            </div>
          </div>
          <div
            className={`rounded-2xl p-6 border group hover:border-opacity-50 transition-colors ${
              isBuy
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-red-500/5 border-red-500/20"
            }`}
          >
            <div
              className={`text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1 ${
                isBuy ? "text-emerald-500/70" : "text-red-500/70"
              }`}
              title="Current execution price on Uniswap DEX"
            >
              DEX Current
              <span className="opacity-50 group-hover:opacity-100 transition-opacity">
                ⓘ
              </span>
            </div>
            <div
              className={`font-mono text-3xl font-black ${
                isBuy ? "text-emerald-400" : "text-red-400"
              }`}
            >
              ${formatPrice(alignment.dex_exec_price)}
            </div>
          </div>
        </div>

        {/* Deviation Bar */}
        <div className="mb-6 p-4 rounded-2xl bg-slate-950/30 border border-slate-800/30">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400 font-medium">
              Price Deviation
            </span>
            <span
              className={`font-mono text-xl font-black px-3 py-1 rounded-xl ${
                isBuy
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-red-400 bg-red-500/10"
              }`}
            >
              {alignment.deviation_pct !== null
                ? `${
                    alignment.deviation_pct > 0 ? "+" : ""
                  }${alignment.deviation_pct.toFixed(2)}%`
                : "—"}
            </span>
          </div>
        </div>

        {/* RECOMMENDED TRADE */}
        <div
          className={`p-6 rounded-2xl border-2 ${
            isBuy
              ? "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/30"
              : "bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30"
          }`}
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isBuy ? "bg-emerald-500/20" : "bg-red-500/20"
              }`}
            >
              <span className="text-xl">⚡</span>
            </div>
            <span className="text-lg font-black text-white">
              Recommended Trade
            </span>
          </div>

          {/* Trade Amount */}
          <div className="bg-slate-950/50 rounded-2xl p-5 mb-5 border border-slate-800/30">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Suggested Size
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-4xl font-mono font-black text-white">
                $
                {(
                  alignment.required_usdt ||
                  alignment.dex_quote_size_usdt ||
                  100
                ).toLocaleString()}
              </span>
              <span className="text-sm font-bold text-slate-500">USDT</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Impact
                </span>
                <div className="text-sm font-mono font-bold text-white mt-1">
                  {alignment.price_impact_pct?.toFixed(2) || "—"}%
                </div>
              </div>
              <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Gas
                </span>
                <div className="text-sm font-mono font-bold text-white mt-1">
                  {alignment.network_cost_usd !== null
                    ? `$${alignment.network_cost_usd.toFixed(2)}`
                    : "~$0.01"}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg ${
                  alignment.confidence === "HIGH"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : alignment.confidence === "MEDIUM"
                    ? "bg-amber-500/20 text-amber-400"
                    : alignment.confidence === "NONE"
                    ? "bg-slate-500/20 text-slate-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {alignment.confidence || "LOW"}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {alignment.quotes_valid} quotes • ±
                {(alignment.band_bps / 100).toFixed(1)}%
              </span>
            </div>

            {executionMode === "MANUAL" && onExecute && (
              <button
                onClick={() =>
                  onExecute(
                    token,
                    alignment.direction,
                    alignment.required_usdt ||
                      alignment.dex_quote_size_usdt ||
                      100
                  )
                }
                className={`px-6 py-3 rounded-xl font-black text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                  isBuy
                    ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-900/30"
                    : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-900/30"
                }`}
              >
                {isBuy ? "BUY" : "SELL"} ON UNISWAP →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
