/**
 * AppRouter - Handles routing between pages while preserving original App content
 */

import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import App from "./App";
import { ArbitragePage } from "./pages/ArbitragePage";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";

function Navigation() {
  return (
    <nav className="bg-slate-900/80 border-b border-slate-700/50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-center h-12">
        <div className="flex items-center gap-1">
          <NavLink
            to="/defense"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`
            }
          >
            🛡️ Defense
          </NavLink>
          <NavLink
            to="/arbitrage"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`
            }
          >
            📈 Arbitrage
          </NavLink>
          <NavLink
            to="/inventory"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`
            }
          >
            💰 Inventory
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`
            }
          >
            ⚙️ Settings
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

export default function AppRouter() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900">
      <Navigation />
      <Routes>
        <Route path="/defense" element={<App />} />
        <Route path="/arbitrage" element={<ArbitragePage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={<Navigate to="/defense" replace />} />
        <Route path="*" element={<Navigate to="/defense" replace />} />
      </Routes>
    </div>
  );
}
