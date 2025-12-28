/**
 * RecentSwaps - Displays recent on-chain swap transactions
 * Fetches from Uniswap v4 PoolManager Swap events
 */

import { useEffect, useState } from "react";

interface Swap {
  tx_hash: string;
  block_number: number;
  timestamp: number | null;
  time_iso: string | null;
  type: "BUY" | "SELL" | "SWAP";
  amount0: string;
  amount1: string;
  sender: string | null;
  etherscan_url: string;
  error?: string;
}

interface SwapsResponse {
  token: string;
  pool_id: string;
  swaps: Swap[];
  cached: boolean;
  cache_age_sec?: number;
  total_found?: number;
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

  const formatTime = (timestamp: number | null, timeIso: string | null) => {
    if (!timestamp && !timeIso) return "—";
    const date = timeIso ? new Date(timeIso) : new Date(timestamp! * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const shortenAddress = (addr: string | null) => {
    if (!addr) return "—";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const shortenTxHash = (hash: string) => {
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  };

  if (loading && !data) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <div className="text-slate-400 text-sm animate-pulse">
          Loading recent transactions...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <div className="text-red-400 text-sm">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700">
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">🔄</span>
          <span className="text-sm font-medium text-slate-300">
            Recent Swaps - {token}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {data?.cached && (
            <span className="bg-slate-700 px-2 py-0.5 rounded">
              cached {data.cache_age_sec}s
            </span>
          )}
          {data?.total_found !== undefined && (
            <span>{data.total_found} found</span>
          )}
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {data?.swaps && data.swaps.length > 0 ? (
          <table className="w-full text-xs">
            <thead className="bg-slate-900/50 sticky top-0">
              <tr className="text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Wallet</th>
                <th className="px-3 py-2 text-left font-medium">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data.swaps.map((swap, idx) => (
                <tr key={idx} className="hover:bg-slate-700/30">
                  <td className="px-3 py-2 text-slate-400">
                    {formatTime(swap.timestamp, swap.time_iso)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        swap.type === "BUY"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : swap.type === "SELL"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {swap.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">
                    {shortenAddress(swap.sender)}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={swap.etherscan_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      {shortenTxHash(swap.tx_hash)} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-6 text-center text-slate-500 text-sm">
            No recent swaps found for {token}
          </div>
        )}
      </div>
    </div>
  );
}
