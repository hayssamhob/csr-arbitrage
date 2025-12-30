/**
 * ReadinessScore - Visual widget showing system readiness based on acceptance criteria
 * Shows pass/fail status for each key requirement
 */

import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://trade.depollutenow.com";

interface CheckResult {
  name: string;
  passed: boolean;
  reason?: string;
  category: "data" | "execution" | "auth" | "monitoring";
}

interface ReadinessData {
  score: number;
  totalChecks: number;
  passedChecks: number;
  checks: CheckResult[];
  ts: string;
}

export function ReadinessScore() {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const runChecks = async (): Promise<ReadinessData> => {
    const checks: CheckResult[] = [];
    const now = new Date().toISOString();

    // Check 1: Backend API reachable
    try {
      const res = await fetch(`${API_URL}/api/health`, { timeout: 5000 } as any);
      const data = await res.json();
      checks.push({
        name: "Backend API",
        passed: res.ok && data.overall_status !== "error",
        reason: res.ok ? "API responding" : "API unreachable",
        category: "monitoring",
      });
    } catch {
      checks.push({ name: "Backend API", passed: false, reason: "Connection failed", category: "monitoring" });
    }

    // Check 2: System status endpoint
    try {
      const res = await fetch(`${API_URL}/api/system/status`, { timeout: 5000 } as any);
      const statusData = await res.json();
      const healthyCount = statusData.services?.filter((s: any) => s.status === "ok").length || 0;
      const totalServices = statusData.services?.length || 0;
      checks.push({
        name: "Service Health",
        passed: healthyCount >= totalServices * 0.5,
        reason: `${healthyCount}/${totalServices} services healthy`,
        category: "monitoring",
      });
    } catch {
      checks.push({ name: "Service Health", passed: false, reason: "Status unavailable", category: "monitoring" });
    }

    // Check 3: CEX data (LBank or LATOKEN)
    try {
      const res = await fetch(`${API_URL}/api/dashboard`, { timeout: 5000 } as any);
      const dashData = await res.json();
      const hasLbank = dashData.market_state?.csr25_usdt?.lbank_ticker?.bid > 0;
      const hasLatoken = dashData.market_state?.csr_usdt?.latoken_ticker?.bid > 0;
      checks.push({
        name: "CEX Data",
        passed: hasLbank || hasLatoken,
        reason: hasLbank && hasLatoken ? "Both exchanges" : hasLbank ? "LBank only" : hasLatoken ? "LATOKEN only" : "No data",
        category: "data",
      });
    } catch {
      checks.push({ name: "CEX Data", passed: false, reason: "Dashboard unavailable", category: "data" });
    }

    // Check 4: DEX quotes (scraper)
    try {
      const res = await fetch(`${API_URL}/api/scraper/quotes`, { timeout: 5000 } as any);
      const quoteData = await res.json();
      const validQuotes = quoteData.quotes?.filter((q: any) => q.valid).length || 0;
      checks.push({
        name: "DEX Quotes",
        passed: validQuotes > 0,
        reason: validQuotes > 0 ? `${validQuotes} valid quotes` : "No valid quotes",
        category: "data",
      });
    } catch {
      checks.push({ name: "DEX Quotes", passed: false, reason: "Scraper unavailable", category: "data" });
    }

    // Check 5: Alignment calculations
    try {
      const res = await fetch(`${API_URL}/api/alignment`, { timeout: 5000 } as any);
      const alignData = await res.json();
      const hasCsr = alignData.csr_usdt?.deviation_pct !== null;
      const hasCsr25 = alignData.csr25_usdt?.deviation_pct !== null;
      checks.push({
        name: "Alignment Engine",
        passed: hasCsr || hasCsr25,
        reason: hasCsr && hasCsr25 ? "Both markets" : hasCsr ? "CSR only" : hasCsr25 ? "CSR25 only" : "No calculations",
        category: "execution",
      });
    } catch {
      checks.push({ name: "Alignment Engine", passed: false, reason: "Alignment unavailable", category: "execution" });
    }

    // Check 6: Auth configured (Supabase)
    try {
      const authData = localStorage.getItem("auth");
      checks.push({
        name: "Authentication",
        passed: !!authData,
        reason: authData ? "User logged in" : "Not logged in",
        category: "auth",
      });
    } catch {
      checks.push({ name: "Authentication", passed: false, reason: "Auth check failed", category: "auth" });
    }

    const passedChecks = checks.filter((c) => c.passed).length;
    const score = Math.round((passedChecks / checks.length) * 100);

    return {
      score,
      totalChecks: checks.length,
      passedChecks,
      checks,
      ts: now,
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const result = await runChecks();
      setData(result);
      setLoading(false);
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
        <div className="animate-pulse text-slate-400 text-sm">Checking readiness...</div>
      </div>
    );
  }

  if (!data) return null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500/10 border-emerald-500/30";
    if (score >= 50) return "bg-amber-500/10 border-amber-500/30";
    return "bg-red-500/10 border-red-500/30";
  };

  const getCategoryIcon = (category: CheckResult["category"]) => {
    switch (category) {
      case "data": return "📊";
      case "execution": return "⚡";
      case "auth": return "🔐";
      case "monitoring": return "👁️";
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${getScoreBg(data.score)}`}>
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-bold ${getScoreColor(data.score)}`}>
            {data.score}%
          </div>
          <div>
            <div className="text-sm font-medium text-white">Readiness Score</div>
            <div className="text-xs text-slate-400">
              {data.passedChecks}/{data.totalChecks} checks passing
            </div>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50">
          <div className="mt-3 space-y-2">
            {data.checks.map((check, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                  check.passed ? "bg-emerald-500/5" : "bg-red-500/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{getCategoryIcon(check.category)}</span>
                  <span className="text-sm text-white">{check.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{check.reason}</span>
                  <span className={check.passed ? "text-emerald-400" : "text-red-400"}>
                    {check.passed ? "✓" : "✗"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-xs text-slate-500 text-center">
            Last checked: {new Date(data.ts).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
