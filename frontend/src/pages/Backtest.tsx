import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FlaskConical, Zap, SlidersHorizontal, RotateCcw,
  ChevronDown, Download, Save, Plus, Trash2, Clock, Trophy,
  AlertTriangle, CheckCircle, XCircle,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot,
} from "recharts";
import { runBacktest, saveBacktest, getSavedBacktests, deleteSavedBacktest } from "@/services/api";
import { Alert } from "@/components/ui";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { backtestTour } from "@/tours/index";
import type { BacktestResponse, BacktestParams, StakingStrategy, SavedBacktestSummary, BacktestBet } from "@/types";

// ── Constants ──

const ACCENT = "#3b5bdb";
const GREEN = "#12b76a";
const RED = "#f04438";
const AMBER = "#f79009";
const PURPLE = "#7c3aed";
const STRAT_COLORS = [ACCENT, GREEN, PURPLE];

const DEFAULT_PARAMS: BacktestParams = {
  initial_bankroll: 500,
  staking_strategy: "half_kelly",
  flat_stake_amount: 20,
  pct_bankroll: 0.02,
  kelly_fraction: 0.5,
  max_stake_pct: 0.10,
  min_edge: 0.05,
  min_model_prob: 0.55,
  max_odds: null,
  min_odds: null,
  stop_loss_daily_pct: null,
  stop_loss_total_pct: null,
  combo_mode: false,
  combo_max_legs: 4,
  combo_min_odds: 1.8,
  combo_max_odds: 3.0,
  combo_top_n: 3,
  test_seasons: ["2324", "2425"],
  sport: "football",
  allowed_outcomes: null,
  excluded_leagues: null,
};

const EDGE_PRESETS = [
  { value: 0.03, label: "3%", desc: "Prudent" },
  { value: 0.05, label: "5%", desc: "Équilibré" },
  { value: 0.08, label: "8%", desc: "Agressif" },
];

const STAKING_OPTIONS: { key: StakingStrategy; name: string; desc: string }[] = [
  { key: "flat", name: "Fixe", desc: "€/pari" },
  { key: "half_kelly", name: "½ Kelly", desc: "Selon edge" },
  { key: "pct_bankroll", name: "% BK", desc: "% bankroll" },
];

const SPORT_PERIODS: Record<string, { emoji: string; label: string; train: string; test: string }> = {
  football: { emoji: "⚽", label: "Football",    train: "2018–2023 (5 saisons)", test: "2023–2025" },
  tennis:   { emoji: "🎾", label: "Tennis ATP",  train: "2019–2023 (5 ans)",     test: "2024–2025" },
  nba:      { emoji: "🏀", label: "NBA",          train: "2018–2023 (5 saisons)", test: "2023–2025" },
  rugby:    { emoji: "🏉", label: "Rugby Union",  train: "2019–2023 (5 saisons)", test: "2024–2025" },
  pmu:      { emoji: "🐎", label: "Courses PMU",  train: "80% chronologique",     test: "20% recentes" },
  mlb:      { emoji: "⚾", label: "MLB",           train: "2019–2022 (4 saisons)", test: "2023–2025" },
};

function periodLabel(sports: Set<string>): string {
  if (sports.size === 1) {
    const s = [...sports][0];
    return `${SPORT_PERIODS[s]?.test ?? "fixe"} (fixe)`;
  }
  return [...sports].map(s => `${SPORT_PERIODS[s]?.emoji ?? s} ${SPORT_PERIODS[s]?.test ?? ""}`).join(" · ");
}

// ── Helpers ──

function formatEur(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}€`;
}
function formatPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function getAlerts(m: BacktestResponse["metrics"], totalDays: number) {
  const alerts: { type: "ok" | "warn" | "err"; msg: string }[] = [];
  const betsPerMonth = totalDays > 0 ? (m.total_bets / totalDays) * 30 : 0;
  if (m.roi_pct > 10 && m.max_drawdown_pct < 15)
    alerts.push({ type: "ok", msg: `<strong>Stratégie solide</strong> : ROI positif, drawdown maîtrisé sous 15%.` });
  if (betsPerMonth < 5)
    alerts.push({ type: "warn", msg: `<strong>Sur-filtrage détecté</strong> : Moins de 5 paris / 30 jours. Élargissez les filtres.` });
  if (betsPerMonth > 200)
    alerts.push({ type: "warn", msg: `<strong>Sous-filtrage</strong> : Plus de 200 paris / 30 jours, variance élevée.` });
  if (m.roi_pct < -10)
    alerts.push({ type: "err", msg: `<strong>Stratégie non rentable</strong> : ROI simulé < -10%. Ajustez vos paramètres.` });
  if (m.max_drawdown_pct > 30)
    alerts.push({ type: "err", msg: `<strong>Drawdown élevé</strong> (${m.max_drawdown_pct.toFixed(1)}%) : risque de ruine bankroll.` });
  return alerts;
}

const alertIcon = (t: string) =>
  t === "ok" ? <CheckCircle size={15} /> : t === "warn" ? <AlertTriangle size={15} /> : <XCircle size={15} />;
const alertCls = (t: string) =>
  t === "ok"
    ? "bg-[#12b76a]/8 text-[#0a8a4a] border border-[#12b76a]/20"
    : t === "warn"
      ? "bg-[#f79009]/8 text-[#b45309] border border-[#f79009]/20"
      : "bg-[#f04438]/7 text-[#c0392b] border border-[#f04438]/20";

// ── Multi-sport merge helper ──
function mergeBacktestResults(res1: BacktestResponse, res2: BacktestResponse, initialBankroll: number): BacktestResponse {
  const merged = [...res1.bets, ...res2.bets].sort((a, b) => a.date.localeCompare(b.date));
  let bankroll = initialBankroll;
  const curve: number[] = [bankroll];
  let peak = bankroll, maxDd = 0;
  let curWin = 0, curLose = 0, maxWinStreak = 0, maxLoseStreak = 0;
  for (const bet of merged) {
    bankroll += bet.pnl;
    curve.push(bankroll);
    if (bankroll > peak) peak = bankroll;
    const dd = peak > 0 ? (peak - bankroll) / peak * 100 : 0;
    if (dd > maxDd) maxDd = dd;
    if (bet.won) { curWin++; curLose = 0; if (curWin > maxWinStreak) maxWinStreak = curWin; }
    else { curLose++; curWin = 0; if (curLose > maxLoseStreak) maxLoseStreak = curLose; }
  }
  const wins = merged.filter(b => b.won).length;
  const totalStaked = merged.reduce((sum, b) => sum + b.stake, 0);
  const totalPnl = merged.reduce((sum, b) => sum + b.pnl, 0);
  const clvBets = merged.filter(b => b.clv != null);
  return {
    bets: merged,
    bankroll_curve: curve,
    config: res1.config,
    metrics: {
      total_bets: merged.length,
      wins,
      losses: merged.length - wins,
      win_rate: merged.length > 0 ? wins / merged.length : 0,
      total_staked: totalStaked,
      total_pnl: totalPnl,
      roi_pct: totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0,
      final_bankroll: bankroll,
      bankroll_growth_pct: initialBankroll > 0 ? ((bankroll - initialBankroll) / initialBankroll) * 100 : 0,
      max_drawdown_pct: maxDd,
      longest_losing_streak: maxLoseStreak,
      longest_winning_streak: maxWinStreak,
      avg_edge: merged.length > 0 ? merged.reduce((s, b) => s + b.edge, 0) / merged.length : 0,
      avg_odds: merged.length > 0 ? merged.reduce((s, b) => s + b.odds, 0) / merged.length : 0,
      avg_clv: clvBets.length > 0 ? clvBets.reduce((s, b) => s + (b.clv ?? 0), 0) / clvBets.length : null,
      avg_ev_per_bet: merged.length > 0 ? totalPnl / merged.length : 0,
    },
  };
}

// ── Shared styles ──
const cardCls = "bg-white border-[1.5px] border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,.06),0_1px_2px_rgba(16,24,40,.04)]";
const labelCls = "block text-xs font-semibold text-[#3c4149] mb-1.5";
const inputCls = "w-full px-3 py-2 border-[1.5px] border-[#e3e6eb] rounded-lg text-[13.5px] text-[#111318] bg-[#f4f5f7] outline-none transition-all focus:border-[#3b5bdb] focus:bg-white focus:ring-[3px] focus:ring-[#3b5bdb]/7 font-[Plus_Jakarta_Sans,sans-serif]";
const selectCls = inputCls;

// ── Strategy result type ──
interface StratResult {
  id: number;
  label: string;
  params: BacktestParams;
  response: BacktestResponse;
}

// ── Component ──

export default function Backtest() {
  const navigate = useNavigate();
  const { showTour, completeTour } = useTour("backtest");

  // Mode
  const [mode, setMode] = useState<"quick" | "adv">("quick");

  // Sport multi-select
  const [sports, setSports] = useState<Set<"football" | "tennis" | "nba" | "rugby" | "pmu" | "mlb">>(new Set(["football"]));

  // Params (strategy 1 — editable)
  const [params, setParams] = useState<BacktestParams>({ ...DEFAULT_PARAMS });

  // Results — up to 3 strategies
  const [results, setResults] = useState<StratResult[]>([]);
  const [activeStrat, setActiveStrat] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Bets table
  const [betsFilter, setBetsFilter] = useState<"all" | "won" | "lost">("all");
  const [betsPage, setBetsPage] = useState(0);
  const BETS_PER_PAGE = 20;

  // Saved backtests
  const [savedList, setSavedList] = useState<SavedBacktestSummary[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Accordion state (advanced mode)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ filters: true });

  // Load saved on mount
  useEffect(() => {
    getSavedBacktests().then(setSavedList).catch(() => {});
  }, []);

  // ── Run backtest ──
  const handleRun = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sportList = [...sports] as ("football" | "tennis" | "nba" | "rugby" | "pmu" | "mlb")[];
      const sportEmoji: Record<string, string> = { football: "⚽", tennis: "🎾", nba: "🏀", rugby: "🏉", pmu: "🐎", mlb: "⚾" };
      let data: BacktestResponse;
      let sportLabel: string;
      let sportKey: string;
      if (sportList.length === 1) {
        data = await runBacktest({ ...params, sport: sportList[0] });
        sportLabel = sportEmoji[sportList[0]] ?? sportList[0];
        sportKey = sportList[0];
      } else {
        const allRes = await Promise.allSettled(sportList.map(s => runBacktest({ ...params, sport: s })));
        const successRes = allRes
          .filter((r): r is PromiseFulfilledResult<import("../types").BacktestResponse> => r.status === "fulfilled")
          .map(r => r.value);
        if (successRes.length === 0) throw new Error("Aucun backtest n'a abouti");
        data = successRes.reduce((acc, r) => mergeBacktestResults(acc, r, params.initial_bankroll));
        sportLabel = sportList.map(s => sportEmoji[s] ?? s).join("+");
        sportKey = sportList.join("+");
      }
      const newResult: StratResult = {
        id: results.length + 1,
        label: `Strat. ${results.length + 1} ${sportLabel}`,
        params: { ...params, sport: sportKey },
        response: data,
      };
      if (results.length === 0) {
        // First run
        setResults([newResult]);
        setActiveStrat(0);
      } else {
        // Always replace the active strategy — avoids accumulating mismatched sport results
        const updated = [...results];
        updated[activeStrat] = { ...newResult, id: results[activeStrat].id, label: `Strat. ${results[activeStrat].id} ${sportLabel}` };
        setResults(updated);
        setActiveStrat(activeStrat);
      }
      setBetsPage(0);
      setBetsFilter("all");
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, [params, results, sports]);

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!results[activeStrat] || !saveName.trim()) return;
    const r = results[activeStrat];
    try {
      const saved = await saveBacktest({
        name: saveName.trim(),
        sport: r.params.sport,
        params: r.params as unknown as Record<string, unknown>,
        metrics: r.response.metrics as unknown as Record<string, unknown>,
        bets: r.response.bets as unknown as Record<string, unknown>[],
        bankroll_curve: r.response.bankroll_curve,
        config: r.response.config,
      });
      setSavedList((prev) => [saved, ...prev]);
      setShowSaveModal(false);
      setSaveName("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [results, activeStrat, saveName]);

  // ── Delete saved ──
  const handleDeleteSaved = useCallback(async (id: number) => {
    try {
      await deleteSavedBacktest(id);
      setSavedList((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
  }, []);

  // ── Export CSV ──
  const handleExportCSV = useCallback(() => {
    if (!results[activeStrat]) return;
    const bets = results[activeStrat].response.bets;
    const header = "Date,Match,Issue,Cote,Mise,Résultat,P/L,Edge,CLV\n";
    const rows = bets.map((b) =>
      `${b.date},"${b.match}",${b.outcome_bet},${b.odds.toFixed(2)},${b.stake.toFixed(2)},${b.won ? "Gagné" : "Perdu"},${b.pnl.toFixed(2)},${(b.edge * 100).toFixed(1)}%,${b.clv != null ? (b.clv * 100).toFixed(2) + "%" : ""}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backtest_${results[activeStrat].label.replace(/\s/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, activeStrat]);

  // ── Derived: active result ──
  const activeResult = results[activeStrat]?.response ?? null;

  // ── Filtered bets for table ──
  const filteredBets = useMemo(() => {
    if (!activeResult) return [];
    if (betsFilter === "won") return activeResult.bets.filter((b) => b.won);
    if (betsFilter === "lost") return activeResult.bets.filter((b) => !b.won);
    return activeResult.bets;
  }, [activeResult, betsFilter]);

  const totalPages = Math.ceil(filteredBets.length / BETS_PER_PAGE);
  const pageBets = filteredBets.slice(betsPage * BETS_PER_PAGE, (betsPage + 1) * BETS_PER_PAGE);

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (results.length === 0) return [];
    const maxLen = Math.max(...results.map((r) => r.response.bankroll_curve.length));
    return Array.from({ length: maxLen }, (_, i) => {
      const point: Record<string, number> = { bet: i };
      results.forEach((r, si) => {
        if (i < r.response.bankroll_curve.length) {
          point[`s${si}`] = r.response.bankroll_curve[i];
        }
      });
      return point;
    });
  }, [results]);

  // Find drawdown max index + peak index for first strategy
  const { ddIdx, peakIdx } = useMemo(() => {
    if (!results[0]) return { ddIdx: -1, peakIdx: -1 };
    const curve = results[0].response.bankroll_curve;
    let peak = curve[0], ddMax = 0, ddI = -1, peakI = 0;
    for (let i = 1; i < curve.length; i++) {
      if (curve[i] > peak) { peak = curve[i]; peakI = i; }
      const dd = (peak - curve[i]) / peak;
      if (dd > ddMax) { ddMax = dd; ddI = i; }
    }
    return { ddIdx: ddI, peakIdx: peakI };
  }, [results]);

  // Total days for alert calculation
  const totalDays = useMemo(() => {
    if (!activeResult || activeResult.bets.length < 2) return 0;
    const first = new Date(activeResult.bets[0].date).getTime();
    const last = new Date(activeResult.bets[activeResult.bets.length - 1].date).getTime();
    return Math.max(1, (last - first) / 86400000);
  }, [activeResult]);

  const alerts = activeResult ? getAlerts(activeResult.metrics, totalDays) : [];

  // ── Param helpers ──
  const p = params;
  const set = (patch: Partial<BacktestParams>) => setParams((prev) => ({ ...prev, ...patch }));
  const toggleSection = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleSportBt = (s: "football" | "tennis" | "nba" | "rugby" | "pmu" | "mlb") => {
    setSports(prev => {
      const next = new Set(prev);
      if (next.has(s)) { if (next.size > 1) next.delete(s); }
      else { next.add(s); }
      return next;
    });
  };

  const handleCreateCampaign = () => {
    navigate("/campaign", { state: { prefillBacktest: results[activeStrat]?.params } });
  };

  const stakingLabel = (s: StakingStrategy) =>
    s === "flat" ? "Fixe" : s === "half_kelly" ? "½ Kelly" : s === "pct_bankroll" ? "% BK" : "Kelly Dyn.";

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[#111318] tracking-tight">Backtest</h1>
          <p className="text-[12.5px] text-[#8a919e] mt-0.5">
            Simulez vos stratégies sur 1 à 3 saisons de données historiques réelles
          </p>
        </div>
        <div className="flex bg-white border-[1.5px] border-[#e3e6eb] rounded-[9px] p-[3px] gap-[2px]">
          <button
            onClick={() => setMode("quick")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-[7px] text-[13px] font-medium transition-all cursor-pointer ${
              mode === "quick" ? "bg-[#3b5bdb] text-white font-semibold" : "text-[#8a919e] hover:text-[#3c4149]"
            }`}
          >
            <Zap size={13} /> Mode rapide
          </button>
          <button
            onClick={() => setMode("adv")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-[7px] text-[13px] font-medium transition-all cursor-pointer ${
              mode === "adv" ? "bg-[#3b5bdb] text-white font-semibold" : "text-[#8a919e] hover:text-[#3c4149]"
            }`}
          >
            <SlidersHorizontal size={13} /> Mode avancé
          </button>
        </div>
      </div>

      {/* ── Params Card ── */}
      <div className={cardCls} data-tour="params-card">
        <div className="px-5 py-3.5 border-b border-[#e3e6eb] flex items-center justify-between">
          <div className="text-[13.5px] font-bold flex items-center gap-2">
            <FlaskConical size={15} style={{ color: ACCENT }} />
            Paramètres de simulation
          </div>
          {results.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#8a919e]">Stratégies :</span>
              {results.map((r, i) => (
                <button key={r.id} onClick={() => setActiveStrat(i)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-[7px] text-[12.5px] font-semibold border-[1.5px] transition-all cursor-pointer"
                  style={{
                    color: STRAT_COLORS[i],
                    background: `${STRAT_COLORS[i]}10`,
                    borderColor: i === activeStrat ? `${STRAT_COLORS[i]}40` : "#e3e6eb",
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: STRAT_COLORS[i] }} />
                  {r.label}
                </button>
              ))}
              {results.length < 3 && (
                <button onClick={handleRun} disabled={loading}
                  className="text-xs text-[#8a919e] px-2.5 py-1 rounded-[7px] border-[1.5px] border-dashed border-[#cdd1d9] hover:border-[#3b5bdb]/30 hover:text-[#3b5bdb] hover:bg-[#3b5bdb]/5 transition-all cursor-pointer"
                >
                  + Comparer
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-5">
          {/* ── Quick mode ── */}
          {mode === "quick" && (
            <>
              <div className="grid grid-cols-3 gap-3.5 mb-4">
                <div>
                  <label className={labelCls}>Sport</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {(["football", "tennis", "nba", "rugby", "pmu", "mlb"] as const).map(s => (
                      <button key={s} onClick={() => toggleSportBt(s)}
                        className={`flex-1 py-2 px-1 rounded-lg border-2 text-[13px] font-semibold text-center transition-all cursor-pointer min-w-[70px] ${
                          sports.has(s) ? "border-[#3b5bdb] bg-[#3b5bdb]/7 text-[#3b5bdb]" : "border-[#e3e6eb] text-[#3c4149] hover:border-[#3b5bdb]/30"
                        }`}>
                        {s === "football" ? "⚽ Football" : s === "tennis" ? "🎾 Tennis" : s === "nba" ? "🏀 NBA" : s === "rugby" ? "🏉 Rugby" : s === "pmu" ? "🐎 PMU" : "⚾ MLB"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Période historique</label>
                  <div className={`${inputCls} bg-[#f4f5f7] text-[#8a919e] cursor-not-allowed`}>
                    {periodLabel(sports)}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Bankroll de départ (€)</label>
                  <input type="number" className={inputCls} value={p.initial_bankroll}
                    onChange={(e) => set({ initial_bankroll: Number(e.target.value) || 100 })} min={100} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3.5 mb-4">
                <div>
                  <label className={labelCls}>Edge minimum</label>
                  <div className="flex gap-1.5">
                    {EDGE_PRESETS.map((ep) => (
                      <button key={ep.value} onClick={() => set({ min_edge: ep.value })}
                        className={`flex-1 border-2 rounded-lg py-2 px-1 text-center transition-all cursor-pointer ${
                          p.min_edge === ep.value ? "border-[#3b5bdb] bg-[#3b5bdb]/7" : "border-[#e3e6eb] hover:border-[#3b5bdb]/30"
                        }`}>
                        <div className={`text-[15px] font-extrabold font-mono ${p.min_edge === ep.value ? "text-[#3b5bdb]" : ""}`}>{ep.label}</div>
                        <div className="text-[10.5px] text-[#8a919e] mt-0.5">{ep.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Stratégie de mise</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {STAKING_OPTIONS.map((so) => (
                      <button key={so.key} onClick={() => set({ staking_strategy: so.key })}
                        className={`border-2 rounded-lg py-2 px-1 text-center transition-all cursor-pointer ${
                          p.staking_strategy === so.key ? "border-[#3b5bdb] bg-[#3b5bdb]/7" : "border-[#e3e6eb] hover:border-[#3b5bdb]/30"
                        }`}>
                        <div className={`text-[12.5px] font-bold ${p.staking_strategy === so.key ? "text-[#3b5bdb]" : ""}`}>{so.name}</div>
                        <div className="text-[11px] text-[#8a919e] mt-0.5">{so.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div data-tour="combo-toggle">
                  <label className={labelCls}>Mode Combis</label>
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#f4f5f7] border-[1.5px] border-[#e3e6eb] rounded-lg h-[72px]">
                    <label className="relative w-[38px] h-[21px] shrink-0 cursor-pointer">
                      <input type="checkbox" checked={p.combo_mode}
                        onChange={(e) => set({ combo_mode: e.target.checked })} className="sr-only peer" />
                      <span className="absolute inset-0 bg-[#cdd1d9] rounded-full peer-checked:bg-[#3b5bdb] transition-colors" />
                      <span className="absolute left-[2px] top-[2px] w-[17px] h-[17px] bg-white rounded-full shadow-sm peer-checked:translate-x-[17px] transition-transform" />
                    </label>
                    <div>
                      <div className="text-[13px] font-medium">{p.combo_mode ? "Combis activés" : "Simples uniquement"}</div>
                      {p.combo_mode && <div className="text-[11.5px] text-[#8a919e] mt-0.5">2–4 sélections max</div>}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Advanced mode ── */}
          {mode === "adv" && (
            <div className="space-y-2.5">
              {/* Filtres */}
              <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden">
                <button onClick={() => toggleSection("filters")}
                  className="w-full px-4 py-3 bg-[#f4f5f7] flex items-center justify-between cursor-pointer">
                  <span className="text-[13px] font-semibold text-[#3c4149] flex items-center gap-2">
                    <SlidersHorizontal size={14} className="text-[#8a919e]" /> Filtres de sélection
                  </span>
                  <ChevronDown size={13} className={`text-[#8a919e] transition-transform ${openSections.filters ? "rotate-180" : ""}`} />
                </button>
                {openSections.filters && (
                  <div className="p-4 grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Confiance min</label>
                      <div className="flex items-center gap-2.5">
                        <input type="range" min={40} max={90} value={(p.min_model_prob ?? 0.55) * 100}
                          onChange={(e) => set({ min_model_prob: Number(e.target.value) / 100 })}
                          className="flex-1 accent-[#3b5bdb]" />
                        <span className="font-mono text-xs font-bold text-[#3b5bdb] min-w-[40px] text-right">
                          {((p.min_model_prob ?? 0.55) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Edge min</label>
                      <div className="flex items-center gap-2.5">
                        <input type="range" min={1} max={20} value={p.min_edge * 100}
                          onChange={(e) => set({ min_edge: Number(e.target.value) / 100 })}
                          className="flex-1 accent-[#3b5bdb]" />
                        <span className="font-mono text-xs font-bold text-[#3b5bdb] min-w-[40px] text-right">
                          +{(p.min_edge * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Cote min</label>
                      <input type="number" step={0.05} className={inputCls} value={p.min_odds ?? ""}
                        placeholder="ex: 1.40"
                        onChange={(e) => set({ min_odds: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div>
                      <label className={labelCls}>Cote max</label>
                      <input type="number" step={0.05} className={inputCls} value={p.max_odds ?? ""}
                        placeholder="ex: 3.50"
                        onChange={(e) => set({ max_odds: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div>
                      <label className={labelCls}>Sport</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {(["football", "tennis", "nba", "rugby", "pmu", "mlb"] as const).map(s => (
                          <button key={s} onClick={() => toggleSportBt(s)}
                            className={`flex-1 py-2 px-1 rounded-lg border-2 text-[13px] font-semibold text-center transition-all cursor-pointer min-w-[70px] ${
                              sports.has(s) ? "border-[#3b5bdb] bg-[#3b5bdb]/7 text-[#3b5bdb]" : "border-[#e3e6eb] text-[#3c4149] hover:border-[#3b5bdb]/30"
                            }`}>
                            {s === "football" ? "⚽ Football" : s === "tennis" ? "🎾 Tennis" : s === "nba" ? "🏀 NBA" : s === "rugby" ? "🏉 Rugby" : s === "pmu" ? "🐎 PMU" : "⚾ MLB"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Période</label>
                      <div className={`${inputCls} bg-[#f4f5f7] text-[#8a919e] cursor-not-allowed`}>
                        {periodLabel(sports)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bankroll & Mise */}
              <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden">
                <button onClick={() => toggleSection("bankroll")}
                  className="w-full px-4 py-3 bg-[#f4f5f7] flex items-center justify-between cursor-pointer">
                  <span className="text-[13px] font-semibold text-[#3c4149] flex items-center gap-2">
                    <Trophy size={14} className="text-[#8a919e]" /> Bankroll & Mise
                  </span>
                  <ChevronDown size={13} className={`text-[#8a919e] transition-transform ${openSections.bankroll ? "rotate-180" : ""}`} />
                </button>
                {openSections.bankroll && (
                  <div className="p-4 grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Bankroll de départ (€)</label>
                      <input type="number" className={inputCls} value={p.initial_bankroll}
                        onChange={(e) => set({ initial_bankroll: Number(e.target.value) || 100 })} />
                    </div>
                    <div>
                      <label className={labelCls}>Stratégie</label>
                      <select className={selectCls} value={p.staking_strategy}
                        onChange={(e) => set({ staking_strategy: e.target.value as StakingStrategy })}>
                        <option value="flat">Fixe</option>
                        <option value="half_kelly">½ Kelly</option>
                        <option value="pct_bankroll">% Bankroll</option>
                        <option value="kelly_dynamic">Kelly dynamique</option>
                      </select>
                    </div>
                    {p.staking_strategy === "flat" && (
                      <div>
                        <label className={labelCls}>Mise fixe (€)</label>
                        <input type="number" className={inputCls} value={p.flat_stake_amount ?? 20}
                          onChange={(e) => set({ flat_stake_amount: Number(e.target.value) || 20 })} />
                      </div>
                    )}
                    {p.staking_strategy === "pct_bankroll" && (
                      <div>
                        <label className={labelCls}>% de bankroll</label>
                        <input type="number" step={0.5} className={inputCls} value={(p.pct_bankroll * 100).toFixed(1)}
                          onChange={(e) => set({ pct_bankroll: (Number(e.target.value) || 2) / 100 })} />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Stop-loss journalier (%)</label>
                      <input type="number" className={inputCls}
                        value={p.stop_loss_daily_pct != null ? (p.stop_loss_daily_pct * 100).toFixed(0) : ""}
                        placeholder="désactivé"
                        onChange={(e) => set({ stop_loss_daily_pct: e.target.value ? Number(e.target.value) / 100 : null })} />
                    </div>
                    <div>
                      <label className={labelCls}>Stop-loss total (%)</label>
                      <input type="number" className={inputCls}
                        value={p.stop_loss_total_pct != null ? (p.stop_loss_total_pct * 100).toFixed(0) : ""}
                        placeholder="désactivé"
                        onChange={(e) => set({ stop_loss_total_pct: e.target.value ? Number(e.target.value) / 100 : null })} />
                    </div>
                  </div>
                )}
              </div>

              {/* Combis */}
              <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden">
                <button onClick={() => toggleSection("combis")}
                  className="w-full px-4 py-3 bg-[#f4f5f7] flex items-center justify-between cursor-pointer">
                  <span className="text-[13px] font-semibold text-[#3c4149] flex items-center gap-2">
                    <Plus size={14} className="text-[#8a919e]" /> Combis
                  </span>
                  <ChevronDown size={13} className={`text-[#8a919e] transition-transform ${openSections.combis ? "rotate-180" : ""}`} />
                </button>
                {openSections.combis && (
                  <div className="p-4" data-tour="combo-toggle">
                    <div className="flex items-center gap-3 mb-3">
                      <label className="relative w-[38px] h-[21px] shrink-0 cursor-pointer">
                        <input type="checkbox" checked={p.combo_mode}
                          onChange={(e) => set({ combo_mode: e.target.checked })} className="sr-only peer" />
                        <span className="absolute inset-0 bg-[#cdd1d9] rounded-full peer-checked:bg-[#3b5bdb] transition-colors" />
                        <span className="absolute left-[2px] top-[2px] w-[17px] h-[17px] bg-white rounded-full shadow-sm peer-checked:translate-x-[17px] transition-transform" />
                      </label>
                      <span className="text-[13px] font-medium">{p.combo_mode ? "Combis activés" : "Simples uniquement"}</span>
                    </div>
                    {p.combo_mode && (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Sélections min</label>
                          <input type="number" min={2} className={inputCls} value={2} readOnly />
                        </div>
                        <div>
                          <label className={labelCls}>Sélections max</label>
                          <input type="number" min={2} max={6} className={inputCls} value={p.combo_max_legs}
                            onChange={(e) => set({ combo_max_legs: Number(e.target.value) || 4 })} />
                        </div>
                        <div>
                          <label className={labelCls}>Cote totale max</label>
                          <input type="number" step={0.5} className={inputCls} value={p.combo_max_odds}
                            onChange={(e) => set({ combo_max_odds: Number(e.target.value) || 3 })} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Launch bar ── */}
          <div className="flex items-center justify-between pt-4 border-t border-[#e3e6eb] mt-4">
            <div className="text-xs text-[#8a919e] flex flex-wrap gap-x-3 gap-y-0.5">
              {[...sports].map((s) => {
                const cfg: Record<string, { emoji: string; label: string; train: string; test: string }> = {
                  football: { emoji: "⚽", label: "Football", train: "2018–2023 (5 saisons)", test: "2023–2025 (2 saisons)" },
                  tennis:   { emoji: "🎾", label: "Tennis ATP", train: "2019–2023 (5 ans)", test: "2024–2025 (2 ans)" },
                  nba:      { emoji: "🏀", label: "NBA", train: "2018–2023 (5 saisons)", test: "2023–2025 (2 saisons)" },
                  rugby:    { emoji: "🏉", label: "Rugby Union", train: "2019–2023 (5 saisons)", test: "2024–2025 (2 saisons)" },
                  mlb:      { emoji: "\u26BE", label: "MLB", train: "2019\u20132023 (5 saisons)", test: "2023\u20132025 (2 saisons)" },
                  pmu:      { emoji: "\uD83D\uDC0E", label: "Courses PMU", train: "80% chronologique", test: "20% recentes" },
                };
                const c = cfg[s];
                if (!c) return null;
                return (
                  <span key={s}>
                    <strong className="text-[#3c4149]">{c.emoji} {c.label}</strong>
                    {" — "}train : {c.train} · test : <strong className="text-[#3c4149]">{c.test}</strong>
                  </span>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setParams({ ...DEFAULT_PARAMS }); setResults([]); }}
                className="px-4 py-2 rounded-lg border border-[#e3e6eb] text-[13px] font-medium text-[#8a919e] hover:text-[#3c4149] hover:border-[#cdd1d9] transition-all cursor-pointer flex items-center gap-1.5">
                <RotateCcw size={13} /> Réinitialiser
              </button>
              <button data-tour="run-btn" onClick={handleRun} disabled={loading}
                className={`px-6 py-2.5 rounded-[10px] text-sm font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-[0_2px_10px_rgba(59,91,219,.3)] ${
                  loading ? "bg-[#cdd1d9] cursor-not-allowed" : "bg-[#3b5bdb] hover:bg-[#2f4ac7] hover:-translate-y-px"
                }`}>
                <FlaskConical size={14} />
                {loading ? "Simulation en cours…" : results.length > 0 ? "Relancer" : "Lancer la simulation"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* ══════════ RESULTS ══════════ */}
      {results.length > 0 && activeResult && (
        <div className="space-y-3.5" data-tour="results-stats">
          {/* Alerts */}
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-2.5 px-4 py-3 rounded-[10px] text-[12.5px] font-medium ${alertCls(a.type)}`}>
              {alertIcon(a.type)}
              <span dangerouslySetInnerHTML={{ __html: a.msg }} />
            </div>
          ))}

          {/* KPI Strip */}
          <div className="grid grid-cols-6 gap-2.5">
            {[
              { label: "ROI simulé", val: formatPct(activeResult.metrics.roi_pct), color: activeResult.metrics.roi_pct >= 0 ? GREEN : RED },
              { label: "Taux réussite", val: `${(activeResult.metrics.win_rate * 100).toFixed(1)}%` },
              { label: "Drawdown max", val: `−${activeResult.metrics.max_drawdown_pct.toFixed(1)}%`, color: AMBER },
              { label: "Paris générés", val: `${activeResult.metrics.total_bets}` },
              { label: "Gain net simulé", val: formatEur(activeResult.metrics.total_pnl), color: activeResult.metrics.total_pnl >= 0 ? GREEN : RED },
              { label: "EV moyen/pari", val: `${activeResult.metrics.avg_ev_per_bet >= 0 ? "+" : ""}${activeResult.metrics.avg_ev_per_bet.toFixed(2)}€` },
            ].map((k) => (
              <div key={k.label} className={`${cardCls} px-3.5 py-3`}>
                <div className="text-lg font-extrabold font-mono tracking-tight" style={k.color ? { color: k.color } : undefined}>{k.val}</div>
                <div className="text-[10.5px] text-[#8a919e] mt-1">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Bankroll Chart */}
          <div className={`${cardCls} p-5`} data-tour="bankroll-chart">
            <h3 className="text-[13px] font-bold mb-3.5">
              Courbe de bankroll simulée {results.length > 1 ? `— ${results.length} stratégies comparées` : ""}
            </h3>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e6eb" />
                  <XAxis dataKey="bet" stroke="#8a919e" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#8a919e" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(0)}€`} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e3e6eb", borderRadius: 8, boxShadow: "0 4px 16px rgba(16,24,40,.08)", fontSize: 12 }}
                    formatter={(v: number | undefined, name: string | undefined) => [`${(v ?? 0).toFixed(2)}€`, results[Number((name ?? "").replace("s", ""))]?.label || name || ""]}
                  />
                  {results.map((_, i) => (
                    <Line key={i} type="monotone" dataKey={`s${i}`} stroke={STRAT_COLORS[i]}
                      strokeWidth={i === 0 ? 2.5 : 2} strokeDasharray={i > 0 ? "6,3" : undefined} dot={false} />
                  ))}
                  {ddIdx >= 0 && chartData[ddIdx] && (
                    <ReferenceDot x={ddIdx} y={chartData[ddIdx].s0} r={4} fill={RED} stroke="white" strokeWidth={2} />
                  )}
                  {peakIdx >= 0 && chartData[peakIdx] && (
                    <ReferenceDot x={peakIdx} y={chartData[peakIdx].s0} r={4} fill={GREEN} stroke="white" strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2.5 text-[11px] text-[#8a919e]">
              {results.map((r, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="w-4 h-[2.5px] rounded-sm" style={{ background: STRAT_COLORS[i] }} />
                  {r.label} : {stakingLabel(r.params.staking_strategy)} · Edge {(r.params.min_edge * 100).toFixed(0)}%
                </span>
              ))}
              {ddIdx >= 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f04438]" /> Drawdown max</span>}
              {peakIdx >= 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#12b76a]" /> Peak</span>}
            </div>
          </div>

          {/* Comparison Table */}
          {results.length > 1 && (
            <div className={`${cardCls} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-[#e3e6eb] text-[13px] font-bold">Comparaison des stratégies</div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#f4f5f7] border-b-[1.5px] border-[#e3e6eb]">
                    <th className="px-3.5 py-2.5 text-left text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider">Métrique</th>
                    {results.map((r, i) => (
                      <th key={i} className="px-3.5 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider" style={{ color: STRAT_COLORS[i] }}>
                        {r.label} : {stakingLabel(r.params.staking_strategy)} · Edge {(r.params.min_edge * 100).toFixed(0)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["ROI simulé", "Taux réussite", "Drawdown max", "Paris générés", "Gain net", "EV moyen / pari"] as const).map((metric) => (
                    <tr key={metric} className="border-b border-[#e3e6eb] last:border-b-0 hover:bg-[#f4f5f7]">
                      <td className="px-3.5 py-2.5">{metric}</td>
                      {results.map((r, i) => {
                        const m = r.response.metrics;
                        let val = "";
                        let c = STRAT_COLORS[i];
                        switch (metric) {
                          case "ROI simulé": val = formatPct(m.roi_pct); break;
                          case "Taux réussite": val = `${(m.win_rate * 100).toFixed(1)}%`; break;
                          case "Drawdown max": val = `−${m.max_drawdown_pct.toFixed(1)}%`; c = AMBER; break;
                          case "Paris générés": val = `${m.total_bets}`; break;
                          case "Gain net": val = formatEur(m.total_pnl); break;
                          case "EV moyen / pari": val = `${m.avg_ev_per_bet >= 0 ? "+" : ""}${m.avg_ev_per_bet.toFixed(2)}€`; break;
                        }
                        return <td key={i} className="px-3.5 py-2.5 font-bold font-mono" style={{ color: c }}>{val}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bets Table */}
          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-[#e3e6eb] flex items-center justify-between">
              <div className="text-[13px] font-bold">
                Paris simulés : {results[activeStrat]?.label}{" "}
                <span className="text-[12px] text-[#8a919e] font-normal">({activeResult.metrics.total_bets} total)</span>
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex bg-[#f4f5f7] border border-[#e3e6eb] rounded-[7px] p-[3px] gap-px">
                  {([["all", "Tous"], ["won", "Gagnés"], ["lost", "Perdus"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => { setBetsFilter(k); setBetsPage(0); }}
                      className={`px-2.5 py-1 rounded-[5px] text-xs font-medium transition-all cursor-pointer ${
                        betsFilter === k ? "bg-[#3b5bdb] text-white font-semibold" : "text-[#8a919e]"
                      }`}>{l}</button>
                  ))}
                </div>
                <button onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e3e6eb] text-xs font-medium text-[#3c4149] hover:bg-[#f4f5f7] transition-all cursor-pointer">
                  <Download size={12} /> Export CSV
                </button>
              </div>
            </div>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-[#f4f5f7] border-b-[1.5px] border-[#e3e6eb]">
                  {["Date", "Match", "Issue", "Cote", "Mise sim.", "Résultat", "Gain/Perte", "Edge", "CLV"].map((h, i) => (
                    <th key={h} className={`px-3.5 py-2.5 text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider ${
                      i >= 3 && i <= 4 ? "text-right" : i === 5 ? "text-center" : i >= 6 ? "text-right" : "text-left"
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageBets.map((b: BacktestBet, i: number) => (
                  <tr key={i} className="border-b border-[#e3e6eb] last:border-b-0 hover:bg-[#f4f5f7]">
                    <td className="px-3.5 py-2.5 text-[#8a919e] font-mono">{b.date.replace(/-/g, "/").slice(5)}</td>
                    <td className="px-3.5 py-2.5 font-semibold">{b.match.length > 35 ? b.match.substring(0, 35) + "…" : b.match}</td>
                    <td className="px-3.5 py-2.5">{b.outcome_bet === "H" ? "Dom" : b.outcome_bet === "A" ? "Ext" : b.outcome_bet}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-semibold">{b.odds.toFixed(2)}</td>
                    <td className="px-3.5 py-2.5 text-right text-[#8a919e] font-mono">{b.stake.toFixed(0)}€</td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-semibold font-mono ${
                        b.won ? "bg-[#12b76a]/8 text-[#12b76a]" : "bg-[#f04438]/7 text-[#f04438]"
                      }`}>{b.won ? "Gagné" : "Perdu"}</span>
                    </td>
                    <td className={`px-3.5 py-2.5 text-right font-mono font-bold ${b.pnl >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                      {b.pnl >= 0 ? "+" : ""}{b.pnl.toFixed(2)}€
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[#12b76a] font-mono text-xs">+{(b.edge * 100).toFixed(1)}%</td>
                    <td className="px-3.5 py-2.5 text-right">
                      {b.clv != null ? (
                        <span className={`text-[10.5px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                          b.clv >= 0 ? "bg-[#12b76a]/8 text-[#12b76a]" : "bg-[#f04438]/7 text-[#f04438]"
                        }`}>{b.clv >= 0 ? "+" : ""}{(b.clv * 100).toFixed(1)}%</span>
                      ) : <span className="text-[#8a919e]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#e3e6eb] text-xs text-[#8a919e]">
              <span>{filteredBets.length} paris · page {betsPage + 1} / {Math.max(1, totalPages)}</span>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = totalPages <= 5 ? i : betsPage <= 2 ? i : Math.min(betsPage - 2 + i, totalPages - 1);
                  return (
                    <button key={page} onClick={() => setBetsPage(page)}
                      className={`w-[26px] h-[26px] rounded-[5px] border text-xs cursor-pointer ${
                        page === betsPage ? "bg-[#3b5bdb] text-white border-[#3b5bdb]" : "border-[#e3e6eb] text-[#3c4149]"
                      }`}>{page + 1}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actions bar */}
          <div className={`${cardCls} px-5 py-4 flex items-center justify-between`} style={{ borderColor: `${ACCENT}30` }}>
            <div>
              <div className="text-[13.5px] font-bold">Vous aimez ces résultats ?</div>
              <div className="text-xs text-[#8a919e] mt-0.5">Créez une campagne avec exactement ces paramètres, pré-remplie automatiquement.</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#e3e6eb] text-[12.5px] font-medium text-[#3c4149] hover:bg-[#f4f5f7] transition-all cursor-pointer">
                <Save size={13} /> Sauvegarder
              </button>
              <button onClick={handleCreateCampaign}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3b5bdb] text-white text-[13px] font-semibold hover:bg-[#2f4ac7] transition-all cursor-pointer">
                <Plus size={13} /> Créer une campagne avec ces paramètres
              </button>
            </div>
          </div>

          <p className="text-[11px] text-[#b0b7c3] text-center">
            Les résultats de simulation ne garantissent pas les performances futures. Les données historiques reflètent des conditions passées du marché.
          </p>
        </div>
      )}

      {/* ── Saved Backtests ── */}
      {savedList.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold mb-2 mt-2">Backtests sauvegardés</h3>
          <div className="space-y-1.5">
            {savedList.map((s) => (
              <div key={s.id} className={`${cardCls} flex items-center gap-3 px-4 py-3 hover:border-[#3b5bdb]/30 hover:bg-[#3b5bdb]/3 transition-all cursor-pointer`}>
                <span className="text-base">{s.sport === "football" ? "⚽" : s.sport === "tennis" ? "🎾" : s.sport === "nba" ? "🏀" : s.sport === "rugby" ? "🏉" : s.sport === "pmu" ? "🐎" : s.sport === "mlb" ? "⚾" : "⚽+🎾"}</span>
                <span className="text-[13px] font-semibold flex-1">{s.name}</span>
                <span className="text-[11px] text-[#8a919e] font-mono flex items-center gap-1">
                  <Clock size={11} /> {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                </span>
                <span className="text-[13px] font-extrabold font-mono" style={{ color: s.roi_pct >= 0 ? GREEN : RED }}>
                  {formatPct(s.roi_pct)}
                </span>
                <span className="text-[11px] text-[#8a919e]">{s.total_bets} paris</span>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteSaved(s.id); }}
                  className="text-[#8a919e] hover:text-[#f04438] transition-colors cursor-pointer p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Save Modal ── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white rounded-xl p-6 w-[400px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold mb-3">Sauvegarder ce backtest</h3>
            <input type="text" className={inputCls}
              placeholder="Nom du backtest (ex: Football Edge 5% · ½ Kelly)"
              value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSave()} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg border border-[#e3e6eb] text-[13px] text-[#8a919e] cursor-pointer">Annuler</button>
              <button onClick={handleSave} disabled={!saveName.trim()}
                className="px-4 py-2 rounded-lg bg-[#3b5bdb] text-white text-[13px] font-semibold cursor-pointer disabled:opacity-50">Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {showTour && <SpotlightTour steps={backtestTour} onComplete={completeTour} />}
    </div>
  );
}
