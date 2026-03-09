import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  DollarSign,
  CheckSquare,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Flag,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPortfolioStats,
  getPortfolioHistory,
  getPortfolioBets,
  getDashboardSummary,
  getCampaigns,
} from "@/services/api";
import type { PortfolioStats, Bet, Campaign } from "@/types";

/* ── Period helpers ── */
const PERIODS = [
  { key: "7d", label: "7j", days: 7 },
  { key: "30d", label: "30j", days: 30 },
  { key: "90d", label: "90j", days: 90 },
  { key: "all", label: "Tout", days: 0 },
] as const;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

/* ── Types ── */
interface HistoryPoint {
  date: string;
  cumulative_pnl: number;
  roi_pct: number;
}

interface DashSummary {
  active_campaigns: number;
  pending_bets: number;
  recent_results: { won: number; lost: number };
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.display_name?.split(" ")[0] || "Bettor";

  const [period, setPeriod] = useState<string>("30d");
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [recentBets, setRecentBets] = useState<Bet[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [summary, setSummary] = useState<DashSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = PERIODS.find((x) => x.key === period)!;
    const fromDate = p.days > 0 ? daysAgo(p.days) : undefined;

    Promise.all([
      getPortfolioStats(fromDate).catch(() => null),
      getPortfolioHistory(fromDate).catch(() => []),
      getPortfolioBets().catch(() => []),
      getDashboardSummary().catch(() => null),
      getCampaigns().catch(() => []),
    ]).then(([s, h, bets, sum, camps]) => {
      setStats(s as PortfolioStats | null);
      setHistory((h as HistoryPoint[]) || []);
      setRecentBets(((bets as Bet[]) || []).slice(0, 5));
      setSummary(sum as DashSummary | null);
      setCampaigns((camps as Campaign[]) || []);
      setLoading(false);
    });
  }, [period]);

  const roi = stats?.roi_pct ?? 0;
  const prevRoi = (stats as PortfolioStats & { prev_roi_pct?: number })?.prev_roi_pct;
  const roiDelta = prevRoi != null ? roi - prevRoi : null;
  const totalStaked = stats?.total_staked ?? 0;
  const totalBets = stats?.total_bets ?? 0;
  const pendingBets = stats?.pending_bets ?? 0;
  const winRate = stats ? stats.win_rate * 100 : 0;
  const won = stats?.won ?? 0;
  const lost = stats?.lost ?? 0;
  const activeCampaigns = campaigns.filter((c) => c.status === "active");

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* ── HEADER ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-[#111318]">
            Bonjour, {firstName}
          </h1>
          <p className="text-[12.5px] text-[#8a919e] mt-0.5">
            Voici un apercu de vos performances · Semaine {getWeekNumber()}
          </p>
        </div>
        {/* Period pills */}
        <div className="flex gap-1 bg-[#f4f5f7] border border-[#e3e6eb] rounded-[9px] p-[3px]">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3.5 py-[5px] rounded-[7px] text-[12px] font-medium cursor-pointer transition-all border-none whitespace-nowrap ${
                period === p.key
                  ? "bg-white text-[#111318] font-semibold shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
                  : "bg-transparent text-[#8a919e] hover:text-[#3c4149]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ALERT BANNER (campaigns) ── */}
      {activeCampaigns.length > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-[10px]"
          style={{
            background: "linear-gradient(90deg, rgba(59,91,219,0.06), rgba(59,91,219,0.02))",
            border: "1px solid rgba(59,91,219,0.18)",
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(59,91,219,0.07)" }}
          >
            <Flag size={16} className="text-[#3b5bdb]" />
          </div>
          <div className="flex-1 text-[13px]">
            <strong className="text-[#3b5bdb]">
              {activeCampaigns.length} campagne{activeCampaigns.length > 1 ? "s" : ""} active{activeCampaigns.length > 1 ? "s" : ""}
            </strong>
            {" — "}
            <span className="text-[#8a919e] text-[12px]">
              {activeCampaigns.map((c) => c.name).join(" · ")}
            </span>
          </div>
          <Link
            to="/campaign"
            className="px-3.5 py-[7px] rounded-lg bg-[#3b5bdb] text-white text-[12px] font-semibold no-underline whitespace-nowrap transition-all hover:bg-[#2f4ac7]"
          >
            Voir les campagnes →
          </Link>
        </div>
      )}

      {/* ── KPI ROW ── */}
      {loading ? (
        <div className="grid grid-cols-4 gap-3.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e3e6eb] p-[18px_20px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] animate-pulse">
              <div className="h-3 w-16 bg-[#e3e6eb] rounded mb-3" />
              <div className="h-7 w-20 bg-[#e3e6eb] rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3.5">
          {/* ROI global */}
          <KPICard
            label="ROI global"
            value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`}
            valueColor={roi >= 0 ? "#12b76a" : "#f04438"}
            icon={<TrendingUp size={15} />}
            iconBg={roi >= 0 ? "rgba(18,183,106,0.08)" : "rgba(240,68,56,0.07)"}
            iconColor={roi >= 0 ? "#12b76a" : "#f04438"}
            delta={roiDelta != null ? `${roiDelta >= 0 ? "+" : ""}${roiDelta.toFixed(1)}% vs mois dernier` : undefined}
            deltaUp={roiDelta != null ? roiDelta >= 0 : undefined}
          />
          {/* Mise totale */}
          <KPICard
            label="Mise totale"
            value={`${totalStaked.toLocaleString("fr-FR")}€`}
            icon={<DollarSign size={15} />}
            iconBg="rgba(59,91,219,0.07)"
            iconColor="#3b5bdb"
          />
          {/* Tickets */}
          <KPICard
            label="Tickets ce mois"
            value={`${totalBets}`}
            icon={<CheckSquare size={15} />}
            iconBg="rgba(247,144,9,0.08)"
            iconColor="#f79009"
            delta={pendingBets > 0 ? `dont ${pendingBets} en attente` : undefined}
          />
          {/* Taux de réussite */}
          <KPICard
            label="Taux de réussite"
            value={`${winRate.toFixed(1)}%`}
            valueColor={winRate >= 50 ? "#12b76a" : "#f04438"}
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            iconBg="rgba(18,183,106,0.08)"
            iconColor="#12b76a"
          />
        </div>
      )}

      {/* ── MIDDLE ROW ── */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1fr 340px" }}>
        {/* ROI Curve */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <TrendingUp size={14} className="text-[#3b5bdb]" />
              Evolution du ROI
            </div>
          </div>
          <div className="p-5">
            <ROIChart data={history} />
          </div>
        </div>

        {/* Tickets récents */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <CheckSquare size={14} className="text-[#3b5bdb]" />
              Tickets récents
            </div>
            <Link
              to="/portfolio"
              className="px-3 py-1.5 rounded-[7px] border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[12px] font-medium no-underline transition-all hover:border-[#cdd1d9] hover:text-[#3c4149]"
            >
              Voir tout
            </Link>
          </div>
          <div className="px-4 py-2">
            {recentBets.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#b0b7c3]">
                Aucun ticket pour le moment
              </div>
            ) : (
              recentBets.map((bet, i) => (
                <div
                  key={bet.id}
                  className={`flex items-center gap-3 py-3 ${i < recentBets.length - 1 ? "border-b border-[#e3e6eb]" : ""}`}
                >
                  <div
                    className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[14px] shrink-0"
                    style={{ background: bet.sport === "tennis" ? "#fff3e0" : "#e8f5e9" }}
                  >
                    {bet.sport === "tennis" ? "🎾" : "⚽"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#111318] truncate">
                      {bet.home_team} vs {bet.away_team}
                    </div>
                    <div className="text-[11.5px] text-[#8a919e] mt-px">
                      {bet.league} · {bet.outcome_bet}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[12px] font-semibold text-[#3c4149]">
                      x{bet.odds_at_bet.toFixed(2)}
                    </div>
                    <StatusBadge result={bet.result} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Performance par sport */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Performance par sport
            </div>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10px] font-semibold"
              style={{ background: "rgba(59,91,219,0.07)", color: "#3b5bdb" }}
            >
              {PERIODS.find((p) => p.key === period)?.label || "30j"}
            </span>
          </div>
          <div className="p-5">
            <SportBars bets={recentBets} allBets={stats} />
          </div>
        </div>

        {/* Répartition des résultats */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Répartition des résultats
            </div>
          </div>
          <div className="p-5">
            <DonutChart won={won} lost={lost} pending={pendingBets} total={totalBets} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════════ */

/* ── KPI Card ── */
function KPICard({
  label,
  value,
  valueColor,
  icon,
  iconBg,
  iconColor,
  delta,
  deltaUp,
}: {
  label: string;
  value: string;
  valueColor?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  delta?: string;
  deltaUp?: boolean;
}) {
  return (
    <div className="bg-white border border-[#e3e6eb] rounded-xl p-[18px_20px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] hover:shadow-[0_4px_16px_rgba(16,24,40,0.08)] transition-shadow flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#8a919e]">{label}</span>
        <div
          className="w-[30px] h-[30px] rounded-lg flex items-center justify-center"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
      </div>
      <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: valueColor || "#111318" }}>
        {value}
      </div>
      {delta && (
        <div
          className="flex items-center gap-1 text-[11.5px] font-semibold"
          style={{ color: deltaUp === false ? "#f04438" : deltaUp === true ? "#12b76a" : "#8a919e" }}
        >
          {deltaUp === true && <ChevronUp size={12} />}
          {deltaUp === false && <ChevronDown size={12} />}
          {delta}
        </div>
      )}
    </div>
  );
}

/* ── Status Badge ── */
function StatusBadge({ result }: { result: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    won: { label: "Gagné", bg: "rgba(18,183,106,0.08)", color: "#12b76a" },
    lost: { label: "Perdu", bg: "rgba(240,68,56,0.07)", color: "#f04438" },
    pending: { label: "En attente", bg: "rgba(247,144,9,0.08)", color: "#f79009" },
  };
  const c = config[result] || config.pending;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10.5px] font-semibold mt-0.5"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

/* ── ROI Chart (SVG sparkline) ── */
function ROIChart({ data }: { data: HistoryPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="h-[160px] flex items-center justify-center text-[13px] text-[#b0b7c3]">
        Pas assez de données pour la courbe
      </div>
    );
  }

  const W = 600;
  const H = 140;
  const pad = 4;
  const values = data.map((d) => d.roi_pct);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(1, ...values);
  const range = maxV - minV || 1;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((d.roi_pct - minV) / range) * (H - 2 * pad);
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${H} L${points[0].x},${H} Z`;

  // Grid lines (3 horizontal)
  const gridYs = [0.25, 0.5, 0.75].map((f) => pad + f * (H - 2 * pad));

  // X-axis labels (first, middle, last)
  const labels = [
    data[0]?.date,
    data[Math.floor(data.length / 2)]?.date,
    data[data.length - 1]?.date,
  ].map((d) => {
    if (!d) return "";
    const dt = new Date(d);
    return `${dt.getDate()} ${dt.toLocaleString("fr-FR", { month: "short" })}`;
  });

  const lastPt = points[points.length - 1];

  return (
    <div>
      <div className="h-[160px] relative overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          {gridYs.map((y) => (
            <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="#e3e6eb" strokeWidth="1" />
          ))}
          <defs>
            <linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b5bdb" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#3b5bdb" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#roiFill)" />
          <path d={line} fill="none" stroke="#3b5bdb" strokeWidth="2" strokeLinecap="round" />
          {/* dots at every ~20% interval */}
          {points.filter((_, i) => i > 0 && i < points.length - 1 && i % Math.max(1, Math.floor(points.length / 5)) === 0).map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#3b5bdb" />
          ))}
          {/* last dot (hollow) */}
          <circle cx={lastPt.x} cy={lastPt.y} r="4.5" fill="white" stroke="#3b5bdb" strokeWidth="2.5" />
        </svg>
      </div>
      <div className="flex justify-between pt-2">
        {labels.map((l, i) => (
          <span key={i} className="text-[10.5px] text-[#8a919e]">{l}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Sport Bars ── */
function SportBars({ bets, allBets }: { bets: Bet[]; allBets: PortfolioStats | null }) {
  // Compute sport performance from recent bets
  const sportMap = new Map<string, { won: number; lost: number; pnl: number; count: number }>();
  for (const b of bets) {
    const sport = b.sport === "tennis" ? "Tennis" : "Football";
    const cur = sportMap.get(sport) || { won: 0, lost: 0, pnl: 0, count: 0 };
    cur.count++;
    if (b.result === "won") cur.won++;
    if (b.result === "lost") cur.lost++;
    cur.pnl += b.profit_loss || 0;
    sportMap.set(sport, cur);
  }

  // If we have portfolio stats but no bets breakdown, show a simple bar
  if (sportMap.size === 0 && allBets) {
    const roi = allBets.roi_pct;
    return (
      <div className="flex items-end gap-2 h-[100px] pt-2">
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <span className="text-[11px] font-bold" style={{ color: roi >= 0 ? "#12b76a" : "#f04438" }}>
            {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
          </span>
          <div
            className="w-full rounded-t-[5px]"
            style={{
              height: "60%",
              background: roi >= 0 ? "#3b5bdb" : "#f04438",
              opacity: 0.85,
            }}
          />
          <span className="text-[10px] text-[#8a919e]">Football</span>
        </div>
      </div>
    );
  }

  if (sportMap.size === 0) {
    return (
      <div className="h-[100px] flex items-center justify-center text-[13px] text-[#b0b7c3]">
        Aucune donnée
      </div>
    );
  }

  const sports = Array.from(sportMap.entries()).map(([name, data]) => ({
    name,
    roi: data.count > 0 ? (data.pnl / (data.count * 10)) * 100 : 0, // approximate
    count: data.count,
    color: name === "Tennis" ? "#3b5bdb" : "#12b76a",
  }));

  const maxAbs = Math.max(...sports.map((s) => Math.abs(s.roi)), 1);

  return (
    <div className="flex items-end gap-2 h-[100px] pt-2">
      {sports.map((s) => {
        const pct = Math.max(10, Math.round((Math.abs(s.roi) / maxAbs) * 100));
        return (
          <div key={s.name} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[11px] font-bold" style={{ color: s.roi >= 0 ? s.color : "#f04438" }}>
              {s.roi >= 0 ? "+" : ""}{s.roi.toFixed(0)}%
            </span>
            <div
              className="w-full rounded-t-[5px] cursor-pointer transition-opacity hover:opacity-80"
              style={{ height: `${pct}%`, background: s.color, opacity: 0.85 }}
              title={`${s.count} tickets`}
            />
            <span className="text-[10px] text-[#8a919e]">{s.name}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Donut Chart ── */
function DonutChart({ won, lost, pending, total }: { won: number; lost: number; pending: number; total: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const t = won + lost + pending || 1;
  const wonPct = won / t;
  const lostPct = lost / t;
  const pendPct = pending / t;

  // Compute stroke-dasharray and offset for each segment
  const wonLen = wonPct * circ;
  const lostLen = lostPct * circ;
  const pendLen = pendPct * circ;

  const wonOffset = circ * 0.25; // start at top
  const lostOffset = wonOffset - wonLen;
  const pendOffset = lostOffset - lostLen;

  const legend = [
    { label: "Gagnés", count: won, pct: Math.round(wonPct * 100), color: "#12b76a" },
    { label: "Perdus", count: lost, pct: Math.round(lostPct * 100), color: "#f04438" },
    { label: "En attente", count: pending, pct: Math.round(pendPct * 100), color: "#f79009" },
  ];

  return (
    <div className="flex items-center gap-5">
      <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#f4f5f7" strokeWidth="14" />
        {wonLen > 0 && (
          <circle cx="55" cy="55" r={r} fill="none" stroke="#12b76a" strokeWidth="14"
            strokeDasharray={`${wonLen} ${circ - wonLen}`} strokeDashoffset={wonOffset} strokeLinecap="round" />
        )}
        {lostLen > 0 && (
          <circle cx="55" cy="55" r={r} fill="none" stroke="#f04438" strokeWidth="14"
            strokeDasharray={`${lostLen} ${circ - lostLen}`} strokeDashoffset={lostOffset} strokeLinecap="round" />
        )}
        {pendLen > 0 && (
          <circle cx="55" cy="55" r={r} fill="none" stroke="#f79009" strokeWidth="14"
            strokeDasharray={`${pendLen} ${circ - pendLen}`} strokeDashoffset={pendOffset} strokeLinecap="round" />
        )}
        <text x="55" y="50" textAnchor="middle" className="text-[16px] font-extrabold fill-[#111318]">
          {total}
        </text>
        <text x="55" y="64" textAnchor="middle" className="text-[9px] fill-[#8a919e]">
          tickets
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        {legend.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[12px]">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-[#8a919e] flex-1">{item.label}</span>
            <span className="font-bold text-[11.5px] text-[#3c4149]">
              {item.count}{" "}
              <span className="font-normal text-[#8a919e]">{item.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
