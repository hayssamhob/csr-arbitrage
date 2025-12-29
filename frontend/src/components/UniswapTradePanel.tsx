import { useState } from "react";

// Uniswap swap URLs per token - using #/swap route with field+value for amount prefill
// Per Uniswap docs: https://docs.uniswap.org/contracts/v1/guides/custom-linking
const UNISWAP_URLS = {
  CSR: "https://app.uniswap.org/#/swap?inputCurrency=0xdAC17F958D2ee523a2206206994597C13D831ec7&outputCurrency=0x75Ecb52e403C617679FBd3e77A50f9d10A842387",
  CSR25:
    "https://app.uniswap.org/#/swap?inputCurrency=0xdAC17F958D2ee523a2206206994597C13D831ec7&outputCurrency=0x502E7230E142A332DFEd1095F7174834b2548982",
} as const;

interface UniswapTradePanelProps {
  token: "CSR" | "CSR25";
  direction: "buy" | "sell";
  dexPrice: number;
  cexPrice: number;
  recommendedAmount?: number;
  onClose: () => void;
}

export function UniswapTradePanel({
  token,
  direction,
  dexPrice,
  cexPrice,
  recommendedAmount,
  onClose,
}: UniswapTradePanelProps) {
  // Use recommended amount as default, fall back to 100
  const [amount, setAmount] = useState(recommendedAmount?.toString() || "100");

  const inputToken = direction === "buy" ? "USDT" : token;
  const outputToken = direction === "buy" ? token : "USDT";

  // Calculate estimated output based on DEX price
  const estimatedOutput =
    direction === "buy"
      ? dexPrice > 0
        ? (parseFloat(amount) / dexPrice).toFixed(2)
        : "—"
      : (parseFloat(amount) * dexPrice).toFixed(4);

  // Calculate price deviation
  const deviation =
    cexPrice > 0 ? (((dexPrice - cexPrice) / cexPrice) * 100).toFixed(2) : "0";

  // Build URL with amount pre-filled using field=input&value=X
  // Per Uniswap docs: both field and value must be set
  const baseUrl = UNISWAP_URLS[token];
  const uniswapUrl = `${baseUrl}&field=input&value=${amount}`;

  return (
    <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl overflow-hidden relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
      >
        ✕
      </button>

      <div className="mb-6">
        <h3 className="text-xl font-black text-white mb-1">
          {direction === "buy" ? "🟢 Buy" : "🔴 Sell"} {token}
        </h3>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
          Uniswap v3 Execution
        </p>
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
          <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-1">
            DEX Price
          </span>
          <span className="text-white font-mono text-lg font-bold">
            ${dexPrice.toFixed(6)}
          </span>
        </div>
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
          <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-1">
            CEX Price
          </span>
          <span className="text-white font-mono text-lg font-bold">
            ${cexPrice.toFixed(6)}
          </span>
        </div>
        <div
          className="col-span-2 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 flex justify-between items-center"
          title="Percentage difference between the Uniswap execution price and the centralized exchange reference price."
        >
          <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
            Price Deviation ⓘ
          </span>
          <span
            className={`font-mono font-black text-lg ${
              parseFloat(deviation) > 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {parseFloat(deviation) > 0 ? "+" : ""}
            {deviation}%
          </span>
        </div>
      </div>

      {/* Amount Input */}
      <div className="mb-6">
        <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2 block">
          Trade Amount ({inputToken})
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-slate-950 text-white px-5 py-4 rounded-2xl border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none font-mono text-xl font-bold transition-all"
            placeholder="100"
          />
          <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
            USDT
          </div>
        </div>
      </div>

      {/* Estimated Output */}
      <div className="bg-emerald-500/5 p-5 rounded-2xl border border-emerald-500/20 mb-8">
        <div className="flex justify-between items-end">
          <div>
            <span className="text-emerald-500/70 text-[10px] font-black uppercase tracking-widest block mb-1">
              Estimated Output
            </span>
            <div className="text-white text-3xl font-black font-mono leading-none">
              {estimatedOutput}{" "}
              <span className="text-lg opacity-50">{outputToken}</span>
            </div>
          </div>
          <div className="text-emerald-500/40 text-[10px] font-bold text-right">
            Slippage: 0.5%
            <br />
            Includes LP Fee
          </div>
        </div>
      </div>

      {/* Single action: Open in Uniswap */}
      <a
        href={uniswapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white py-4 rounded-2xl font-black text-center shadow-xl shadow-emerald-900/20 transition-all active:scale-[0.98]"
      >
        REVIEW ON UNISWAP ↗
      </a>

      <div className="mt-6 text-center">
        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">
          Final execution happens on official Uniswap UI
        </p>
      </div>
    </div>
  );
}
