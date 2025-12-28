/**
 * DEX Price Alignment Panel
 * 
 * Displays price deviation, band status, and alignment suggestions
 * for maintaining DEX price aligned with CEX price.
 */

import { useMemo, useState } from "react";

// Types (inline to avoid import issues)
type BandStatus = "neutral" | "soft" | "hard";
type AlignmentDirection = "buy_dex" | "sell_dex" | "none";

interface AlignmentBands {
  neutralPercent: number;
  softPercent: number;
  hardPercent: number;
  alignmentMargin: number;
}

interface AlignmentConfig {
  bands: AlignmentBands;
  maxTradeSizeUsdt: number;
  cooldownSeconds: number;
  minBenefitBps: number;
  mode: "off" | "paper" | "live";
}

interface QuoteEntry {
  amountInUSDT: number;
  price_usdt_per_token: number;
  price_token_per_usdt: number;
  valid: boolean;
  gasEstimateUsdt: number | null;
}

interface AlignmentPanelProps {
  market: string;
  cexPrice: number;
  cexSource: string;
  quotes: QuoteEntry[];
  config?: AlignmentConfig;
  onConfigChange?: (config: AlignmentConfig) => void;
}

const DEFAULT_CONFIG: AlignmentConfig = {
  bands: {
    neutralPercent: 0.5,
    softPercent: 1.5,
    hardPercent: 2.0,
    alignmentMargin: 0.2,
  },
  maxTradeSizeUsdt: 500,
  cooldownSeconds: 120,
  minBenefitBps: 10,
  mode: "off",
};

function classifyBand(deviationPercent: number, bands: AlignmentBands): BandStatus {
  const absDeviation = Math.abs(deviationPercent);
  if (absDeviation <= bands.neutralPercent) return "neutral";
  if (absDeviation <= bands.softPercent) return "soft";
  return "hard";
}

function getBandColor(band: BandStatus): string {
  switch (band) {
    case "neutral": return "text-emerald-400";
    case "soft": return "text-yellow-400";
    case "hard": return "text-red-400";
  }
}

function getBandBgColor(band: BandStatus): string {
  switch (band) {
    case "neutral": return "bg-emerald-500/20 border-emerald-500/50";
    case "soft": return "bg-yellow-500/20 border-yellow-500/50";
    case "hard": return "bg-red-500/20 border-red-500/50";
  }
}

export function AlignmentPanel({
  market,
  cexPrice,
  cexSource,
  quotes,
  config = DEFAULT_CONFIG,
}: AlignmentPanelProps) {
  // Use market in title
  const marketTitle = market.replace("_", "/");
  const [selectedSize, setSelectedSize] = useState<number>(100);

  // Available sizes from quotes
  const availableSizes = useMemo(
    () =>
      quotes
        .filter((q) => q.valid)
        .map((q) => q.amountInUSDT)
        .sort((a, b) => a - b),
    [quotes]
  );

  // Selected quote
  const selectedQuote = useMemo(
    () => quotes.find((q) => q.amountInUSDT === selectedSize && q.valid),
    [quotes, selectedSize]
  );

  // DEX price for selected size
  const dexPrice = selectedQuote?.price_usdt_per_token || 0;

  // Price deviation
  const deviationPercent =
    cexPrice > 0 ? ((dexPrice - cexPrice) / cexPrice) * 100 : 0;
  const deviationBps = deviationPercent * 100;

  // Band classification
  const bandStatus = classifyBand(deviationPercent, config.bands);

  // Suggested action
  const direction: AlignmentDirection =
    bandStatus === "neutral"
      ? "none"
      : deviationPercent > 0
      ? "sell_dex"
      : "buy_dex";

  // Estimate trade size (simplified)
  const suggestedSizeUsdt = Math.min(
    Math.abs(deviationPercent) * 100, // Rough heuristic
    config.maxTradeSizeUsdt
  );
  const suggestedSizeTokens = dexPrice > 0 ? suggestedSizeUsdt / dexPrice : 0;

  // Estimate costs
  const gasUsdt = selectedQuote?.gasEstimateUsdt || 2; // Default $2 gas
  const dexFeeBps = 30; // 0.3% Uniswap fee
  const slippageBps = Math.min(suggestedSizeUsdt / 100, 50);
  const totalCostBps =
    dexFeeBps + slippageBps + (gasUsdt / suggestedSizeUsdt) * 10000;

  // Estimate benefit
  const gapReductionBps = Math.abs(deviationBps) * 0.5; // Assume 50% reduction
  const netBenefitBps = gapReductionBps - totalCostBps;
  const isEconomical = netBenefitBps >= config.minBenefitBps;

  // Format price
  const formatPrice = (price: number) => {
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-300">
          {marketTitle} Alignment
        </h4>
        <span
          className={`text-xs px-2 py-0.5 rounded border ${getBandBgColor(
            bandStatus
          )}`}
        >
          {bandStatus.toUpperCase()}
        </span>
      </div>

      {/* Price Comparison */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-xs text-slate-500">CEX Price ({cexSource})</div>
          <div className="font-mono text-lg text-slate-200">
            ${formatPrice(cexPrice)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">DEX Price (Uniswap)</div>
          <div className="font-mono text-lg text-blue-400">
            ${formatPrice(dexPrice)}
          </div>
        </div>
      </div>

      {/* Size Selector */}
      <div className="mb-4">
        <div className="text-xs text-slate-500 mb-1">Quote Size</div>
        <div className="flex gap-1 flex-wrap">
          {availableSizes.map((size) => (
            <button
              key={size}
              onClick={() => setSelectedSize(size)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedSize === size
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              ${size}
            </button>
          ))}
        </div>
      </div>

      {/* Deviation */}
      <div className="mb-4 p-3 rounded bg-slate-900/50">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-400">Price Deviation</span>
          <span
            className={`font-mono text-lg font-bold ${getBandColor(
              bandStatus
            )}`}
          >
            {deviationPercent > 0 ? "+" : ""}
            {deviationPercent.toFixed(2)}%
            <span className="text-xs ml-1">
              ({deviationBps.toFixed(0)} bps)
            </span>
          </span>
        </div>

        {/* Band Indicator */}
        <div className="mt-2 relative h-2 bg-slate-700 rounded overflow-hidden">
          <div
            className="absolute h-full bg-emerald-500/50"
            style={{
              left: `${50 - config.bands.neutralPercent * 10}%`,
              width: `${config.bands.neutralPercent * 20}%`,
            }}
          />
          <div
            className="absolute h-full bg-yellow-500/30"
            style={{
              left: `${50 - config.bands.softPercent * 10}%`,
              width: `${
                (config.bands.softPercent - config.bands.neutralPercent) * 10
              }%`,
            }}
          />
          <div
            className="absolute h-full bg-yellow-500/30"
            style={{
              left: `${50 + config.bands.neutralPercent * 10}%`,
              width: `${
                (config.bands.softPercent - config.bands.neutralPercent) * 10
              }%`,
            }}
          />
          {/* Current position marker */}
          <div
            className="absolute w-1 h-full bg-white"
            style={{
              left: `${Math.min(
                Math.max(50 + deviationPercent * 10, 0),
                100
              )}%`,
              transform: "translateX(-50%)",
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>-{config.bands.softPercent}%</span>
          <span>0</span>
          <span>+{config.bands.softPercent}%</span>
        </div>
      </div>

      {/* Suggested Action */}
      {bandStatus !== "neutral" && (
        <div className={`p-3 rounded border ${getBandBgColor(bandStatus)}`}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-medium text-slate-200">
              Suggested Action
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                direction === "buy_dex" ? "bg-emerald-600" : "bg-red-600"
              } text-white`}
            >
              {direction === "buy_dex" ? "BUY on DEX" : "SELL on DEX"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-500">Size:</span>
              <span className="ml-1 font-mono">
                ${suggestedSizeUsdt.toFixed(0)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Tokens:</span>
              <span className="ml-1 font-mono">
                {suggestedSizeTokens.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Est. Cost:</span>
              <span className="ml-1 font-mono">
                {totalCostBps.toFixed(0)} bps
              </span>
            </div>
            <div>
              <span className="text-slate-500">Net Benefit:</span>
              <span
                className={`ml-1 font-mono ${
                  netBenefitBps >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {netBenefitBps.toFixed(0)} bps
              </span>
            </div>
          </div>

          {!isEconomical && (
            <div className="mt-2 text-xs text-yellow-400">
              ⚠️ Trade may not be economical (net benefit &lt;{" "}
              {config.minBenefitBps} bps)
            </div>
          )}
        </div>
      )}

      {bandStatus === "neutral" && (
        <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          ✓ Price within tolerance band - no action needed
        </div>
      )}

      {/* Mode Indicator */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Mode: {config.mode.toUpperCase()}
        </span>
        <span className="text-slate-500">
          Bands: ±{config.bands.neutralPercent}% / ±{config.bands.softPercent}%
        </span>
      </div>
    </div>
  );
}
