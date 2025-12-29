/**
 * RecentSwaps - Displays recent on-chain swap transactions
 * Fetches from Etherscan API for full token transfer history
 */

import { useEffect, useState } from "react";

interface Swap {
  tx_hash: string;
  block_number: number;
  timestamp: number;
  time_ago: string;
  time_iso: string;
  type: string;
  is_dex_swap: boolean;
  token_amount: number;
  token_amount_formatted: string;
  wallet: string;
  wallet_full: string;
  from: string;
  to: string;
  etherscan_url: string;
}

interface SwapsResponse {
  token: string;
  token_address: string;
  swaps: Swap[];
  cached: boolean;
  cache_age_sec?: number;
  total_transfers?: number;
  dex_swaps?: number;
  error?: string;
}

interface RecentSwapsProps {
  token: "CSR" | "CSR25";
}

export function RecentSwaps({ token }: RecentSwapsProps) {
  const [data, setData] = useState<SwapsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSwaps = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/swaps/${token}`);
        const json = await response.json();

        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
          setError(null);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSwaps();
    const interval = setInterval(fetchSwaps, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [token]);

  const shortenTxHash = (hash: string) => {
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  };

  if (loading && !data) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-slate-800/50 flex items-center justify-center">
            <span className="text-sm">🔄</span>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200 block">
              Recent Activity
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              {token}
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
            <span className="text-sm">❌</span>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200 block">
              Recent Activity
            </span>
            <span className="text-[10px] text-red-400 font-medium">
              Error: {error}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-800/50 flex items-center justify-center">
            <span className="text-sm">🔄</span>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200 block">
              Recent Activity
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              {token}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.cached && (
            <span className="text-[10px] px-2 py-1 rounded-lg bg-slate-800/50 text-slate-500 border border-slate-700/30">
              {data.cache_age_sec}s ago
            </span>
          )}
          {data?.dex_swaps !== undefined && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400">
              {data.dex_swaps} swaps
            </span>
          )}
        </div>
      </div>

      {/* Swaps List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {data?.swaps && data.swaps.length > 0 ? (
          data.swaps.map((swap, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-950/30 border border-slate-800/30 hover:border-slate-700/50 transition-all duration-200 group"
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                    swap.type.startsWith("Buy")
                      ? "bg-emerald-500/10 text-emerald-400"
                      : swap.type.startsWith("Sell")
                      ? "bg-red-500/10 text-red-400"
                      : "bg-slate-500/10 text-slate-400"
                  }`}
                >
                  {swap.type}
                </span>
                <span className="text-[10px] text-slate-500">
                  {swap.time_ago}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm font-bold text-white">
                  {swap.token_amount_formatted}{" "}
                  <span className="text-slate-500 font-normal text-xs">
                    {token}
                  </span>
                </div>
                <a
                  href={swap.etherscan_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-blue-400/70 hover:text-blue-400 transition-colors flex items-center gap-1"
                >
                  {shortenTxHash(swap.tx_hash)}
                  <span className="opacity-50 group-hover:opacity-100">↗</span>
                </a>
              </div>
              <div className="mt-2 text-[10px] text-slate-600 font-mono truncate">
                {swap.wallet}
              </div>
            </div>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/30 mx-auto mb-3 flex items-center justify-center">
                <span className="text-slate-600 text-xl">📭</span>
              </div>
              <span className="text-sm text-slate-500">
                No recent swaps for {token}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Link */}
      {data?.token_address && (
        <div className="pt-4 mt-4 border-t border-slate-800/30">
          <a
            href={`https://etherscan.io/token/${data.token_address}?a=0x000000000004444c5dc75cb358380d2e3de08a90`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-xs text-blue-400/70 hover:text-blue-400 transition-colors group"
          >
            <span>View all on Etherscan</span>
            <span className="opacity-50 group-hover:opacity-100">↗</span>
          </a>
        </div>
      )}
    </div>
  );
}
