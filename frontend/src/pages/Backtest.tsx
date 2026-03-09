import { useState } from "react";
import { FlaskConical, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { runBacktest } from "@/services/api";
import { PageHeader, Button, Alert, StatCard, Card } from "@/components/ui";
import type { BacktestResponse } from "@/types";

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

  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="space-y-6">
      <PageHeader title="Backtest" description="Testez vos strategies sur l'historique (2 saisons)" />

      {/* Parameters */}
      <Card>
        <h3 className="text-slate-900 font-semibold mb-3">Parametres</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Bankroll (e)</label>
            <input type="number" value={params.initial_bankroll}
              onChange={(e) => setParams({ ...params, initial_bankroll: Number(e.target.value) })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mise (%)</label>
            <input type="number" step="0.01" value={params.flat_stake}
              onChange={(e) => setParams({ ...params, flat_stake: Number(e.target.value) })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Edge min</label>
            <input type="number" step="0.01" value={params.min_edge}
              onChange={(e) => setParams({ ...params, min_edge: Number(e.target.value) })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Confiance min</label>
            <input type="number" step="0.05" value={params.min_model_prob}
              onChange={(e) => setParams({ ...params, min_model_prob: Number(e.target.value) })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cote min <span className="text-slate-400">(vide = tout)</span></label>
            <input type="number" step="0.1" placeholder="ex: 1.3"
              value={params.min_odds ?? ""}
              onChange={(e) => setParams({ ...params, min_odds: e.target.value ? Number(e.target.value) : null })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cote max <span className="text-slate-400">(vide = tout)</span></label>
            <input type="number" step="0.1" placeholder="ex: 2.5"
              value={params.max_odds ?? ""}
              onChange={(e) => setParams({ ...params, max_odds: e.target.value ? Number(e.target.value) : null })}
              className={inputCls} />
          </div>
        </div>

        {/* Combo mode */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <label className="flex items-center gap-2 text-sm text-slate-700 mb-3 cursor-pointer">
            <input type="checkbox" checked={params.combo_mode}
              onChange={(e) => setParams({ ...params, combo_mode: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            Mode Combis
          </label>
          {params.combo_mode && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max legs</label>
                <input type="number" min={2} max={4} value={params.combo_max_legs}
                  onChange={(e) => setParams({ ...params, combo_max_legs: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cote min combo</label>
                <input type="number" step="0.1" value={params.combo_min_odds}
                  onChange={(e) => setParams({ ...params, combo_min_odds: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cote max combo</label>
                <input type="number" step="0.1" value={params.combo_max_odds}
                  onChange={(e) => setParams({ ...params, combo_max_odds: Number(e.target.value) })}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Top N par jour</label>
                <input type="number" min={1} max={5} value={params.combo_top_n}
                  onChange={(e) => setParams({ ...params, combo_top_n: Number(e.target.value) })}
                  className={inputCls} />
              </div>
            </div>
          )}
        </div>

        <Button onClick={handleRun} loading={loading} icon={<FlaskConical size={16} />} className="mt-4">
          {loading ? "Calcul en cours..." : "Lancer le backtest"}
        </Button>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Results */}
      {result && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Paris" value={`${result.metrics.total_bets}`} size="sm" />
            <StatCard label="Taux reussite" value={`${(result.metrics.win_rate * 100).toFixed(1)}%`} size="sm" />
            <StatCard
              label="ROI"
              value={`${result.metrics.roi_pct >= 0 ? "+" : ""}${result.metrics.roi_pct.toFixed(1)}%`}
              color={result.metrics.roi_pct >= 0 ? "emerald" : "red"}
              size="sm"
            />
            <StatCard
              label="Profit"
              value={`${result.metrics.total_pnl >= 0 ? "+" : ""}${result.metrics.total_pnl.toFixed(2)}e`}
              color={result.metrics.total_pnl >= 0 ? "emerald" : "red"}
              size="sm"
            />
            <StatCard label="Bankroll finale" value={`${result.metrics.final_bankroll.toFixed(0)}e`} size="sm" />
            <StatCard label="Max drawdown" value={`${result.metrics.max_drawdown_pct.toFixed(1)}%`} color="red" size="sm" />
            <StatCard label="Serie pertes max" value={`${result.metrics.longest_losing_streak}`} size="sm" />
            <StatCard label="Cote moyenne" value={`${result.metrics.avg_odds.toFixed(2)}`} size="sm" />
          </div>

          {/* Chart */}
          <Card>
            <h3 className="text-slate-900 font-semibold mb-3">Evolution de la bankroll</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="bet" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
                    labelStyle={{ color: "#64748b" }}
                  />
                  <Line type="monotone" dataKey="bankroll" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Bets table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
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
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-slate-400 text-xs">{b.date}</td>
                    <td className="p-3 text-slate-900 text-xs">{b.match.length > 40 ? b.match.substring(0, 40) + "..." : b.match}</td>
                    <td className="p-3 text-center text-xs">{b.outcome_bet}{b.num_legs ? ` (${b.num_legs}x)` : ""}</td>
                    <td className="p-3 text-right text-amber-600 font-medium">{b.odds.toFixed(2)}</td>
                    <td className="p-3 text-right text-slate-700">{b.stake.toFixed(2)}e</td>
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
                    <td className="p-3 text-right text-slate-600">{b.bankroll_after.toFixed(0)}e</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.bets.length > 100 && (
              <div className="p-3 text-center text-slate-400 text-sm">
                Affichage des 100 premiers paris sur {result.bets.length}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
