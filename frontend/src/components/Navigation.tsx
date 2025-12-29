/**
 * Navigation - Top navigation bar with page links
 * 
 * Routes:
 * - /defense - DEX Price Defense (alignment)
 * - /arbitrage - CEX↔DEX Arbitrage
 * - /inventory - Balances & Risk
 * - /settings - Configuration
 */

import { NavLink } from "react-router-dom";

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  description: string;
}

function NavItem({ to, icon, label, description }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
          isActive
            ? "bg-blue-600 text-white"
            : "text-slate-400 hover:text-white hover:bg-slate-800"
        }`
      }
      title={description}
    >
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

export function Navigation() {
  return (
    <nav className="bg-slate-900 border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3">
            <span className="text-xl">⚡</span>
            <span className="font-bold text-white">CSR Trading</span>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            <NavItem
              to="/defense"
              icon="🛡️"
              label="Defense"
              description="DEX Price Defense - Keep Uniswap price aligned with CEX"
            />
            <NavItem
              to="/arbitrage"
              icon="📈"
              label="Arbitrage"
              description="CEX↔DEX Arbitrage - Profit from price differences"
            />
            <NavItem
              to="/inventory"
              icon="💰"
              label="Inventory"
              description="Balances & Risk - View holdings across venues"
            />
            <NavItem
              to="/settings"
              icon="⚙️"
              label="Settings"
              description="Configuration - API keys, limits, thresholds"
            />
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400">Live</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
