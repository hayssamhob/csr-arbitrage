/**
 * GlobalStatusBar - Always Visible at Top
 * 
 * Shows:
 * - Per-service health with explicit reason strings
 * - Data freshness timestamps (CEX <30s, DEX <60s)
 * - Execution mode + kill switch
 */

export interface ServiceStatus {
  name: string;
  status: "ok" | "warning" | "error" | "offline";
  lastUpdate: string;
  reason?: string; // Explicit reason when not OK
  ageSeconds?: number; // Data age in seconds
  isStale?: boolean; // True if data exceeds freshness threshold
}

interface GlobalStatusBarProps {
  services: ServiceStatus[];
  lastDataUpdate: Date;
}

// Note: Freshness thresholds (CEX: 30s, DEX: 60s) are applied in App.tsx

export function GlobalStatusBar({ services, lastDataUpdate }: GlobalStatusBarProps) {
  const allHealthy = services.every((s) => s.status === "ok" && !s.isStale);
  const hasErrors = services.some(
    (s) => s.status === "error" || s.status === "offline"
  );
  const staleServices = services.filter((s) => s.isStale);

  const getStatusColor = (
    status: ServiceStatus["status"],
    isStale?: boolean
  ) => {
    if (isStale) return "bg-amber-500";
    switch (status) {
      case "ok":
        return "bg-emerald-500";
      case "warning":
        return "bg-amber-500";
      case "error":
        return "bg-red-500";
      case "offline":
        return "bg-slate-600";
    }
  };

  const getStatusGlow = (
    status: ServiceStatus["status"],
    isStale?: boolean
  ) => {
    if (isStale) return "shadow-[0_0_8px_rgba(245,158,11,0.5)]";
    switch (status) {
      case "ok":
        return "shadow-[0_0_8px_rgba(16,185,129,0.5)]";
      case "warning":
        return "shadow-[0_0_8px_rgba(245,158,11,0.5)]";
      case "error":
        return "shadow-[0_0_8px_rgba(239,68,68,0.6)]";
      case "offline":
        return "";
    }
  };

  const timeSinceUpdate = () => {
    const seconds = Math.floor((Date.now() - lastDataUpdate.getTime()) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  const getStatusSummary = () => {
    if (allHealthy) return "All Systems Operational";

    const issues: string[] = [];
    services.forEach((s) => {
      if (s.status === "error" || s.status === "offline") {
        issues.push(`${s.name}: ${s.reason || "offline"}`);
      } else if (s.isStale) {
        issues.push(`${s.name}: stale (${s.ageSeconds}s)`);
      }
    });

    if (issues.length === 0 && staleServices.length > 0) {
      return `Stale: ${staleServices.map((s) => s.name).join(", ")}`;
    }

    return issues.length > 0 ? issues[0] : "Checking...";
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      {/* System Health Summary */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className={`w-3 h-3 rounded-full ${
              allHealthy
                ? "bg-emerald-500"
                : hasErrors
                ? "bg-red-500"
                : "bg-amber-500"
            } ${
              allHealthy
                ? "shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                : hasErrors
                ? "shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                : "shadow-[0_0_12px_rgba(245,158,11,0.5)]"
            }`}
          />
          {(allHealthy || hasErrors) && (
            <div
              className={`absolute inset-0 w-3 h-3 rounded-full animate-ping ${
                allHealthy ? "bg-emerald-500/50" : "bg-red-500/50"
              }`}
            />
          )}
        </div>
        <div>
          <span
            className={`text-sm font-bold ${
              allHealthy
                ? "text-emerald-400"
                : hasErrors
                ? "text-red-400"
                : "text-amber-400"
            }`}
          >
            {getStatusSummary()}
          </span>
        </div>
      </div>

      {/* Service Grid */}
      <div className="flex flex-wrap items-center gap-2">
        {services.map((service) => (
          <div
            key={service.name}
            className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 cursor-default ${
              service.status === "ok" && !service.isStale
                ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                : service.status === "error" || service.status === "offline"
                ? "bg-red-500/5 border-red-500/30 hover:border-red-500/50"
                : "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
            }`}
            title={`${service.name}: ${service.status}${
              service.isStale ? " (STALE)" : ""
            }${service.reason ? ` - ${service.reason}` : ""} | Age: ${
              service.ageSeconds || "?"
            }s`}
          >
            <div
              className={`w-2 h-2 rounded-full ${getStatusColor(
                service.status,
                service.isStale
              )} ${getStatusGlow(service.status, service.isStale)}`}
            />
            <span
              className={`text-xs font-medium ${
                service.status === "ok" && !service.isStale
                  ? "text-emerald-400/80"
                  : service.status === "error" || service.status === "offline"
                  ? "text-red-400/80"
                  : "text-amber-400/80"
              }`}
            >
              {service.name}
            </span>
            {service.ageSeconds !== undefined && service.ageSeconds < 999 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                  service.status === "ok" && !service.isStale
                    ? "bg-emerald-500/10 text-emerald-500/60"
                    : service.status === "error" || service.status === "offline"
                    ? "bg-red-500/10 text-red-500/60"
                    : "bg-amber-500/10 text-amber-500/60"
                }`}
              >
                {service.ageSeconds}s
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Last Update */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/30 border border-slate-700/50"
        title="Time since last data refresh from all sources."
      >
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Updated
        </span>
        <span className="text-xs font-mono text-slate-300">
          {timeSinceUpdate()}
        </span>
      </div>
    </div>
  );
}
