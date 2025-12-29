/**
 * ArbitragePage - CEX↔DEX Arbitrage Execution
 * 
 * Goal: Profit from price differences between CEX and DEX
 * Modes: PAPER, MANUAL, AUTO
 * 
 * Shows:
 * - Opportunities with size-by-liquidity
 * - Expected PnL after costs
 * - Execution controls
 */

import { useEffect, useState } from "react";

interface Opportunity {
  market: string;
  cex_venue: string;
  cex_bid: number;
  cex_ask: number;
  cex_mid: number;
  cex_ts: string;
  dex_exec_price: number;
  dex_quote_size: number;
  dex_price_impact: number;
  dex_gas_usd: number;
  dex_ts: string;
  edge_bps: number;
  edge_usd: number;
  max_safe_size: number;
  direction: "BUY_DEX_SELL_CEX" | "BUY_CEX_SELL_DEX";
  is_actionable: boolean;
  reason: string;
}

interface ArbitrageState {
  mode: "PAPER" | "MANUAL" | "AUTO";
  kill_switch: boolean;
  opportunities: Opportunity[];
  last_update: string;
  daily_pnl: number;
  trades_today: number;
}

export function ArbitragePage() {
  const [state, setState] = useState<ArbitrageState>({
    mode: "PAPER",
    kill_switch: true,
    opportunities: [],
    last_update: "",
    daily_pnl: 0,
    trades_today: 0,
  });
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  // Fetch opportunities
  useEffect(() => {
    const fetchData = async () => {
      try {
        // For now, generate mock data - will be replaced with real API
        const mockOpps: Opportunity[] = [
          {
            market: "CSR/USDT",
            cex_venue: "LATOKEN",
            cex_bid: 0.00234,
            cex_ask: 0.00236,
            cex_mid: 0.00235,
            cex_ts: new Date().toISOString(),
            dex_exec_price: 0.00238,
            dex_quote_size: 500,
            dex_price_impact: 0.15,
            dex_gas_usd: 2.5,
            dex_ts: new Date().toISOString(),
            edge_bps: 127,
            edge_usd: 6.35,
            max_safe_size: 500,
            direction: "BUY_CEX_SELL_DEX",
            is_actionable: true,
            reason: "Edge exceeds threshold",
          },
          {
            market: "CSR25/USDT",
            cex_venue: "LBank",
            cex_bid: 0.000089,
            cex_ask: 0.000091,
            cex_mid: 0.00009,
            cex_ts: new Date().toISOString(),
            dex_exec_price: 0.0000885,
            dex_quote_size: 1000,
            dex_price_impact: 0.08,
            dex_gas_usd: 2.5,
            dex_ts: new Date().toISOString(),
            edge_bps: -167,
            edge_usd: -16.7,
            max_safe_size: 1000,
            direction: "BUY_DEX_SELL_CEX",
            is_actionable: false,
            reason: "Edge below threshold",
          },
        ];

        setState((prev) => ({
          ...prev,
          opportunities: mockOpps,
          last_update: new Date().toISOString(),
        }));
      } catch (err) {
        console.error("Failed to fetch arbitrage data:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number): string => {
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };

  const handleModeChange = (mode: "PAPER" | "MANUAL" | "AUTO") => {
    if (mode === "AUTO" && state.kill_switch) {
      alert("Cannot enable AUTO mode while kill switch is active");
      return;
    }
    setState((prev) => ({ ...prev, mode }));
  };

  const handleExecute = (opp: Opportunity) => {
    if (state.kill_switch) {
      alert("Kill switch is active - cannot execute");
      return;
    }
    if (state.mode === "PAPER") {
      console.log("Paper trade executed:", opp);
      alert(`PAPER TRADE: ${opp.direction} ${opp.market} - $${opp.max_safe_size}`);
    } else if (state.mode === "MANUAL") {
      setSelectedOpp(opp);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">📈 CEX↔DEX Arbitrage</h1>
            <p className="text-slate-400 text-sm">
              Profit from price differences between exchanges
            </p>
          </div>

          {/* Mode & Controls */}
          <div className="flex items-center gap-4">
            {/* Mode Selector */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              {(["PAPER", "MANUAL", "AUTO"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  disabled={mode === "AUTO"}
                  title={
                    mode === "PAPER"
                      ? "Simulate trades without real execution"
                      : mode === "MANUAL"
                      ? "Confirm each trade before execution"
                      : "Automatic execution (coming soon)"
                  }
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                    state.mode === mode
                      ? mode === "PAPER"
                        ? "bg-yellow-600 text-white"
                        : mode === "MANUAL"
                        ? "bg-blue-600 text-white"
                        : "bg-green-600 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-700"
                  } ${mode === "AUTO" ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Kill Switch */}
            <button
              onClick={() => setState((prev) => ({ ...prev, kill_switch: !prev.kill_switch }))}
              title={state.kill_switch ? "Resume trading" : "Stop all trading"}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                state.kill_switch
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-emerald-600 text-white"
              }`}
            >
              {state.kill_switch ? "🛑 STOPPED" : "🟢 ACTIVE"}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-slate-900/50 border-b border-slate-800 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500">Mode:</span>
            <span className={`ml-2 font-medium ${
              state.mode === "PAPER" ? "text-yellow-400" : 
              state.mode === "MANUAL" ? "text-blue-400" : "text-green-400"
            }`}>
              {state.mode}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Daily P&L:</span>
            <span className={`ml-2 font-mono ${state.daily_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              ${state.daily_pnl.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Trades Today:</span>
            <span className="ml-2 font-mono text-white">{state.trades_today}</span>
          </div>
          <div className="ml-auto text-slate-500 text-xs">
            Last update: {state.last_update ? new Date(state.last_update).toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Opportunities Table */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold">Arbitrage Opportunities</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr className="text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium">CEX</th>
                  <th className="px-4 py-3 font-medium text-right">CEX Bid/Ask</th>
                  <th className="px-4 py-3 font-medium text-right">DEX Price</th>
                  <th className="px-4 py-3 font-medium text-right">Edge</th>
                  <th className="px-4 py-3 font-medium text-right">Max Size</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {state.opportunities.map((opp, idx) => (
                  <tr
                    key={idx}
                    className={`${opp.is_actionable ? "hover:bg-slate-800/30" : "opacity-50"}`}
                  >
                    <td className="px-4 py-3 font-medium">{opp.market}</td>
                    <td className="px-4 py-3 text-slate-400">{opp.cex_venue}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className="text-emerald-400">${formatPrice(opp.cex_bid)}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-red-400">${formatPrice(opp.cex_ask)}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-blue-400">
                      ${formatPrice(opp.dex_exec_price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`font-mono font-medium ${opp.edge_bps >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {opp.edge_bps >= 0 ? "+" : ""}{opp.edge_bps} bps
                      </div>
                      <div className={`text-xs ${opp.edge_usd >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                        ${opp.edge_usd.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">${opp.max_safe_size}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        opp.direction === "BUY_DEX_SELL_CEX"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {opp.direction.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {opp.is_actionable ? (
                        <button
                          onClick={() => handleExecute(opp)}
                          disabled={state.kill_switch}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            state.kill_switch
                              ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                              : "bg-blue-600 text-white hover:bg-blue-500"
                          }`}
                        >
                          {state.mode === "PAPER" ? "Simulate" : "Execute"}
                        </button>
                      ) : (
                        <span className="text-slate-500 text-xs">{opp.reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {state.opportunities.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-500">
              No opportunities found. Waiting for data...
            </div>
          )}
        </div>

        {/* Execution Confirmation Modal */}
        {selectedOpp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold mb-4">Confirm Trade Execution</h3>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-slate-400">Market:</span>
                  <span className="font-medium">{selectedOpp.market}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Direction:</span>
                  <span className="font-medium">{selectedOpp.direction.replace(/_/g, " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Size:</span>
                  <span className="font-mono">${selectedOpp.max_safe_size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Expected Edge:</span>
                  <span className={`font-mono ${selectedOpp.edge_usd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    ${selectedOpp.edge_usd.toFixed(2)} ({selectedOpp.edge_bps} bps)
                  </span>
                </div>
              </div>

              <div className="bg-yellow-900/30 border border-yellow-600/30 rounded-lg p-3 mb-6">
                <p className="text-yellow-400 text-sm">
                  ⚠️ This will execute real trades. Ensure you have sufficient balances.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedOpp(null)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    console.log("Executing trade:", selectedOpp);
                    alert("Trade execution not yet implemented");
                    setSelectedOpp(null);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                >
                  Confirm Execute
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
