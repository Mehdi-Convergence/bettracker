import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Search,
  FlaskConical,
  ArrowRight,
  Trophy,
  BarChart3,
  Wallet,
} from "lucide-react";
import { getPortfolioStats } from "@/services/api";
import type { PortfolioStats } from "@/types";

/* ─── Stat Card with colored icon background ─── */
function KPICard({
  label,
  value,
  subtitle,
  icon,
  iconBg,
  iconColor,
  trend,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1.5 ${
            trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-slate-900"
          }`}>
            {value}
          </p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`${iconBg} ${iconColor} w-10 h-10 rounded-lg flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ─── Quick Action Card ─── */
function ActionCard({
  to,
  icon,
  iconBg,
  iconColor,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
    >
      <div className="flex items-start gap-4">
        <div className={`${iconBg} ${iconColor} w-10 h-10 rounded-lg flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
    </Link>
  );
}

/* ─── Strategy row ─── */
function StrategyRow({
  rank,
  name,
  roi,
  result,
  isLast,
}: {
  rank: number;
  name: string;
  roi: string;
  result: string;
  isLast?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 py-3.5 ${!isLast ? "border-b border-slate-100" : ""}`}>
      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{name}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-emerald-600">{roi}</p>
        <p className="text-xs text-slate-400">{result}</p>
      </div>
    </div>
  );
}

/* ─── Dashboard ─── */
export default function Dashboard() {
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPortfolioStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pnl = stats?.total_pnl ?? 0;
  const roi = stats?.roi_pct ?? 0;
  const winRate = stats ? (stats.win_rate * 100).toFixed(1) : "—";
  const totalBets = stats?.total_bets ?? 0;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Vue d'ensemble de votre activite</p>
      </div>

      {/* KPI Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm animate-pulse">
              <div className="h-3 w-20 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-24 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Profit / Perte"
            value={`${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} €`}
            icon={pnl >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            iconBg={pnl >= 0 ? "bg-emerald-50" : "bg-red-50"}
            iconColor={pnl >= 0 ? "text-emerald-600" : "text-red-500"}
            trend={pnl >= 0 ? "up" : "down"}
          />
          <KPICard
            label="Taux de reussite"
            value={`${winRate}%`}
            subtitle={`${stats?.won ?? 0}W / ${stats?.lost ?? 0}L`}
            icon={<Target size={18} />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <KPICard
            label="ROI"
            value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`}
            icon={<BarChart3 size={18} />}
            iconBg={roi >= 0 ? "bg-emerald-50" : "bg-red-50"}
            iconColor={roi >= 0 ? "text-emerald-600" : "text-red-500"}
            trend={roi >= 0 ? "up" : "down"}
          />
          <KPICard
            label="Paris places"
            value={`${totalBets}`}
            subtitle={`${stats?.pending_bets ?? 0} en cours`}
            icon={<Zap size={18} />}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Actions rapides</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard
            to="/scanner"
            icon={<Search size={18} />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            title="Scanner"
            description="Detecter les value bets du jour"
          />
          <ActionCard
            to="/backtest"
            icon={<FlaskConical size={18} />}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            title="Backtest"
            description="Simuler sur l'historique 2 saisons"
          />
          <ActionCard
            to="/portfolio"
            icon={<Wallet size={18} />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            title="Portfolio"
            description="Suivre vos paris et performances"
          />
        </div>
      </div>

      {/* Best Strategies */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Trophy size={16} className="text-amber-500" />
          <h2 className="font-semibold text-slate-900">Meilleures strategies (backtest)</h2>
        </div>
        <div className="px-5">
          <StrategyRow rank={1} name="Combis 2 legs, prob 60%+, cotes 1.8-3.0" roi="+12.5% ROI" result="200 € → 549 €" />
          <StrategyRow rank={2} name="Combis 2 legs, prob 55%+, cotes 1.8-3.0" roi="+10.7% ROI" result="200 € → 532 €" />
          <StrategyRow rank={3} name="Simple, prob 55%+, edge 3%+" roi="+4.1% ROI" result="200 € → 407 €" isLast />
        </div>
        <div className="px-5 py-3 border-t border-slate-100">
          <Link to="/backtest" className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
            Voir tous les backtests <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
