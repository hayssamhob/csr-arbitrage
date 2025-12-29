/**
 * Activity & Notification Panel
 * Displays recent pool trades, market updates, and notifications
 */

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface PoolTrade {
  id: string;
  token: "CSR" | "CSR25";
  type: "swap" | "add_liquidity" | "remove_liquidity";
  amount_in: number;
  amount_out: number;
  price_usdt: number;
  tx_hash: string;
  timestamp: string;
  wallet_short: string;
}

interface Notification {
  id: string;
  type: "price_alert" | "large_trade" | "market_update" | "system";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface ActivityNotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityNotificationPanel({
  isOpen,
  onClose,
}: ActivityNotificationPanelProps) {
  const [activeTab, setActiveTab] = useState<"activity" | "notification">(
    "activity"
  );
  const [trades, setTrades] = useState<PoolTrade[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "activity") {
        const { data, error } = await supabase
          .from("pool_trades")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);

        if (!error && data) {
          setTrades(data as PoolTrade[]);
        }
      } else {
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);

        if (!error && data) {
          setNotifications(data as Notification[]);
        }
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getTradeIcon = (type: string) => {
    switch (type) {
      case "swap":
        return "🔄";
      case "add_liquidity":
        return "➕";
      case "remove_liquidity":
        return "➖";
      default:
        return "📊";
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "price_alert":
        return "📈";
      case "large_trade":
        return "🐋";
      case "market_update":
        return "📰";
      case "system":
        return "⚙️";
      default:
        return "🔔";
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-4 top-20 w-80 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl z-50 overflow-hidden">
        {/* Header with tabs */}
        <div className="flex border-b border-slate-700/50">
          <button
            onClick={() => setActiveTab("activity")}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
              activeTab === "activity"
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab("notification")}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
              activeTab === "notification"
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            Notification
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-slate-500 text-sm">Loading...</p>
            </div>
          ) : activeTab === "activity" ? (
            trades.length > 0 ? (
              <div className="divide-y divide-slate-800/50">
                {trades.map((trade) => (
                  <div
                    key={trade.id}
                    className="p-3 hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg">{getTradeIcon(trade.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">
                            {trade.token} {trade.type.replace("_", " ")}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {formatTime(trade.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          ${trade.amount_in.toFixed(2)} → {trade.amount_out.toFixed(4)} {trade.token}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {trade.wallet_short}
                          </span>
                          <a
                            href={`https://etherscan.io/tx/${trade.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-500 hover:text-emerald-400"
                          >
                            View tx →
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="text-4xl mb-3">📭</span>
                <p className="text-slate-500 text-sm">No recent activity</p>
                <p className="text-slate-600 text-xs mt-1">
                  Pool trades will appear here
                </p>
              </div>
            )
          ) : notifications.length > 0 ? (
            <div className="divide-y divide-slate-800/50">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 hover:bg-slate-800/30 transition-colors ${
                    !notif.read ? "bg-emerald-500/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">
                      {getNotificationIcon(notif.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatTime(notif.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="text-4xl mb-3">🔔</span>
              <p className="text-slate-500 text-sm">No notifications</p>
              <p className="text-slate-600 text-xs mt-1">
                You're all caught up!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/50 p-2">
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
