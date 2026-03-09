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
import {
  getPortfolioStats,
  getPortfolioHistory,
  getPortfolioBets,
  getDashboardSummary,
} from "@/services/api";
import type { PortfolioStats, Bet, DashboardSummary, SportBreakdown } from "@/types";

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
  for (const [, legs] of comboMap) {
    const combined = legs.reduce((acc, l) => acc * l.odds_at_bet, 1);
    const combinedOdds = Math.round(combined * 100) / 100;
    const stake = legs[0].stake;
    const gain = legs[0].result === "won" ? stake * combinedOdds : legs[0].result === "lost" ? 0 : null;
    groups.push({ type: "combo", bets: legs, combinedOdds, result: legs[0].result, sport: legs[0].sport, stake, gains: gain });
  }
  return groups;
}

/* ══════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════ */
export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.display_name?.split(" ")[0] || "Bettor";

  const [period, setPeriod] = useState<string>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [recentBets, setRecentBets] = useState<Bet[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
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
    ]).then(([s, h, bets, sum]) => {
      setStats(s as PortfolioStats | null);
      setHistory((h as HistoryPoint[]) || []);
      setRecentBets(((bets as Bet[]) || []).slice(0, 10));
      setSummary(sum as DashboardSummary | null);
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
    <div className="flex flex-col gap-4 animate-fade-up">
      {/* ── HEADER ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-[#111318]">Bonjour, {firstName}</h1>
          <p className="text-[12.5px] text-[#8a919e] mt-0.5">Voici un aperçu de vos performances · Semaine {getWeekNumber()}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-[#f4f5f7] border border-[#e3e6eb] rounded-[9px] p-[3px]">
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
            <div className="flex items-center gap-1.5 bg-white border border-[#e3e6eb] rounded-[9px] px-2.5 py-[3px] shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-[12px] border-none bg-transparent outline-none text-[#111318] w-[110px]" />
              <span className="text-[11px] text-[#b0b7c3]">→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-[12px] border-none bg-transparent outline-none text-[#111318] w-[110px]" />
              <button onClick={() => { setShowCustom(false); setPeriod("30d"); setCustomFrom(""); setCustomTo(""); }} className="ml-1 text-[#8a919e] hover:text-[#f04438] cursor-pointer bg-transparent border-none"><X size={12} /></button>
            </div>
          )}
        </div>
      </div>

      {/* ── BANNER ── */}
      {campaignSummaries.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-[10px]" style={{ background: "linear-gradient(90deg, rgba(59,91,219,0.06), rgba(59,91,219,0.02))", border: "1px solid rgba(59,91,219,0.18)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(59,91,219,0.07)" }}><Flag size={16} className="text-[#3b5bdb]" /></div>
          <div className="flex-1 text-[13px]">
            {campaignSummaries.map((c, i) => (
              <span key={c.id}>{i > 0 && " · "}<strong className="text-[#3b5bdb]">{c.total_bets} matchs</strong><span className="text-[#8a919e] text-[12px]"> sur <strong className="text-[#3c4149]">{c.name}</strong> ({c.won}W-{c.lost}L{c.pending > 0 ? `, ${c.pending} en attente` : ""})</span></span>
            ))}
          </div>
          <Link to="/campaign" className="px-3.5 py-[7px] rounded-lg bg-[#3b5bdb] text-white text-[12px] font-semibold no-underline whitespace-nowrap transition-all hover:bg-[#2f4ac7]">Voir les campagnes →</Link>
        </div>
      )}

      {/* ── KPIs ── */}
      {loading ? (
        <div className="grid grid-cols-4 gap-3.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e3e6eb] p-[18px_20px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] animate-pulse"><div className="h-3 w-16 bg-[#e3e6eb] rounded mb-3" /><div className="h-7 w-20 bg-[#e3e6eb] rounded" /></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3.5">
          <KPICard label="ROI global" value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`} valueColor={roi >= 0 ? "#12b76a" : "#f04438"} icon={<TrendingUp size={15} />} iconBg={roi >= 0 ? "rgba(18,183,106,0.08)" : "rgba(240,68,56,0.07)"} iconColor={roi >= 0 ? "#12b76a" : "#f04438"} delta={roiDelta != null ? `${roiDelta >= 0 ? "+" : ""}${roiDelta.toFixed(1)}% vs période préc.` : undefined} deltaUp={roiDelta != null ? roiDelta >= 0 : undefined} />
          <KPICard label="Mise totale" value={`${totalStaked.toLocaleString("fr-FR")}€`} icon={<DollarSign size={15} />} iconBg="rgba(59,91,219,0.07)" iconColor="#3b5bdb" delta={stakedDelta != null ? `${stakedDelta >= 0 ? "+" : ""}${Math.round(stakedDelta)}€ vs période préc.` : undefined} deltaUp={stakedDelta != null ? stakedDelta >= 0 : undefined} />
          <KPICard label="Tickets ce mois" value={`${totalBets}`} icon={<CheckSquare size={15} />} iconBg="rgba(247,144,9,0.08)" iconColor="#f79009" delta={pendingBets > 0 ? `dont ${pendingBets} en attente` : undefined} />
          <KPICard label="Taux de réussite" value={`${winRate.toFixed(1)}%`} valueColor={winRate >= 50 ? "#12b76a" : "#f04438"} icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} iconBg="rgba(18,183,106,0.08)" iconColor="#12b76a" delta={winRateDelta != null ? `${winRateDelta >= 0 ? "+" : ""}${winRateDelta.toFixed(1)}% vs période préc.` : undefined} deltaUp={winRateDelta != null ? winRateDelta >= 0 : undefined} />
        </div>
      )}

      {/* ── MIDDLE ROW ── */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1fr 380px" }}>
        {/* ROI Chart */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <TrendingUp size={14} className="text-[#3b5bdb]" /> Évolution du ROI
            </div>
          </div>
          <div className="px-5 py-3">
            <ROIChart data={history} />
          </div>
        </div>

        {/* Tickets récents — style Betclic */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <CheckSquare size={14} className="text-[#3b5bdb]" /> Tickets récents
            </div>
            <Link to="/portfolio" className="px-3 py-1.5 rounded-[7px] border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[12px] font-medium no-underline transition-all hover:border-[#cdd1d9] hover:text-[#3c4149]">Voir tout</Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            {betGroups.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#b0b7c3]">Aucun ticket</div>
            ) : (
              betGroups.map((group, i) => <TicketCard key={i} group={group} />)
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="grid grid-cols-3 gap-3.5">
        {/* Performance par sport */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              Performance par sport
            </div>
          </div>
          <div className="p-4 flex-1">
            <SportBars data={sportBreakdown} />
          </div>
        </div>

        {/* Répartition */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Répartition
            </div>
          </div>
          <div className="p-4 flex items-center justify-center">
            <DonutChart won={won} lost={lost} pending={pendingBets} total={totalBets} />
          </div>
        </div>

        {/* Streaks */}
        <div className="bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e3e6eb]">
            <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#111318]">
              <Trophy size={14} className="text-[#3b5bdb]" /> Streaks & Records
            </div>
          </div>
          <div className="p-4 flex flex-col gap-2.5">
            <StreakRow icon={<Flame size={14} className="text-[#12b76a]" />} label="Meilleure série" value={`${stats?.longest_winning_streak ?? 0} victoires`} color="#12b76a" />
            <StreakRow icon={<Flame size={14} className="text-[#f04438]" />} label="Pire série" value={`${stats?.longest_losing_streak ?? 0} défaites`} color="#f04438" />
            <StreakRow icon={<DollarSign size={14} className="text-[#3b5bdb]" />} label="P&L total" value={`${(stats?.total_pnl ?? 0) >= 0 ? "+" : ""}${(stats?.total_pnl ?? 0).toFixed(2)}€`} color={(stats?.total_pnl ?? 0) >= 0 ? "#12b76a" : "#f04438"} />
            <StreakRow icon={<TrendingUp size={14} className="text-[#f79009]" />} label="Cote moyenne" value={recentBets.length > 0 ? `x${(recentBets.reduce((a, b) => a + b.odds_at_bet, 0) / recentBets.length).toFixed(2)}` : "—"} color="#3c4149" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════ */

function KPICard({ label, value, valueColor, icon, iconBg, iconColor, delta, deltaUp }: {
  label: string; value: string; valueColor?: string; icon: React.ReactNode; iconBg: string; iconColor: string; delta?: string; deltaUp?: boolean;
}) {
  return (
    <div className="bg-white border border-[#e3e6eb] rounded-xl p-[18px_20px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] hover:shadow-[0_4px_16px_rgba(16,24,40,0.08)] transition-shadow flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#8a919e]">{label}</span>
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center" style={{ background: iconBg, color: iconColor }}>{icon}</div>
      </div>
      <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: valueColor || "#111318" }}>{value}</div>
      {delta && (
        <div className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: deltaUp === false ? "#f04438" : deltaUp === true ? "#12b76a" : "#8a919e" }}>
          {deltaUp === true && <ChevronUp size={12} />}{deltaUp === false && <ChevronDown size={12} />}{delta}
        </div>
      )}
    </div>
  );
}

/* ── Ticket Card — Betclic style ── */
function TicketCard({ group }: { group: BetGroup }) {
  const [expanded, setExpanded] = useState(false);
  const isCombo = group.type === "combo";
  const bet = group.bets[0];

  const statusConfig: Record<string, { label: string; bg: string; color: string; border: string }> = {
    won: { label: "Gagné", bg: "#12b76a", color: "#fff", border: "#12b76a" },
    lost: { label: "Perdu", bg: "#f04438", color: "#fff", border: "#f04438" },
    pending: { label: "En attente", bg: "#f79009", color: "#fff", border: "#f79009" },
  };
  const st = statusConfig[group.result] || statusConfig.pending;

  return (
    <div className="border-b border-[#f0f1f3] last:border-b-0">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${isCombo ? "cursor-pointer hover:bg-[#fafbfc]" : ""}`}
        onClick={isCombo ? () => setExpanded(!expanded) : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#3c4149]">
            {isCombo ? `Combiné (${group.bets.length})` : "Simple"}
          </span>
          {isCombo && (
            <div className="flex gap-0.5">
              {group.bets.map((l) => (
                <span key={l.id} className="w-4 h-4 rounded-full text-[8px] flex items-center justify-center" style={{ background: l.sport === "tennis" ? "#fff3e0" : "#e8f5e9" }}>
                  {l.sport === "tennis" ? "🎾" : "⚽"}
                </span>
              ))}
            </div>
          )}
          {isCombo && <ChevronDown size={12} className={`text-[#8a919e] transition-transform ${expanded ? "rotate-180" : ""}`} />}
        </div>
        <span className="text-[10.5px] font-bold px-2 py-[2px] rounded-[4px]" style={{ background: st.bg, color: st.color }}>{st.label}</span>
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        {/* Single bet or first leg of combo */}
        {!isCombo && (
          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-[16px]">{bet.sport === "tennis" ? "🎾" : "⚽"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-[#111318]">{bet.home_team} vs {bet.away_team}</div>
              <div className="text-[11px] text-[#8a919e]">{OUTCOME_LABELS[bet.outcome_bet] || bet.outcome_bet}</div>
            </div>
            <div className="px-2.5 py-1 rounded-[6px] text-[13px] font-bold" style={{ background: "#f79009", color: "#fff" }}>
              {bet.odds_at_bet.toFixed(2)}
            </div>
          </div>
        )}

        {/* Combo legs */}
        {isCombo && (
          <div className="flex flex-col gap-1 mb-2">
            {(expanded ? group.bets : group.bets.slice(0, 1)).map((leg) => (
              <div key={leg.id} className="flex items-center gap-2 py-1">
                <span className="text-[13px]">{leg.sport === "tennis" ? "🎾" : "⚽"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[#111318] truncate">{leg.home_team} vs {leg.away_team}</div>
                  <div className="text-[10.5px] text-[#8a919e]">{leg.league} · {OUTCOME_LABELS[leg.outcome_bet] || leg.outcome_bet}</div>
                </div>
                <span className="text-[11.5px] font-bold text-[#3c4149] font-mono">{leg.odds_at_bet.toFixed(2)}</span>
              </div>
            ))}
            {!expanded && group.bets.length > 1 && (
              <div className="text-[10.5px] text-[#8a919e] pl-6">+ {group.bets.length - 1} autre{group.bets.length > 2 ? "s" : ""} sélection{group.bets.length > 2 ? "s" : ""}</div>
            )}
          </div>
        )}

        {/* Cote + Mise + Gains */}
        <div className="flex items-center justify-between pt-2 border-t border-[#f0f1f3]">
          {isCombo && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#8a919e]">Cote totale</span>
              <span className="px-2 py-0.5 rounded-[5px] text-[12px] font-bold" style={{ background: "#f79009", color: "#fff" }}>
                {group.combinedOdds.toFixed(2)}
              </span>
            </div>
          )}
          <div className={`flex items-center gap-4 ${!isCombo ? "w-full justify-between" : "ml-auto"}`}>
            <div className="text-[11px]">
              <span className="text-[#8a919e]">Mise </span>
              <span className="font-semibold text-[#3c4149]">{group.stake.toFixed(2)}€</span>
            </div>
            {group.gains != null && (
              <div className="text-[11px]">
                <span className="text-[#8a919e]">Gains </span>
                <span className="font-bold" style={{ color: group.gains > 0 ? "#12b76a" : "#f04438" }}>
                  {group.gains > 0 ? `${group.gains.toFixed(2)}€` : "0€"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ROI Chart ── */
function ROIChart({ data }: { data: HistoryPoint[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; point: HistoryPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length < 2) {
    return <div className="h-[180px] flex items-center justify-center text-[13px] text-[#b0b7c3]">Pas assez de données pour la courbe</div>;
  }

  const W = 600, H = 200, padL = 45, padR = 10, padT = 15, padB = 28;
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

  const yTicks = Array.from({ length: 5 }, (_, i) => ({ val: Math.round((minV + (range * i) / 4) * 10) / 10, y: padT + chartH - (i / 4) * chartH }));
  const xCount = Math.min(5, data.length);
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
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ height: 200 }} onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
        {yTicks.map((t) => <line key={t.val} x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#e3e6eb" strokeWidth="1" />)}
        {yTicks.map((t) => <text key={`yl-${t.val}`} x={padL - 8} y={t.y + 3.5} textAnchor="end" className="text-[10px] fill-[#8a919e]">{t.val}%</text>)}
        {xLabels.map((l, i) => <text key={i} x={l.x} y={H - 5} textAnchor="middle" className="text-[10px] fill-[#8a919e]">{l.label}</text>)}
        <defs><linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b5bdb" stopOpacity="0.12" /><stop offset="100%" stopColor="#3b5bdb" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#roiFill)" />
        <path d={line} fill="none" stroke="#3b5bdb" strokeWidth="2" strokeLinecap="round" />
        {points.filter((_, i) => i > 0 && i < points.length - 1 && i % Math.max(1, Math.floor(points.length / 5)) === 0).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b5bdb" />)}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4.5" fill="white" stroke="#3b5bdb" strokeWidth="2.5" />
        {hover && (<><line x1={hover.x} y1={padT} x2={hover.x} y2={padT + chartH} stroke="#3b5bdb" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" /><circle cx={hover.x} cy={hover.y} r="5" fill="#3b5bdb" opacity="0.3" /><circle cx={hover.x} cy={hover.y} r="3" fill="#3b5bdb" /></>)}
      </svg>
      {hover && (
        <div className="absolute pointer-events-none bg-[#1e2535] text-white rounded-lg px-3 py-2 text-[11px] shadow-lg z-10" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100 - 15}%`, transform: "translate(-50%, -100%)" }}>
          <div className="font-semibold">{fmtDate(hover.point.date)}</div>
          <div className="flex gap-3 mt-1">
            <span>ROI: <strong className={hover.point.roi_pct >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}>{hover.point.roi_pct.toFixed(1)}%</strong></span>
            <span>P&L: <strong className={hover.point.cumulative_pnl >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}>{hover.point.cumulative_pnl >= 0 ? "+" : ""}{hover.point.cumulative_pnl.toFixed(0)}€</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sport Bars ── */
function SportBars({ data }: { data: SportBreakdown[] }) {
  if (data.length === 0) {
    return <div className="h-[120px] flex items-center justify-center text-[13px] text-[#b0b7c3]">Aucune donnée</div>;
  }
  const SPORT_COLORS: Record<string, string> = { football: "#12b76a", tennis: "#3b5bdb", basketball: "#f04438" };
  const maxAbs = Math.max(...data.map((s) => Math.abs(s.roi_pct)), 1);

  return (
    <div className="flex flex-col gap-3">
      {data.map((s) => {
        const color = SPORT_COLORS[s.sport] || "#8a919e";
        const isNeg = s.roi_pct < 0;
        const barPct = Math.max(8, Math.round((Math.abs(s.roi_pct) / maxAbs) * 100));
        return (
          <div key={s.sport} className="flex items-center gap-3">
            <span className="text-[12px] w-[70px] capitalize text-[#3c4149] font-medium">{s.sport}</span>
            <div className="flex-1 h-[22px] bg-[#f4f5f7] rounded-[5px] overflow-hidden relative">
              <div className="h-full rounded-[5px] transition-all" style={{ width: `${barPct}%`, background: isNeg ? "#f04438" : color, opacity: 0.85 }} />
            </div>
            <span className="text-[12px] font-bold w-[50px] text-right" style={{ color: isNeg ? "#f04438" : color }}>
              {isNeg ? "" : "+"}{s.roi_pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
      {/* Légende sous les barres */}
      <div className="flex gap-4 pt-1">
        {data.map((s) => (
          <div key={s.sport} className="text-[10.5px] text-[#8a919e]">
            {s.won}W-{s.lost}L · P&L: {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(0)}€
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Donut Chart ── */
function DonutChart({ won, lost, pending, total }: { won: number; lost: number; pending: number; total: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const t = won + lost + pending || 1;
  const wonPct = won / t, lostPct = lost / t, pendPct = pending / t;
  const wonLen = wonPct * circ, lostLen = lostPct * circ, pendLen = pendPct * circ;
  const wonOffset = circ * 0.25, lostOffset = wonOffset - wonLen, pendOffset = lostOffset - lostLen;

  const legend = [
    { label: "Gagnés", count: won, pct: Math.round(wonPct * 100), color: "#12b76a" },
    { label: "Perdus", count: lost, pct: Math.round(lostPct * 100), color: "#f04438" },
    { label: "En attente", count: pending, pct: Math.round(pendPct * 100), color: "#f79009" },
  ];

  return (
    <div className="flex items-center gap-6 w-full justify-center">
      <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#f4f5f7" strokeWidth="16" />
        {wonLen > 0 && <circle cx="65" cy="65" r={r} fill="none" stroke="#12b76a" strokeWidth="16" strokeDasharray={`${wonLen} ${circ - wonLen}`} strokeDashoffset={wonOffset} strokeLinecap="round" />}
        {lostLen > 0 && <circle cx="65" cy="65" r={r} fill="none" stroke="#f04438" strokeWidth="16" strokeDasharray={`${lostLen} ${circ - lostLen}`} strokeDashoffset={lostOffset} strokeLinecap="round" />}
        {pendLen > 0 && <circle cx="65" cy="65" r={r} fill="none" stroke="#f79009" strokeWidth="16" strokeDasharray={`${pendLen} ${circ - pendLen}`} strokeDashoffset={pendOffset} strokeLinecap="round" />}
        <text x="65" y="59" textAnchor="middle" className="text-[20px] font-extrabold fill-[#111318]">{total}</text>
        <text x="65" y="75" textAnchor="middle" className="text-[10px] fill-[#8a919e]">tickets</text>
      </svg>
      <div className="flex flex-col gap-2.5">
        {legend.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5 text-[13px]">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-[#8a919e] min-w-[70px]">{item.label}</span>
            <span className="font-bold text-[#3c4149]">{item.count}</span>
            <span className="text-[#8a919e]">{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Streak Row ── */
function StreakRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#f9fafb]">
      <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">{icon}</div>
      <div className="flex-1">
        <div className="text-[11px] text-[#8a919e]">{label}</div>
        <div className="text-[13px] font-bold" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}
