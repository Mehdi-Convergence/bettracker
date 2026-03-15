import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  DollarSign,
  CheckSquare,
  ChevronUp,
  ChevronDown,
  Flag,
  Calendar,
  Trophy,
  Flame,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { dashboardTour } from "@/tours/index";
import {
  getPortfolioStats,
  getPortfolioHistory,
  getPortfolioBets,
  getDashboardSummary,
  getPreferences,
} from "@/services/api";
import type { PortfolioStats, Bet, DashboardSummary, SportBreakdown, UserPreferences } from "@/types";

/* ── helpers ── */
const PERIODS = [
  { key: "7d", label: "7j", days: 7 },
  { key: "30d", label: "1 mois", days: 30 },
  { key: "365d", label: "1 an", days: 365 },
  { key: "custom", label: "Personnalisé", days: 0 },
] as const;

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function getWeekNumber(): number {
  const now = new Date(), start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}
function fmtDate(d: string): string {
  const dt = new Date(d);
  return `${dt.getDate()} ${dt.toLocaleString("fr-FR", { month: "short" })}`;
}

const OUTCOME_LABELS: Record<string, string> = { H: "Domicile", D: "Match nul", A: "Extérieur" };

interface HistoryPoint { date: string; cumulative_pnl: number; roi_pct: number; }

/* ── Bet grouping for combis ── */
interface BetGroup {
  type: "single" | "combo";
  bets: Bet[];
  combinedOdds: number;
  result: string;
  sport: string;
  stake: number;
  gains: number | null;
}

function groupBets(bets: Bet[]): BetGroup[] {
  const groups: BetGroup[] = [];
  const comboMap = new Map<string, Bet[]>();
  for (const b of bets) {
    if (b.combo_group) {
      const existing = comboMap.get(b.combo_group) || [];
      existing.push(b);
      comboMap.set(b.combo_group, existing);
    } else {
      const gain = b.result === "won" ? b.stake * b.odds_at_bet : b.result === "lost" ? 0 : null;
      groups.push({ type: "single", bets: [b], combinedOdds: b.odds_at_bet, result: b.result, sport: b.sport, stake: b.stake, gains: gain });
    }
  }
  // Insert combis at the top so they always show
  const comboGroups: BetGroup[] = [];
  for (const [, legs] of comboMap) {
    const combined = legs.reduce((acc, l) => acc * l.odds_at_bet, 1);
    const combinedOdds = Math.round(combined * 100) / 100;
    const stake = legs[0].stake;
    const gain = legs[0].result === "won" ? stake * combinedOdds : legs[0].result === "lost" ? 0 : null;
    comboGroups.push({ type: "combo", bets: legs, combinedOdds, result: legs[0].result, sport: legs[0].sport, stake, gains: gain });
  }
  return [...comboGroups, ...groups];
}

/* ══════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════ */
export default function Dashboard() {
  const { user } = useAuth();
  const { showTour, completeTour } = useTour("dashboard");
  const firstName = user?.display_name?.split(" ")[0] || "Bettor";

  const [period, setPeriod] = useState<string>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [recentBets, setRecentBets] = useState<Bet[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const { fromDate, toDate } = useMemo(() => {
    if (period === "custom" && customFrom && customTo) return { fromDate: customFrom, toDate: customTo };
    const p = PERIODS.find((x) => x.key === period);
    if (p && p.days > 0) return { fromDate: daysAgo(p.days), toDate: todayStr() };
    return { fromDate: undefined, toDate: undefined };
  }, [period, customFrom, customTo]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPortfolioStats(fromDate, toDate).catch(() => null),
      getPortfolioHistory(fromDate, toDate).catch(() => []),
      getPortfolioBets().catch(() => []),
      getDashboardSummary().catch(() => null),
      getPreferences().catch(() => null),
    ]).then(([s, h, bets, sum, p]) => {
      setStats(s as PortfolioStats | null);
      setHistory((h as HistoryPoint[]) || []);
      setRecentBets(((bets as Bet[]) || []).slice(0, 20));
      setSummary(sum as DashboardSummary | null);
      setPrefs(p as UserPreferences | null);
      setLoading(false);
    });
  }, [fromDate, toDate]);

  const roi = stats?.roi_pct ?? 0;
  const prevRoi = stats?.prev_roi_pct;
  const roiDelta = prevRoi != null ? roi - prevRoi : null;
  const totalStaked = stats?.total_staked ?? 0;
  const prevStaked = stats?.prev_total_staked;
  const stakedDelta = prevStaked != null ? totalStaked - prevStaked : null;
  const totalBets = stats?.total_bets ?? 0;
  const pendingBets = stats?.pending_bets ?? 0;
  const winRate = stats ? stats.win_rate * 100 : 0;
  const prevWinRate = stats?.prev_win_rate != null ? stats.prev_win_rate * 100 : null;
  const winRateDelta = prevWinRate != null ? winRate - prevWinRate : null;
  const won = stats?.won ?? 0;
  const lost = stats?.lost ?? 0;
  const sportBreakdown = stats?.sport_breakdown || [];
  const campaignSummaries = summary?.campaign_summaries || [];
  const betGroups = useMemo(() => groupBets(recentBets).slice(0, 5), [recentBets]);

  return (
    <div className="flex flex-col gap-2 animate-fade-up h-full overflow-hidden max-md:h-auto max-md:overflow-visible max-md:overflow-x-hidden">
      {/* ── HEADER ── */}
      <div className="flex items-end justify-between max-md:flex-col max-md:items-start max-md:gap-2">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-[#111318]">Bonjour, {firstName}</h1>
          <p className="text-[12.5px] text-[#8a919e] mt-0.5">Voici un aperçu de vos performances · Semaine {getWeekNumber()}</p>
        </div>
        <div className="flex flex-col gap-1.5 items-end max-md:items-start max-md:w-full" data-tour="period-selector">
          <div className="flex flex-wrap gap-1 bg-[#f4f5f7] border border-[#e3e6eb] rounded-[9px] p-[3px]">
            {PERIODS.filter((p) => p.key !== "custom").map((p) => (
              <button key={p.key} onClick={() => { setPeriod(p.key); setShowCustom(false); }}
                className={`px-3.5 py-[5px] rounded-[7px] text-[12px] font-medium cursor-pointer transition-all border-none whitespace-nowrap ${period === p.key ? "bg-white text-[#111318] font-semibold shadow-[0_1px_3px_rgba(16,24,40,0.06)]" : "bg-transparent text-[#8a919e] hover:text-[#3c4149]"}`}>
                {p.label}
              </button>
            ))}
            <button onClick={() => { setPeriod("custom"); setShowCustom(true); }}
              className={`px-2.5 py-[5px] rounded-[7px] text-[12px] font-medium cursor-pointer transition-all border-none flex items-center gap-1.5 ${period === "custom" ? "bg-white text-[#111318] font-semibold shadow-[0_1px_3px_rgba(16,24,40,0.06)]" : "bg-transparent text-[#8a919e] hover:text-[#3c4149]"}`}>
              <Calendar size={12} /> Dates
            </button>
          </div>
          {showCustom && (
            <div className="flex items-center gap-1.5 bg-white border border-[#e3e6eb] rounded-[9px] px-2.5 py-[3px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] max-md:w-full max-md:flex-wrap">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-[12px] border-none bg-transparent outline-none text-[#111318] w-[110px] max-sm:flex-1" />
              <span className="text-[11px] text-[#b0b7c3]">→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-[12px] border-none bg-transparent outline-none text-[#111318] w-[110px] max-sm:flex-1" />
              <button onClick={() => { setShowCustom(false); setPeriod("30d"); setCustomFrom(""); setCustomTo(""); }} className="ml-1 text-[#8a919e] hover:text-[#f04438] cursor-pointer bg-transparent border-none"><X size={12} /></button>
            </div>
          )}
        </div>
      </div>

      {/* ── BANNER ── */}
      {campaignSummaries.filter((c) => c.total_bets > 0).length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-[10px] max-md:flex-wrap max-md:gap-2 max-md:px-3" data-tour="campaign-banner" style={{ background: "linear-gradient(90deg, rgba(59,91,219,0.06), rgba(59,91,219,0.02))", border: "1px solid rgba(59,91,219,0.18)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(59,91,219,0.07)" }}><Flag size={14} className="text-[#3b5bdb]" /></div>
          <div className="flex-1 min-w-0 text-[12.5px]">
            {campaignSummaries.filter((c) => c.total_bets > 0).map((c, i) => (
              <span key={c.id}>{i > 0 && " · "}<strong className="text-[#3b5bdb]">{c.total_bets} matchs</strong><span className="text-[#8a919e]"> sur <strong className="text-[#3c4149]">{c.name}</strong> ({c.won}W-{c.lost}L{c.pending > 0 ? `, ${c.pending} en attente` : ""})</span></span>
            ))}
          </div>
          <Link to="/campaign" className="px-3 py-[6px] rounded-lg bg-[#3b5bdb] text-white text-[11.5px] font-semibold no-underline whitespace-nowrap transition-all hover:bg-[#2f4ac7] max-md:w-full max-md:text-center">Campagnes →</Link>
        </div>
      )}

      {/* ── BANKROLL WIDGET ── */}
      {prefs && (
        <BankrollWidget
          initialBankroll={prefs.initial_bankroll}
          totalPnl={stats?.total_pnl ?? null}
          pendingBets={stats?.pending_bets ?? null}
        />
      )}

      {/* ── KPIs ── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e3e6eb] p-[14px_16px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] animate-pulse"><div className="h-3 w-16 bg-[#e3e6eb] rounded mb-3" /><div className="h-6 w-20 bg-[#e3e6eb] rounded" /></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard dataTour="kpi-roi" label={`ROI (${PERIODS.find((p) => p.key === period)?.label ?? "période"})`} value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`} valueColor={roi >= 0 ? "#12b76a" : "#f04438"} icon={<TrendingUp size={14} />} iconBg={roi >= 0 ? "rgba(18,183,106,0.08)" : "rgba(240,68,56,0.07)"} iconColor={roi >= 0 ? "#12b76a" : "#f04438"} delta={roiDelta != null ? `${roiDelta >= 0 ? "+" : ""}${roiDelta.toFixed(1)}% vs mois dernier` : undefined} deltaUp={roiDelta != null ? roiDelta >= 0 : undefined} />
          <KPICard dataTour="kpi-staked" label={`Mise (${PERIODS.find((p) => p.key === period)?.label ?? "période"})`} value={`${totalStaked.toLocaleString("fr-FR")}€`} icon={<DollarSign size={14} />} iconBg="rgba(59,91,219,0.07)" iconColor="#3b5bdb" delta={stakedDelta != null ? `${stakedDelta >= 0 ? "+" : ""}${Math.round(stakedDelta)}€ vs mois dernier` : undefined} deltaUp={stakedDelta != null ? stakedDelta >= 0 : undefined} />
          <KPICard dataTour="kpi-tickets" label={`Tickets (${PERIODS.find((p) => p.key === period)?.label ?? "période"})`} value={`${totalBets}`} icon={<CheckSquare size={14} />} iconBg="rgba(247,144,9,0.08)" iconColor="#f79009" delta={pendingBets > 0 ? `dont ${pendingBets} en attente` : undefined} />
          <KPICard dataTour="kpi-winrate" label={`Taux de réussite (${PERIODS.find((p) => p.key === period)?.label ?? "période"})`} value={`${winRate.toFixed(1)}%`} valueColor={winRate >= 50 ? "#12b76a" : "#f04438"} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} iconBg="rgba(18,183,106,0.08)" iconColor="#12b76a" delta={winRateDelta != null ? `${winRateDelta >= 0 ? "+" : ""}${winRateDelta.toFixed(1)}% vs mois dernier` : undefined} deltaUp={winRateDelta != null ? winRateDelta >= 0 : undefined} />
        </div>
      )}

      {/* ── MAIN: 2 columns ── */}
      <div className="grid gap-3 items-stretch flex-1 min-h-0 max-md:flex max-md:flex-col" style={{ gridTemplateColumns: "1fr 340px" }}>
        {/* LEFT column */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* ROW 1: ROI chart + P&L résumé side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
            {/* ROI Chart */}
            <div data-tour="roi-chart" className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
              <div className="flex items-center px-4 py-2.5 border-b border-[#e3e6eb]">
                <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                  <TrendingUp size={13} className="text-[#3b5bdb]" /> Évolution ROI
                </div>
              </div>
              <div className="px-3 py-2 flex-1 flex items-center max-md:min-h-[160px]">
                <ROIChart data={history} />
              </div>
            </div>

            {/* P&L Résumé */}
            <div data-tour="pnl-card" className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
              <div className="flex items-center px-4 py-2.5 border-b border-[#e3e6eb]">
                <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                  <DollarSign size={13} className="text-[#3b5bdb]" /> P&L Cumulé
                </div>
              </div>
              <div className="px-4 pt-3 pb-2 flex-1 flex flex-col min-h-0">
                <div className="shrink-0">
                  <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: (stats?.total_pnl ?? 0) >= 0 ? "#12b76a" : "#f04438" }}>
                    {(stats?.total_pnl ?? 0) >= 0 ? "+" : ""}{(stats?.total_pnl ?? 0).toFixed(2)}€
                  </div>
                  <div className="text-[11px] text-[#8a919e] mt-0.5">sur {totalStaked.toLocaleString("fr-FR")}€ misés</div>
                </div>
                {history.length >= 2 && (
                  <div className="flex-1 min-h-0 mt-1 max-md:min-h-[120px]">
                    <PnLSparkline data={history} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ROW 2: 2 cards side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
            {/* Sport + Donut merged */}
            <div data-tour="sport-breakdown" className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
                <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                  Performance & Répartition
                </div>
              </div>
              <div className="p-3 flex-1 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <SportBarsCompact data={sportBreakdown} />
                </div>
                <div className="shrink-0">
                  <DonutMini won={won} lost={lost} pending={pendingBets} total={totalBets} />
                </div>
              </div>
            </div>

            {/* Streaks */}
            <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
                <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                  <Trophy size={13} className="text-[#3b5bdb]" /> Streaks & Records
                </div>
              </div>
              <div className="p-3 flex-1 flex flex-col justify-center gap-1.5">
                <StreakRow icon={<Flame size={13} className="text-[#12b76a]" />} label="Meilleure série" value={`${stats?.longest_winning_streak ?? 0} victoires`} color="#12b76a" />
                <StreakRow icon={<Flame size={13} className="text-[#f04438]" />} label="Pire série" value={`${stats?.longest_losing_streak ?? 0} défaites`} color="#f04438" />
                <StreakRow icon={<DollarSign size={13} className="text-[#3b5bdb]" />} label="P&L total" value={`${(stats?.total_pnl ?? 0) >= 0 ? "+" : ""}${(stats?.total_pnl ?? 0).toFixed(2)}€`} color={(stats?.total_pnl ?? 0) >= 0 ? "#12b76a" : "#f04438"} />
                <StreakRow icon={<TrendingUp size={13} className="text-[#f79009]" />} label="Cote moyenne" value={recentBets.length > 0 ? `x${(recentBets.reduce((a, b) => a + b.odds_at_bet, 0) / recentBets.length).toFixed(2)}` : "—"} color="#3c4149" />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT column: Tickets récents */}
        <div data-tour="recent-bets" className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col min-h-0 max-md:min-h-[300px]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
            <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
              <CheckSquare size={13} className="text-[#3b5bdb]" /> Tickets récents
            </div>
            <Link to="/portfolio" className="px-2.5 py-1 rounded-[6px] border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[11px] font-medium no-underline transition-all hover:border-[#cdd1d9] hover:text-[#3c4149]">Voir tout</Link>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 max-md:max-h-[320px]">
            {betGroups.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#b0b7c3]">Aucun ticket</div>
            ) : (
              betGroups.map((group, i) => <TicketCard key={i} group={group} />)
            )}
          </div>
        </div>
      </div>

      {showTour && <SpotlightTour steps={dashboardTour} onComplete={completeTour} />}
    </div>
  );
}

/* ══════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════ */

/* ── Bankroll Widget ── */
function BankrollWidget({
  initialBankroll,
  totalPnl,
  pendingBets,
}: {
  initialBankroll: number;
  totalPnl: number | null;
  pendingBets: number | null;
}) {
  const pnl = totalPnl ?? 0;
  const currentBankroll = initialBankroll + pnl;
  const pnlPositive = pnl >= 0;

  return (
    <div
      className="rounded-xl border border-[#e3e6eb] px-4 py-3 shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
      style={{ background: "linear-gradient(90deg, #f8f9fb 0%, #ffffff 100%)" }}
    >
      <div className="grid grid-cols-3 divide-x divide-[#e3e6eb] max-sm:grid-cols-1 max-sm:divide-x-0 max-sm:divide-y max-sm:divide-[#e3e6eb]">
        {/* Bankroll initiale */}
        <div className="flex flex-col gap-0.5 pr-4 max-sm:pr-0 max-sm:pb-3">
          <span className="text-[10.5px] font-medium text-[#8a919e] uppercase tracking-wide">Bankroll initiale</span>
          <span className="text-[20px] font-extrabold tracking-tight text-[#111318] leading-none">
            {initialBankroll.toLocaleString("fr-FR")}€
          </span>
          <span className="text-[10px] text-[#b0b7c3]">mise de départ</span>
        </div>

        {/* Solde actuel */}
        <div className="flex flex-col gap-0.5 px-4 max-sm:px-0 max-sm:py-3">
          <span className="text-[10.5px] font-medium text-[#8a919e] uppercase tracking-wide">Solde actuel</span>
          <span
            className="text-[20px] font-extrabold tracking-tight leading-none"
            style={{ color: pnlPositive ? "#12b76a" : "#f04438" }}
          >
            {currentBankroll.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
          </span>
          <span className="text-[10px] text-[#b0b7c3]">
            {pendingBets !== null && pendingBets > 0
              ? `${pendingBets} pari${pendingBets > 1 ? "s" : ""} en cours`
              : "aucun pari en cours"}
          </span>
        </div>

        {/* Variation P&L */}
        <div className="flex flex-col gap-0.5 pl-4 max-sm:pl-0 max-sm:pt-3">
          <span className="text-[10.5px] font-medium text-[#8a919e] uppercase tracking-wide">Variation P&L</span>
          <span
            className="text-[20px] font-extrabold tracking-tight leading-none"
            style={{ color: pnlPositive ? "#12b76a" : "#f04438" }}
          >
            {pnlPositive ? "+" : ""}{pnl.toFixed(2)}€
          </span>
          <span className="text-[10px] text-[#b0b7c3]">
            {initialBankroll > 0
              ? `${pnlPositive ? "+" : ""}${((pnl / initialBankroll) * 100).toFixed(1)}% vs initial`
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, valueColor, icon, iconBg, iconColor, delta, deltaUp, dataTour }: {
  label: string; value: string; valueColor?: string; icon: React.ReactNode; iconBg: string; iconColor: string; delta?: string; deltaUp?: boolean; dataTour?: string;
}) {
  return (
    <div data-tour={dataTour} className="bg-white border border-[#e3e6eb] rounded-xl p-[14px_16px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] hover:shadow-[0_4px_16px_rgba(16,24,40,0.08)] transition-shadow flex flex-col items-center text-center gap-1">
      <div className="w-[28px] h-[28px] rounded-lg flex items-center justify-center" style={{ background: iconBg, color: iconColor }}>{icon}</div>
      <span className="text-[10px] font-medium text-[#8a919e] uppercase tracking-wide">{label}</span>
      <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: valueColor || "#111318" }}>{value}</div>
      {delta && (
        <div className="flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: deltaUp === false ? "#f04438" : deltaUp === true ? "#12b76a" : "#8a919e" }}>
          {deltaUp === true && <ChevronUp size={11} />}{deltaUp === false && <ChevronDown size={11} />}{delta}
        </div>
      )}
    </div>
  );
}

/* ── Ticket Card — compact Betclic style ── */
function TicketCard({ group }: { group: BetGroup }) {
  const [expanded, setExpanded] = useState(false);
  const isCombo = group.type === "combo";
  const bet = group.bets[0];

  const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
    won: { label: "Gagné", bg: "#12b76a", color: "#fff" },
    lost: { label: "Perdu", bg: "#f04438", color: "#fff" },
    pending: { label: "En attente", bg: "#f79009", color: "#fff" },
  };
  const st = statusConfig[group.result] || statusConfig.pending;

  const oddsColor = group.result === "won" ? "#12b76a" : group.result === "lost" ? "#f04438" : "#e3e6eb";
  const oddsText = group.result === "pending" ? "#3c4149" : "#fff";

  return (
    <div className="border-b border-[#f0f1f3] last:border-b-0">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3.5 py-2 ${isCombo ? "cursor-pointer hover:bg-[#fafbfc]" : ""}`}
        onClick={isCombo ? () => setExpanded(!expanded) : undefined}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#3c4149]">
            {isCombo ? `Combiné (${group.bets.length})` : "Simple"}
          </span>
          {isCombo && (
            <div className="flex gap-0.5">
              {group.bets.map((l) => (
                <span key={l.id} className="text-[9px]">
                  {l.sport === "tennis" ? "🎾" : "⚽"}
                </span>
              ))}
            </div>
          )}
          {isCombo && <ChevronDown size={11} className={`text-[#8a919e] transition-transform ${expanded ? "rotate-180" : ""}`} />}
        </div>
        <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-[3px]" style={{ background: st.bg, color: st.color }}>{st.label}</span>
      </div>

      {/* Body */}
      <div className="px-3.5 pb-2.5">
        {!isCombo && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[14px]">{bet.sport === "tennis" ? "🎾" : "⚽"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-[#111318] truncate">{bet.home_team} vs {bet.away_team}</div>
              <div className="text-[10px] text-[#8a919e]">{OUTCOME_LABELS[bet.outcome_bet] || bet.outcome_bet}</div>
            </div>
            <div className="px-2 py-0.5 rounded-[5px] text-[12px] font-bold" style={{ background: oddsColor, color: oddsText }}>
              {bet.odds_at_bet.toFixed(2)}
            </div>
          </div>
        )}

        {isCombo && (
          <div className="flex flex-col gap-0.5 mb-1.5">
            {(expanded ? group.bets : group.bets.slice(0, 1)).map((leg) => (
              <div key={leg.id} className="flex items-center gap-1.5 py-0.5">
                <span className="text-[11px]">{leg.sport === "tennis" ? "🎾" : "⚽"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-semibold text-[#111318] truncate">{leg.home_team} vs {leg.away_team}</div>
                  <div className="text-[9.5px] text-[#8a919e]">{leg.league} · {OUTCOME_LABELS[leg.outcome_bet] || leg.outcome_bet}</div>
                </div>
                <span className="text-[10.5px] font-bold text-[#3c4149] font-mono">{leg.odds_at_bet.toFixed(2)}</span>
              </div>
            ))}
            {!expanded && group.bets.length > 1 && (
              <div className="text-[9.5px] text-[#8a919e] pl-5">+ {group.bets.length - 1} autre{group.bets.length > 2 ? "s" : ""}</div>
            )}
          </div>
        )}

        {/* Mise + Gains */}
        <div className="flex items-center justify-between pt-1.5 border-t border-[#f0f1f3]">
          {isCombo && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#8a919e]">Cote</span>
              <span className="px-1.5 py-0.5 rounded-[4px] text-[11px] font-bold" style={{ background: oddsColor, color: oddsText }}>
                {group.combinedOdds.toFixed(2)}
              </span>
            </div>
          )}
          <div className={`flex items-center gap-3 ${!isCombo ? "w-full justify-between" : "ml-auto"}`}>
            <span className="text-[10px] text-[#8a919e]">Mise <strong className="text-[#3c4149]">{group.stake.toFixed(0)}€</strong></span>
            {group.gains != null && (
              <span className="text-[10px] text-[#8a919e]">Gains <strong style={{ color: group.gains > 0 ? "#12b76a" : "#f04438" }}>
                {group.gains > 0 ? `${group.gains.toFixed(2)}€` : "0€"}
              </strong></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ROI Chart — half-width compact ── */
function ROIChart({ data }: { data: HistoryPoint[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; point: HistoryPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length < 2) {
    return <div className="h-full flex items-center justify-center text-[12px] text-[#b0b7c3]">Pas assez de données</div>;
  }

  const W = 320, H = 140, padL = 38, padR = 6, padT = 10, padB = 22;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const values = data.map((d) => d.roi_pct);
  const minV = Math.min(0, ...values), maxV = Math.max(1, ...values);
  const range = maxV - minV || 1;

  const points = data.map((d, i) => ({
    x: padL + (i / (data.length - 1)) * chartW,
    y: padT + chartH - ((d.roi_pct - minV) / range) * chartH,
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${padT + chartH} L${points[0].x},${padT + chartH} Z`;

  const yTicks = Array.from({ length: 3 }, (_, i) => ({ val: Math.round((minV + (range * i) / 2) * 10) / 10, y: padT + chartH - (i / 2) * chartH }));
  const xCount = Math.min(3, data.length);
  const xLabels = Array.from({ length: xCount }, (_, i) => {
    const idx = Math.floor((i / (xCount - 1)) * (data.length - 1));
    return { x: padL + (idx / (data.length - 1)) * chartW, label: idx === data.length - 1 ? "Auj." : fmtDate(data[idx].date) };
  });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0, minDist = Infinity;
    for (let i = 0; i < points.length; i++) { const d = Math.abs(points[i].x - mouseX); if (d < minDist) { minDist = d; closest = i; } }
    setHover(minDist < 30 ? { x: points[closest].x, y: points[closest].y, point: data[closest] } : null);
  };

  return (
    <div className="relative w-full">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full" onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
        {yTicks.map((t) => <line key={t.val} x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#e3e6eb" strokeWidth="0.8" />)}
        {yTicks.map((t) => <text key={`yl-${t.val}`} x={padL - 5} y={t.y + 3} textAnchor="end" className="text-[9px] fill-[#8a919e]">{t.val}%</text>)}
        {xLabels.map((l, i) => <text key={i} x={l.x} y={H - 4} textAnchor="middle" className="text-[9px] fill-[#8a919e]">{l.label}</text>)}
        <defs><linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b5bdb" stopOpacity="0.12" /><stop offset="100%" stopColor="#3b5bdb" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#roiFill)" />
        <path d={line} fill="none" stroke="#3b5bdb" strokeWidth="2" strokeLinecap="round" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" fill="white" stroke="#3b5bdb" strokeWidth="2" />
        {hover && (<><line x1={hover.x} y1={padT} x2={hover.x} y2={padT + chartH} stroke="#3b5bdb" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" /><circle cx={hover.x} cy={hover.y} r="3.5" fill="#3b5bdb" opacity="0.3" /><circle cx={hover.x} cy={hover.y} r="2" fill="#3b5bdb" /></>)}
      </svg>
      {hover && (
        <div className="absolute pointer-events-none bg-[#1e2535] text-white rounded-lg px-2.5 py-1.5 text-[10px] shadow-lg z-10" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100 - 12}%`, transform: "translate(-50%, -100%)" }}>
          <div className="font-semibold">{fmtDate(hover.point.date)}</div>
          <div className="flex gap-2 mt-0.5">
            <span>ROI: <strong className={hover.point.roi_pct >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}>{hover.point.roi_pct.toFixed(1)}%</strong></span>
            <span>P&L: <strong className={hover.point.cumulative_pnl >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}>{hover.point.cumulative_pnl >= 0 ? "+" : ""}{hover.point.cumulative_pnl.toFixed(0)}€</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── P&L Chart with axes ── */
function PnLSparkline({ data }: { data: HistoryPoint[] }) {
  const W = 280, H = 120, padL = 35, padR = 6, padT = 8, padB = 18;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const vals = data.map((d) => d.cumulative_pnl);
  const minV = Math.min(0, ...vals), maxV = Math.max(1, ...vals);
  const range = maxV - minV || 1;
  const isPositive = vals[vals.length - 1] >= 0;
  const color = isPositive ? "#12b76a" : "#f04438";

  const points = data.map((d, i) => ({
    x: padL + (i / (data.length - 1)) * chartW,
    y: padT + chartH - ((d.cumulative_pnl - minV) / range) * chartH,
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${padT + chartH} L${points[0].x},${padT + chartH} Z`;

  const yTicks = [minV, (minV + maxV) / 2, maxV].map((val) => ({
    val: Math.round(val),
    y: padT + chartH - ((val - minV) / range) * chartH,
  }));
  const xCount = Math.min(3, data.length);
  const xLabels = Array.from({ length: xCount }, (_, i) => {
    const idx = Math.floor((i / (xCount - 1)) * (data.length - 1));
    return { x: padL + (idx / (data.length - 1)) * chartW, label: idx === data.length - 1 ? "Auj." : fmtDate(data[idx].date) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      <defs>
        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => <line key={t.val} x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#e3e6eb" strokeWidth="0.6" />)}
      {yTicks.map((t) => <text key={`yl-${t.val}`} x={padL - 4} y={t.y + 3} textAnchor="end" className="text-[7.5px] fill-[#8a919e]">{t.val}€</text>)}
      {xLabels.map((l, i) => <text key={i} x={l.x} y={H - 3} textAnchor="middle" className="text-[7.5px] fill-[#8a919e]">{l.label}</text>)}
      <path d={area} fill="url(#pnlFill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill="white" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ── Sport Bars — compact version ── */
function SportBarsCompact({ data }: { data: SportBreakdown[] }) {
  if (data.length === 0) {
    return <div className="h-[80px] flex items-center justify-center text-[11px] text-[#b0b7c3]">Aucune donnée</div>;
  }
  const SPORT_COLORS: Record<string, string> = { football: "#12b76a", tennis: "#3b5bdb", basketball: "#f04438" };
  const maxAbs = Math.max(...data.map((s) => Math.abs(s.roi_pct)), 1);

  return (
    <div className="flex flex-col gap-2">
      {data.map((s) => {
        const color = SPORT_COLORS[s.sport] || "#8a919e";
        const isNeg = s.roi_pct < 0;
        const barPct = Math.max(10, Math.round((Math.abs(s.roi_pct) / maxAbs) * 100));
        return (
          <div key={s.sport}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] capitalize text-[#3c4149] font-medium">{s.sport}</span>
              <span className="text-[11px] font-bold" style={{ color: isNeg ? "#f04438" : color }}>
                {isNeg ? "" : "+"}{s.roi_pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-[14px] bg-[#f4f5f7] rounded-[4px] overflow-hidden">
              <div className="h-full rounded-[4px]" style={{ width: `${barPct}%`, background: isNeg ? "#f04438" : color, opacity: 0.85 }} />
            </div>
            <div className="text-[9px] text-[#8a919e] mt-0.5">{s.won}W-{s.lost}L · {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(0)}€</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Donut Mini ── */
function DonutMini({ won, lost, pending, total }: { won: number; lost: number; pending: number; total: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const t = won + lost + pending || 1;
  const wonPct = won / t, lostPct = lost / t, pendPct = pending / t;
  const wonLen = wonPct * circ, lostLen = lostPct * circ, pendLen = pendPct * circ;
  const wonOffset = circ * 0.25, lostOffset = wonOffset - wonLen, pendOffset = lostOffset - lostLen;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#f4f5f7" strokeWidth="12" />
        {wonLen > 0 && <circle cx="45" cy="45" r={r} fill="none" stroke="#12b76a" strokeWidth="12" strokeDasharray={`${wonLen} ${circ - wonLen}`} strokeDashoffset={wonOffset} strokeLinecap="round" />}
        {lostLen > 0 && <circle cx="45" cy="45" r={r} fill="none" stroke="#f04438" strokeWidth="12" strokeDasharray={`${lostLen} ${circ - lostLen}`} strokeDashoffset={lostOffset} strokeLinecap="round" />}
        {pendLen > 0 && <circle cx="45" cy="45" r={r} fill="none" stroke="#f79009" strokeWidth="12" strokeDasharray={`${pendLen} ${circ - pendLen}`} strokeDashoffset={pendOffset} strokeLinecap="round" />}
        <text x="45" y="42" textAnchor="middle" className="text-[16px] font-extrabold fill-[#111318]">{total}</text>
        <text x="45" y="54" textAnchor="middle" className="text-[8px] fill-[#8a919e]">tickets</text>
      </svg>
      <div className="flex gap-3 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#12b76a]" />{won}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f04438]" />{lost}</span>
        {pending > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f79009]" />{pending}</span>}
      </div>
    </div>
  );
}

/* ── Streak Row — compact ── */
function StreakRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg bg-[#f9fafb]">
      <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">{icon}</div>
      <div className="flex-1">
        <div className="text-[10px] text-[#8a919e]">{label}</div>
        <div className="text-[12px] font-bold" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}
