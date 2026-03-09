import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Target, Zap } from "lucide-react";
import { getPortfolioStats } from "@/services/api";
import { PageHeader, StatCard, Card } from "@/components/ui";
import type { PortfolioStats } from "@/types";

export default function Dashboard() {
  const [stats, setStats] = useState<PortfolioStats | null>(null);

  useEffect(() => {
    getPortfolioStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Vue d'ensemble de votre activite" />

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Profit/Perte"
          value={stats ? `${stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl.toFixed(2)}e` : "0e"}
          icon={stats && stats.total_pnl >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          color={stats && stats.total_pnl >= 0 ? "emerald" : "red"}
        />
        <StatCard
          label="Taux de reussite"
          value={stats ? `${(stats.win_rate * 100).toFixed(1)}%` : "-"}
          icon={<Target size={18} />}
          color="blue"
        />
        <StatCard
          label="ROI"
          value={stats ? `${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%` : "-"}
          icon={<TrendingUp size={18} />}
          color={stats && stats.roi_pct >= 0 ? "emerald" : "red"}
        />
        <StatCard
          label="Paris places"
          value={stats ? `${stats.total_bets}` : "0"}
          icon={<Zap size={18} />}
          color="purple"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/scanner"
          className="bg-white border border-slate-200 rounded-lg p-6 hover:border-blue-400 hover:shadow-md transition-all shadow-sm"
        >
          <h3 className="text-slate-900 font-semibold mb-1">Scanner les matchs</h3>
          <p className="text-slate-500 text-sm">Detecter les value bets du jour</p>
        </Link>
        <Link
          to="/backtest"
          className="bg-white border border-slate-200 rounded-lg p-6 hover:border-blue-400 hover:shadow-md transition-all shadow-sm"
        >
          <h3 className="text-slate-900 font-semibold mb-1">Tester une strategie</h3>
          <p className="text-slate-500 text-sm">Simuler sur l'historique 2 saisons</p>
        </Link>
      </div>

      {/* Backtest highlights */}
      <Card>
        <h3 className="text-slate-900 font-semibold mb-3">Meilleures strategies (backtest)</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Combis 2 legs, prob 60%+, cotes 1.8-3.0</span>
            <span className="text-emerald-600 font-semibold">+12.5% ROI, 200e -&gt; 549e</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Combis 2 legs, prob 55%+, cotes 1.8-3.0</span>
            <span className="text-emerald-600 font-semibold">+10.7% ROI, 200e -&gt; 532e</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-600">Simple, prob 55%+, edge 3%+</span>
            <span className="text-emerald-600 font-semibold">+4.1% ROI, 200e -&gt; 407e</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
