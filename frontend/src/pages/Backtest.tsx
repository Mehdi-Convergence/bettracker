import { useState } from "react";
import { FlaskConical, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { runBacktest } from "../services/api";
import type { BacktestResponse } from "../types";

export default function Backtest() {
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [params, setParams] = useState({
    initial_bankroll: 200,
    flat_stake: 0.05,
    min_edge: 0.02,
    min_model_prob: 0.55,
    min_odds: null as number | null,
    max_odds: null as number | null,
    combo_mode: false,
    combo_max_legs: 2,
    combo_min_odds: 1.8,
    combo_max_odds: 3.0,
    combo_top_n: 2,
  });

  async function handleRun() {
    setLoading(true);
    setError("");
    try {
      const data = await runBacktest(params);
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }

  const chartData = result?.bankroll_curve.map((v, i) => ({ bet: i, bankroll: v })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Backtest</h2>
        <p className="text-gray-500 text-sm">Testez vos strategies sur l'historique (2 saisons)</p>
      </div>

      {/* Parameters */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <h3 className="text-gray-900 font-semibold mb-3">Parametres</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bankroll (e)</label>
            <input
              type="number"
              value={params.initial_bankroll}
              onChange={(e) => setParams({ ...params, initial_bankroll: Number(e.target.value) })}
              className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mise (%)</label>
            <input
              type="number"
              step="0.01"
              value={params.flat_stake}
              onChange={(e) => setParams({ ...params, flat_stake: Number(e.target.value) })}
              className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Edge min</label>
            <input
              type="number"
              step="0.01"
              value={params.min_edge}
              onChange={(e) => setParams({ ...params, min_edge: Number(e.target.value) })}
              className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Confiance min</label>
            <input
              type="number"
              step="0.05"
              value={params.min_model_prob}
              onChange={(e) => setParams({ ...params, min_model_prob: Number(e.target.value) })}
              className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cote min <span className="text-gray-400">(vide = tout)</span></label>
            <input
              type="number"
              step="0.1"
              placeholder="ex: 1.3"
              value={params.min_odds ?? ""}
              onChange={(e) => setParams({ ...params, min_odds: e.target.value ? Number(e.target.value) : null })}
              className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cote max <span className="text-gray-400">(vide = tout)</span></label>
            <input
              type="number"
              step="0.1"
              placeholder="ex: 2.5"
              value={params.max_odds ?? ""}
              onChange={(e) => setParams({ ...params, max_odds: e.target.value ? Number(e.target.value) : null })}
              className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Combo mode */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={params.combo_mode}
              onChange={(e) => setParams({ ...params, combo_mode: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Mode Combis
          </label>
          {params.combo_mode && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max legs</label>
                <input
                  type="number"
                  min={2}
                  max={4}
                  value={params.combo_max_legs}
                  onChange={(e) => setParams({ ...params, combo_max_legs: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cote min combo</label>
                <input
                  type="number"
                  step="0.1"
                  value={params.combo_min_odds}
                  onChange={(e) => setParams({ ...params, combo_min_odds: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cote max combo</label>
                <input
                  type="number"
                  step="0.1"
                  value={params.combo_max_odds}
                  onChange={(e) => setParams({ ...params, combo_max_odds: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Top N par jour</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={params.combo_top_n}
                  onChange={(e) => setParams({ ...params, combo_top_n: Number(e.target.value) })}
                  className="bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleRun}
          disabled={loading}
          className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 font-medium shadow-sm transition-colors"
        >
          <FlaskConical size={16} />
          {loading ? "Calcul en cours..." : "Lancer le backtest"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Paris" value={`${result.metrics.total_bets}`} />
            <MetricCard label="Taux reussite" value={`${(result.metrics.win_rate * 100).toFixed(1)}%`} />
            <MetricCard
              label="ROI"
              value={`${result.metrics.roi_pct >= 0 ? "+" : ""}${result.metrics.roi_pct.toFixed(1)}%`}
              color={result.metrics.roi_pct >= 0 ? "text-emerald-600" : "text-red-500"}
            />
            <MetricCard
              label="Profit"
              value={`${result.metrics.total_pnl >= 0 ? "+" : ""}${result.metrics.total_pnl.toFixed(2)}e`}
              color={result.metrics.total_pnl >= 0 ? "text-emerald-600" : "text-red-500"}
            />
            <MetricCard label="Bankroll finale" value={`${result.metrics.final_bankroll.toFixed(0)}e`} />
            <MetricCard label="Max drawdown" value={`${result.metrics.max_drawdown_pct.toFixed(1)}%`} color="text-red-500" />
            <MetricCard label="Serie pertes max" value={`${result.metrics.longest_losing_streak}`} />
            <MetricCard label="Cote moyenne" value={`${result.metrics.avg_odds.toFixed(2)}`} />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <h3 className="text-gray-900 font-semibold mb-3">Evolution de la bankroll</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="bet" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
                    labelStyle={{ color: "#6b7280" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bankroll"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bets table */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Match</th>
                  <th className="p-3 font-medium">Pari</th>
                  <th className="p-3 text-right font-medium">Cote</th>
                  <th className="p-3 text-right font-medium">Mise</th>
                  <th className="p-3 text-center font-medium">Resultat</th>
                  <th className="p-3 text-right font-medium">P/L</th>
                  <th className="p-3 text-right font-medium">Bankroll</th>
                </tr>
              </thead>
              <tbody>
                {result.bets.slice(0, 100).map((b, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-gray-400 text-xs">{b.date}</td>
                    <td className="p-3 text-gray-900 text-xs">{b.match.length > 40 ? b.match.substring(0, 40) + "..." : b.match}</td>
                    <td className="p-3 text-center text-xs">{b.outcome_bet}{b.num_legs ? ` (${b.num_legs}x)` : ""}</td>
                    <td className="p-3 text-right text-amber-600 font-medium">{b.odds.toFixed(2)}</td>
                    <td className="p-3 text-right text-gray-700">{b.stake.toFixed(2)}e</td>
                    <td className="p-3 text-center">
                      {b.won ? (
                        <TrendingUp size={14} className="inline text-emerald-600" />
                      ) : (
                        <TrendingDown size={14} className="inline text-red-500" />
                      )}
                    </td>
                    <td className={`p-3 text-right font-semibold ${b.pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {b.pnl >= 0 ? "+" : ""}{b.pnl.toFixed(2)}e
                    </td>
                    <td className="p-3 text-right text-gray-600">{b.bankroll_after.toFixed(0)}e</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.bets.length > 100 && (
              <div className="p-3 text-center text-gray-400 text-sm">
                Affichage des 100 premiers paris sur {result.bets.length}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, color = "text-gray-900" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
