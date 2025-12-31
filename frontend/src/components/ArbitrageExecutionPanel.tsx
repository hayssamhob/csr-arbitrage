/**
 * ArbitrageExecutionPanel - Professional-grade simultaneous execution interface
 * 
 * Shows both legs of the arbitrage trade side by side:
 * - Leg 1: BUY on one platform
 * - Leg 2: SELL on another platform
 * 
 * Displays fees, expected profit, and execution buttons for each leg
 */

import { useState } from "react";

interface Opportunity {
  market: string;
  cex_venue: string;
  cex_bid: number;
  cex_ask: number;
  cex_mid: number;
  dex_exec_price: number;
  edge_bps: number;
  edge_usd: number;
  max_safe_size: number;
  direction: "BUY_DEX_SELL_CEX" | "BUY_CEX_SELL_DEX";
}

interface ArbitrageExecutionPanelProps {
  opportunity: Opportunity;
  onClose: () => void;
  mode: "PAPER" | "MANUAL" | "AUTO";
}

// Fee estimates (in basis points and fixed USD)
const FEES = {
  CEX_TRADING_FEE_BPS: 10, // 0.1% typical CEX fee
  DEX_LP_FEE_BPS: 30, // 0.3% Uniswap V3/V4 fee
  DEX_GAS_USD: 0.50, // Estimated gas cost
  CEX_WITHDRAWAL_USD: 1.00, // Typical withdrawal fee
};

function getExchangeUrl(venue: string, market: string): string {
  const token = market.split("/")[0];
  const urls: Record<string, Record<string, string>> = {
    LATOKEN: { CSR: "https://latoken.com/exchange/CSR_USDT" },
    LBank: { CSR25: "https://www.lbank.com/trade/csr25_usdt/" },
  };
  return urls[venue]?.[token] || "#";
}

function getDexUrl(market: string): string {
  const token = market.split("/")[0];
  const urls: Record<string, string> = {
    CSR: "https://app.uniswap.org/swap?inputCurrency=0xdac17f958d2ee523a2206206994597c13d831ec7&outputCurrency=0x6bba316c48b49bd1eac44573c5c871ff02958469",
    CSR25: "https://app.uniswap.org/swap?inputCurrency=0xdac17f958d2ee523a2206206994597c13d831ec7&outputCurrency=0x0f5c78f152152dda52a2ea45b0a8c10733010748",
  };
  return urls[token] || "#";
}

export function ArbitrageExecutionPanel({ opportunity: opp, onClose, mode }: ArbitrageExecutionPanelProps) {
  const [tradeSize, setTradeSize] = useState(Math.min(100, opp.max_safe_size));
  const [leg1Executed, setLeg1Executed] = useState(false);
  const [leg2Executed, setLeg2Executed] = useState(false);
  
  const token = opp.market.split("/")[0];
  const isBuyDexFirst = opp.direction === "BUY_DEX_SELL_CEX";
  
  // Calculate trade details
  const tokenAmount = tradeSize / (isBuyDexFirst ? opp.dex_exec_price : opp.cex_ask);
  
  // Fee calculations
  const cexFeeUsd = (tradeSize * FEES.CEX_TRADING_FEE_BPS) / 10000;
  const dexFeeUsd = (tradeSize * FEES.DEX_LP_FEE_BPS) / 10000;
  const totalFees = cexFeeUsd + dexFeeUsd + FEES.DEX_GAS_USD;
  
  // Profit calculation
  const grossProfit = (opp.edge_bps / 10000) * tradeSize;
  const netProfit = grossProfit - totalFees;
  const netProfitBps = Math.round((netProfit / tradeSize) * 10000);
  
  // Leg details
  const leg1 = isBuyDexFirst
    ? { action: "BUY", venue: "Uniswap", price: opp.dex_exec_price, url: getDexUrl(opp.market) }
    : { action: "BUY", venue: opp.cex_venue, price: opp.cex_ask, url: getExchangeUrl(opp.cex_venue, opp.market) };
  
  const leg2 = isBuyDexFirst
    ? { action: "SELL", venue: opp.cex_venue, price: opp.cex_bid, url: getExchangeUrl(opp.cex_venue, opp.market) }
    : { action: "SELL", venue: "Uniswap", price: opp.dex_exec_price, url: getDexUrl(opp.market) };

  const handleLeg1Execute = () => {
    window.open(leg1.url, "_blank");
    setLeg1Executed(true);
  };

  const handleLeg2Execute = () => {
    window.open(leg2.url, "_blank");
    setLeg2Executed(true);
  };

  const bothLegsExecuted = leg1Executed && leg2Executed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-4xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                ⚡ Execute Arbitrage: {token}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {mode === "PAPER" ? "Paper Trading Mode" : "Manual Execution Mode"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Trade Size Selector */}
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-4">
            <label className="text-sm text-slate-400">Trade Size (USDT):</label>
            <input
              type="range"
              min={10}
              max={Math.min(1000, opp.max_safe_size)}
              value={tradeSize}
              onChange={(e) => setTradeSize(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <input
              type="number"
              value={tradeSize}
              onChange={(e) => setTradeSize(Math.min(opp.max_safe_size, Math.max(10, Number(e.target.value))))}
              className="w-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-center font-mono"
            />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            ≈ {tokenAmount.toFixed(4)} {token} | Max: ${opp.max_safe_size.toFixed(0)}
          </div>
        </div>
        
        {/* Two-Leg Execution Panel */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LEG 1 */}
          <div className={`rounded-xl border-2 p-5 transition-all ${
            leg1Executed 
              ? "border-emerald-500/50 bg-emerald-500/5" 
              : "border-slate-600 hover:border-emerald-500/30"
          }`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Step 1</span>
              {leg1Executed && <span className="text-xs text-emerald-400 font-bold">✓ OPENED</span>}
            </div>
            
            <div className={`text-3xl font-black mb-2 ${
              leg1.action === "BUY" ? "text-emerald-400" : "text-red-400"
            }`}>
              {leg1.action === "BUY" ? "🛒" : "💸"} {leg1.action}
            </div>
            
            <div className="text-lg font-bold text-white mb-1">{leg1.venue}</div>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Price:</span>
                <span className="font-mono text-white">${leg1.price.toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Amount:</span>
                <span className="font-mono text-white">{tokenAmount.toFixed(4)} {token}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Value:</span>
                <span className="font-mono text-white">${tradeSize.toFixed(2)}</span>
              </div>
            </div>
            
            <button
              onClick={handleLeg1Execute}
              disabled={leg1Executed}
              className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
                leg1Executed
                  ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                  : leg1.action === "BUY"
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25"
                  : "bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/25"
              }`}
            >
              {leg1Executed ? "✓ Opened" : `Open ${leg1.venue}`}
            </button>
          </div>
          
          {/* ARROW CONNECTOR */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="bg-slate-800 rounded-full p-3 border border-slate-600">
              <span className="text-2xl">→</span>
            </div>
          </div>
          
          {/* LEG 2 */}
          <div className={`rounded-xl border-2 p-5 transition-all ${
            leg2Executed 
              ? "border-emerald-500/50 bg-emerald-500/5" 
              : leg1Executed 
              ? "border-amber-500/50 animate-pulse"
              : "border-slate-600 opacity-50"
          }`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Step 2</span>
              {leg2Executed && <span className="text-xs text-emerald-400 font-bold">✓ OPENED</span>}
              {leg1Executed && !leg2Executed && <span className="text-xs text-amber-400 font-bold animate-pulse">READY</span>}
            </div>
            
            <div className={`text-3xl font-black mb-2 ${
              leg2.action === "BUY" ? "text-emerald-400" : "text-red-400"
            }`}>
              {leg2.action === "BUY" ? "🛒" : "💸"} {leg2.action}
            </div>
            
            <div className="text-lg font-bold text-white mb-1">{leg2.venue}</div>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Price:</span>
                <span className="font-mono text-white">${leg2.price.toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Amount:</span>
                <span className="font-mono text-white">{tokenAmount.toFixed(4)} {token}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Value:</span>
                <span className="font-mono text-white">${(tokenAmount * leg2.price).toFixed(2)}</span>
              </div>
            </div>
            
            <button
              onClick={handleLeg2Execute}
              disabled={!leg1Executed || leg2Executed}
              className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
                leg2Executed
                  ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                  : !leg1Executed
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : leg2.action === "SELL"
                  ? "bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/25"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25"
              }`}
            >
              {leg2Executed ? "✓ Opened" : !leg1Executed ? "Complete Step 1 First" : `Open ${leg2.venue}`}
            </button>
          </div>
        </div>
        
        {/* Profit Summary */}
        <div className="px-6 py-4 bg-slate-800/50 border-t border-slate-700">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-xs text-slate-500 mb-1">Gross Profit</div>
              <div className={`font-bold font-mono ${grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                ${grossProfit.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">CEX Fee</div>
              <div className="font-mono text-amber-400">-${cexFeeUsd.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">DEX Fee + Gas</div>
              <div className="font-mono text-amber-400">-${(dexFeeUsd + FEES.DEX_GAS_USD).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Total Fees</div>
              <div className="font-mono text-red-400">-${totalFees.toFixed(2)}</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-2">
              <div className="text-xs text-slate-500 mb-1">Net Profit</div>
              <div className={`text-xl font-bold font-mono ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                ${netProfit.toFixed(2)}
                <span className="text-xs ml-1">({netProfitBps}bps)</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Completion Status */}
        {bothLegsExecuted && (
          <div className="px-6 py-4 bg-emerald-500/10 border-t border-emerald-500/30">
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl">✅</span>
              <span className="text-emerald-400 font-bold">
                Both trading windows opened! Complete your trades on each platform.
              </span>
            </div>
          </div>
        )}
        
        {/* Warning */}
        <div className="px-6 py-3 bg-amber-500/10 text-amber-400 text-xs text-center">
          ⚠️ Execute trades quickly to lock in the spread. Prices may change.
        </div>
      </div>
    </div>
  );
}
