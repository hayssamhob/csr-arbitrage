/**
 * App - Main routing component
 */

import { Navigate, Route, Routes } from "react-router-dom";
import { Navigation } from "./components/Navigation";
import { ArbitragePage } from "./pages/ArbitragePage";
import { DefensePage } from "./pages/DefensePage";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Navigation />
      <Routes>
        <Route path="/defense" element={<DefensePage />} />
        <Route path="/arbitrage" element={<ArbitragePage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={<Navigate to="/defense" replace />} />
        <Route path="*" element={<Navigate to="/defense" replace />} />
      </Routes>
    </div>
  );
}
