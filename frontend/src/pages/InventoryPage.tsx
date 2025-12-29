/**
 * InventoryPage - Balances & Risk Management
 * 
 * Shows:
 * - Balances across: Wallet + LBank + LATOKEN
 * - Exposure limits
 * - Current open positions
 */

import { useEffect, useState } from "react";

interface VenueBalance {
  venue: string;
  asset: string;
  available: number;
  locked: number;
  total: number;
  usd_value: number;
}

interface InventoryState {
  balances: VenueBalance[];
  total_usd: number;
  exposure: {
    max_per_trade_usd: number;
    max_daily_usd: number;
    used_daily_usd: number;
  };
  last_update: string;
}

export function InventoryPage() {
  const [state, setState] = useState<InventoryState>({
    balances: [],
    total_usd: 0,
    exposure: {
      max_per_trade_usd: 1000,
      max_daily_usd: 10000,
      used_daily_usd: 0,
    },
    last_update: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        // Mock data - will be replaced with real API
        const mockBalances: VenueBalance[] = [
          { venue: "Wallet", asset: "ETH", available: 0.5, locked: 0, total: 0.5, usd_value: 1750 },
          { venue: "Wallet", asset: "USDT", available: 5000, locked: 0, total: 5000, usd_value: 5000 },
          { venue: "Wallet", asset: "CSR", available: 100000, locked: 0, total: 100000, usd_value: 235 },
          { venue: "Wallet", asset: "CSR25", available: 500000, locked: 0, total: 500000, usd_value: 45 },
          { venue: "LBank", asset: "USDT", available: 2000, locked: 0, total: 2000, usd_value: 2000 },
          { venue: "LBank", asset: "CSR25", available: 200000, locked: 0, total: 200000, usd_value: 18 },
          { venue: "LATOKEN", asset: "USDT", available: 1500, locked: 0, total: 1500, usd_value: 1500 },
          { venue: "LATOKEN", asset: "CSR", available: 50000, locked: 0, total: 50000, usd_value: 117.5 },
        ];

        const totalUsd = mockBalances.reduce((sum, b) => sum + b.usd_value, 0);

        setState({
          balances: mockBalances,
          total_usd: totalUsd,
          exposure: {
            max_per_trade_usd: 1000,
            max_daily_usd: 10000,
            used_daily_usd: 0,
          },
          last_update: new Date().toISOString(),
        });
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch inventory:", err);
        setLoading(false);
      }
    };

    fetchInventory();
    const interval = setInterval(fetchInventory, 30000);
    return () => clearInterval(interval);
  }, []);

  const venues = ["Wallet", "LBank", "LATOKEN"];
  const getVenueBalances = (venue: string) => state.balances.filter((b) => b.venue === venue);
  const getVenueTotal = (venue: string) =>
    state.balances.filter((b) => b.venue === venue).reduce((sum, b) => sum + b.usd_value, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold">💰 Inventory & Risk</h1>
          <p className="text-slate-400 text-sm">Balances across venues and exposure limits</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
            <div className="text-slate-400 text-sm mb-1">Total Value</div>
            <div className="text-2xl font-bold font-mono">${state.total_usd.toLocaleString()}</div>
          </div>
          <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
            <div className="text-slate-400 text-sm mb-1">Max Per Trade</div>
            <div className="text-2xl font-bold font-mono">${state.exposure.max_per_trade_usd}</div>
          </div>
          <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
            <div className="text-slate-400 text-sm mb-1">Daily Limit</div>
            <div className="text-2xl font-bold font-mono">${state.exposure.max_daily_usd}</div>
          </div>
          <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
            <div className="text-slate-400 text-sm mb-1">Used Today</div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              ${state.exposure.used_daily_usd}
            </div>
            <div className="mt-1 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${(state.exposure.used_daily_usd / state.exposure.max_daily_usd) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Venue Balances */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {venues.map((venue) => (
            <div key={venue} className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>
                    {venue === "Wallet" ? "🔐" : venue === "LBank" ? "🏦" : "🏛️"}
                  </span>
                  <span className="font-semibold">{venue}</span>
                </div>
                <span className="text-sm text-slate-400">
                  ${getVenueTotal(venue).toLocaleString()}
                </span>
              </div>

              <div className="divide-y divide-slate-700/50">
                {getVenueBalances(venue).map((balance, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{balance.asset}</div>
                      <div className="text-xs text-slate-500">
                        {balance.locked > 0 && `${balance.locked.toLocaleString()} locked`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">{balance.available.toLocaleString()}</div>
                      <div className="text-xs text-slate-400">${balance.usd_value.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                {getVenueBalances(venue).length === 0 && (
                  <div className="px-4 py-6 text-center text-slate-500 text-sm">
                    No balances
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Risk Limits */}
        <div className="mt-6 bg-slate-900/50 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold mb-4">Risk Limits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-slate-400 text-sm">Max Order Size</div>
              <div className="font-mono text-lg">${state.exposure.max_per_trade_usd}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-slate-400 text-sm">Max Daily Volume</div>
              <div className="font-mono text-lg">${state.exposure.max_daily_usd}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-slate-400 text-sm">Min Edge (bps)</div>
              <div className="font-mono text-lg">50</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-slate-400 text-sm">Max Slippage (bps)</div>
              <div className="font-mono text-lg">100</div>
            </div>
          </div>
        </div>

        {/* Last Update */}
        <div className="mt-4 text-center text-slate-500 text-xs">
          Last updated: {state.last_update ? new Date(state.last_update).toLocaleString() : "—"}
        </div>
      </div>
    </div>
  );
}
