/**
 * SettingsPage - Configuration
 */

import { useState } from "react";

interface Settings {
  limits: {
    max_order_usdt: number;
    max_daily_volume_usdt: number;
    min_edge_bps: number;
    max_slippage_bps: number;
  };
  defense: {
    band_bps: number;
    max_impact_pct: number;
  };
  api_status: {
    lbank_configured: boolean;
    latoken_configured: boolean;
  };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    limits: {
      max_order_usdt: 1000,
      max_daily_volume_usdt: 10000,
      min_edge_bps: 50,
      max_slippage_bps: 100,
    },
    defense: {
      band_bps: 200,
      max_impact_pct: 1.0,
    },
    api_status: {
      lbank_configured: false,
      latoken_configured: false,
    },
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    alert("Settings saved (mock)");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold">⚙️ Settings</h1>
          <p className="text-slate-400 text-sm">Configure trading parameters</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Risk Limits */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold mb-4">Risk Limits</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Max Order (USDT)</label>
              <input
                type="number"
                value={settings.limits.max_order_usdt}
                onChange={(e) => setSettings(s => ({...s, limits: {...s.limits, max_order_usdt: +e.target.value}}))}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Max Daily (USDT)</label>
              <input
                type="number"
                value={settings.limits.max_daily_volume_usdt}
                onChange={(e) => setSettings(s => ({...s, limits: {...s.limits, max_daily_volume_usdt: +e.target.value}}))}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Min Edge (bps)</label>
              <input
                type="number"
                value={settings.limits.min_edge_bps}
                onChange={(e) => setSettings(s => ({...s, limits: {...s.limits, min_edge_bps: +e.target.value}}))}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Max Slippage (bps)</label>
              <input
                type="number"
                value={settings.limits.max_slippage_bps}
                onChange={(e) => setSettings(s => ({...s, limits: {...s.limits, max_slippage_bps: +e.target.value}}))}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* Defense Settings */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold mb-4">Defense Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Alignment Band (bps)</label>
              <input
                type="number"
                value={settings.defense.band_bps}
                onChange={(e) => setSettings(s => ({...s, defense: {...s.defense, band_bps: +e.target.value}}))}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Max Impact (%)</label>
              <input
                type="number"
                step="0.1"
                value={settings.defense.max_impact_pct}
                onChange={(e) => setSettings(s => ({...s, defense: {...s.defense, max_impact_pct: +e.target.value}}))}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* API Status */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold mb-4">API Connections</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
              <span>LBank API</span>
              <span className={settings.api_status.lbank_configured ? "text-emerald-400" : "text-red-400"}>
                {settings.api_status.lbank_configured ? "✓ Configured" : "✗ Not configured"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
              <span>LATOKEN API</span>
              <span className={settings.api_status.latoken_configured ? "text-emerald-400" : "text-red-400"}>
                {settings.api_status.latoken_configured ? "✓ Configured" : "✗ Not configured"}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">API keys are stored securely on the server</p>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
