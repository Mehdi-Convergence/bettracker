import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  listDashboardPresets,
  createDashboardPreset,
  updateDashboardPreset,
  deleteDashboardPreset,
  activateDashboardPreset,
  duplicateDashboardPreset,
} from "@/services/api";
import type { PortfolioStats, Bet, DashboardSummary, SportBreakdown, UserPreferences } from "@/types";
import { DashboardGrid, type DashboardWidget } from "../components/dashboard/DashboardGrid";
import { DashboardToolbar, type PresetInfo } from "../components/dashboard/DashboardToolbar";
import { WidgetPicker } from "../components/dashboard/WidgetPicker";
import { WidgetConfigPanel } from "../components/dashboard/WidgetConfigPanel";
import { widgetRegistry, type WidgetType, type WidgetConfig, type MetricKey, type SeriesKey, type BreakdownKey } from "../components/widgets/registry";
import {
  StatCard,
  TrendCard,
  GaugeWidget,
  LineChartWidget,
  PieChartWidget,
  BarChartWidget,
  DataTableWidget,
  ActivityFeedWidget,
  ValueBetsWidget,
} from "../components/widgets";
import { getWidgetData } from "../services/api";

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

/* ── Widget IDs for V3 ── */
type V3WidgetId =
  | "campaign-banner"
  | "bankroll-initial"
  | "bankroll-current"
  | "bankroll-pnl"
  | "kpi-roi"
  | "kpi-staked"
  | "kpi-tickets"
  | "kpi-winrate"
  | "roi-chart"
  | "pnl-chart"
  | "recent-tickets"
  | "sport-breakdown"
  | "streaks";

/* ── Default layout (12 cols) ── */
const DEFAULT_V3_WIDGETS: DashboardWidget[] = [
  { id: "campaign-banner", type: "stat-card", title: "Campagnes", x: 0, y: 0, w: 12, h: 1 },
  { id: "bankroll-initial", type: "stat-card", title: "Bankroll Initiale", x: 0, y: 1, w: 4, h: 2 },
  { id: "bankroll-current", type: "stat-card", title: "Solde Actuel", x: 4, y: 1, w: 4, h: 2 },
  { id: "bankroll-pnl", type: "stat-card", title: "Variation P&L", x: 8, y: 1, w: 4, h: 2 },
  { id: "kpi-roi", type: "stat-card", title: "ROI", x: 0, y: 3, w: 3, h: 3 },
  { id: "kpi-staked", type: "stat-card", title: "Mise", x: 3, y: 3, w: 3, h: 3 },
  { id: "kpi-tickets", type: "stat-card", title: "Tickets", x: 6, y: 3, w: 3, h: 3 },
  { id: "kpi-winrate", type: "stat-card", title: "Win Rate", x: 9, y: 3, w: 3, h: 3 },
  { id: "roi-chart", type: "line-chart", title: "Evolution ROI", x: 0, y: 6, w: 5, h: 5 },
  { id: "pnl-chart", type: "line-chart", title: "P&L Cumulé", x: 5, y: 6, w: 4, h: 5 },
  { id: "recent-tickets", type: "activity-feed", title: "Tickets récents", x: 9, y: 6, w: 3, h: 10 },
  { id: "sport-breakdown", type: "bar-chart", title: "Performance & Répartition", x: 0, y: 11, w: 5, h: 5 },
  { id: "streaks", type: "stat-card", title: "Streaks & Records", x: 5, y: 11, w: 4, h: 5 },
];

/* ══════════════════════════════════════════════
   DASHBOARD V3
   ══════════════════════════════════════════════ */
export default function DashboardV3() {
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
  const [genericWidgetData, setGenericWidgetData] = useState<Record<string, unknown> | null>(null);

  /* ── Grid state ── */
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_V3_WIDGETS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);

  const { fromDate, toDate } = useMemo(() => {
    if (period === "custom" && customFrom && customTo) return { fromDate: customFrom, toDate: customTo };
    const p = PERIODS.find((x) => x.key === period);
    if (p && p.days > 0) return { fromDate: daysAgo(p.days), toDate: todayStr() };
    return { fromDate: undefined, toDate: undefined };
  }, [period, customFrom, customTo]);

  /* ── Data + presets loading ── */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPortfolioStats(fromDate, toDate).catch(() => null),
      getPortfolioHistory(fromDate, toDate).catch(() => []),
      getPortfolioBets().catch(() => []),
      getDashboardSummary().catch(() => null),
      getPreferences().catch(() => null),
      listDashboardPresets().catch(() => null),
      getWidgetData().catch(() => null),
    ]).then(([s, h, bets, sum, p, presetsData, wd]) => {
      setStats(s as PortfolioStats | null);
      setHistory((h as HistoryPoint[]) || []);
      setRecentBets(((bets as Bet[]) || []).slice(0, 20));
      setSummary(sum as DashboardSummary | null);
      setPrefs(p as UserPreferences | null);
      setGenericWidgetData(wd as Record<string, unknown> | null);

      const pd = presetsData as { presets: Array<{ id: string; name: string; widgets: unknown[] }>; active_preset_id: string } | null;
      if (pd && pd.presets.length > 0) {
        setPresets(pd.presets.map((pr) => ({ id: pr.id, name: pr.name })));
        setActivePresetId(pd.active_preset_id);
        // First preset is always the default (non-deletable)
        setDefaultPresetId(pd.presets[0].id);
        const active = pd.presets.find((pr) => pr.id === pd.active_preset_id);
        // Only load preset widgets if they are V3 widgets (check for a known V3 id)
        const V3_IDS = new Set<string>(DEFAULT_V3_WIDGETS.map((w) => w.id));
        if (active && active.widgets.length > 0 && (active.widgets as DashboardWidget[]).some((w) => V3_IDS.has(w.id))) {
          // Filter out obsolete widget IDs (e.g. old "bankroll" replaced by bankroll-initial/current/pnl)
          const validWidgets = (active.widgets as DashboardWidget[]).filter((w) => V3_IDS.has(w.id));
          setWidgets(validWidgets.length > 0 ? validWidgets : DEFAULT_V3_WIDGETS);
        }
      } else {
        createDashboardPreset({ name: "Mon Dashboard", widgets: DEFAULT_V3_WIDGETS as never[] })
          .then((created) => {
            setPresets([{ id: created.id, name: created.name }]);
            setActivePresetId(created.id);
            setDefaultPresetId(created.id);
          })
          .catch(() => null);
      }

      setLoading(false);
    });
  }, [fromDate, toDate]);

  /* ── Derived stats ── */
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
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "période";

  /* ── Grid handlers ── */
  const handleLayoutChange = useCallback((updated: DashboardWidget[]) => {
    setWidgets(updated);
  }, []);

  const handleRemoveWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const widgetCounter = useRef(100);
  const [pendingWidget, setPendingWidget] = useState<DashboardWidget | null>(null);

  const handlePickWidget = useCallback((type: WidgetType) => {
    const def = widgetRegistry[type];
    const id = `widget-${++widgetCounter.current}`;
    const newWidget: DashboardWidget = {
      id,
      type,
      title: def.name,
      x: 0,
      y: Infinity,
      w: def.defaultSize.w,
      h: def.defaultSize.h,
      config: { ...def.defaultConfig },
    };
    setPendingWidget(newWidget);
    setShowPicker(false);
  }, []);

  const handleConfirmAddWidget = useCallback((widgetId: string, title: string, config: WidgetConfig) => {
    if (!pendingWidget || pendingWidget.id !== widgetId) return;
    const finalWidget = { ...pendingWidget, title, config };
    setWidgets((prev) => [...prev, finalWidget]);
    setPendingWidget(null);
  }, [pendingWidget]);

  const handleConfigureWidget = useCallback((id: string) => {
    setConfigWidgetId(id);
  }, []);

  const handleSaveWidgetConfig = useCallback((widgetId: string, title: string, config: WidgetConfig) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, title, config } : w))
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!activePresetId) return;
    setIsSaving(true);
    try {
      await updateDashboardPreset(activePresetId, { widgets: widgets as never[] });
    } catch (err) {
      console.error("Failed to save preset:", err);
    } finally {
      setIsSaving(false);
    }
  }, [widgets, activePresetId]);

  const handleReset = useCallback(() => {
    setWidgets(DEFAULT_V3_WIDGETS);
  }, []);

  const handleSaveAsNew = useCallback(async (name: string) => {
    try {
      const created = await createDashboardPreset({ name, widgets: widgets as never[] });
      setPresets((prev) => [...prev, { id: created.id, name: created.name }]);
      await activateDashboardPreset(created.id);
      setActivePresetId(created.id);
      // Reset default preset to original layout
      if (defaultPresetId) {
        await updateDashboardPreset(defaultPresetId, { widgets: DEFAULT_V3_WIDGETS as never[] });
      }
      setIsEditMode(false);
    } catch (err) {
      console.error("Failed to save as new preset:", err);
    }
  }, [widgets, defaultPresetId]);

  const handleSelectPreset = useCallback(async (id: string) => {
    try {
      await activateDashboardPreset(id);
      setActivePresetId(id);
      const presetsData = await listDashboardPresets();
      const selected = presetsData.presets.find((p: { id: string }) => p.id === id);
      if (selected) {
        const ws = (selected as { widgets: DashboardWidget[] }).widgets;
        const V3_IDS = new Set<string>(DEFAULT_V3_WIDGETS.map((w) => w.id));
        if (ws.length > 0 && ws.some((w) => V3_IDS.has(w.id))) {
          setWidgets(ws);
        } else {
          setWidgets(DEFAULT_V3_WIDGETS);
        }
      }
    } catch (err) {
      console.error("Failed to switch preset:", err);
    }
  }, []);

  const handleCreatePreset = useCallback(async (name: string) => {
    try {
      const created = await createDashboardPreset({ name, widgets: DEFAULT_V3_WIDGETS as never[] });
      setPresets((prev) => [...prev, { id: created.id, name: created.name }]);
      await activateDashboardPreset(created.id);
      setActivePresetId(created.id);
      setWidgets(DEFAULT_V3_WIDGETS);
    } catch (err) {
      console.error("Failed to create preset:", err);
    }
  }, []);

  const handleRenamePreset = useCallback(async (id: string, name: string) => {
    try {
      await updateDashboardPreset(id, { name });
      setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    } catch (err) {
      console.error("Failed to rename preset:", err);
    }
  }, []);

  const handleDeletePreset = useCallback(async (id: string) => {
    try {
      await deleteDashboardPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (id === activePresetId) {
        const remaining = presets.filter((p) => p.id !== id);
        if (remaining.length > 0) {
          handleSelectPreset(remaining[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to delete preset:", err);
    }
  }, [activePresetId, presets, handleSelectPreset]);

  const handleDuplicatePreset = useCallback(async (id: string) => {
    try {
      const dup = await duplicateDashboardPreset(id);
      setPresets((prev) => [...prev, { id: dup.id, name: dup.name }]);
    } catch (err) {
      console.error("Failed to duplicate preset:", err);
    }
  }, []);

  /* ── Generic widget renderer (for widgets added via WidgetPicker) ── */
  function renderGenericWidget(widget: DashboardWidget) {
    const gd = genericWidgetData as {
      stats: { total_bets: number; total_staked: number; total_pl: number; roi: number; win_rate: number; recent_roi: number; recent_pl: number; recent_bets_count: number };
      timeline: Array<{ date: string; pl: number; cumulative: number }>;
      by_sport: Record<string, { count: number; pl: number; staked: number; wins: number; roi: number; win_rate: number }>;
      campaigns: Array<{ name: string; bet_count: number; pl: number; bankroll: number }>;
      value_bets: Array<{ sport: string; match: string; league: string; edge: number; odds: number }>;
      recent_bets: Array<{ id: number; match: string; sport: string; odds: number; stake: number; pnl: number | null; status: string; date: string | null; clv: number | null }>;
      streak: { type: string; count: number };
    } | null;
    if (!gd) return <div className="h-full bg-white border border-[#e3e6eb] rounded-xl flex items-center justify-center text-[12px] text-[#b0b7c3]">Chargement...</div>;

    const config = widget.config ?? widgetRegistry[widget.type]?.defaultConfig ?? {};
    const getMetric = (metric: MetricKey | undefined) => {
      const s = gd.stats;
      const st = gd.streak;
      switch (metric) {
        case "roi": return { value: `${s.roi}%`, trend: s.recent_roi, label: "ROI" };
        case "win_rate": return { value: `${s.win_rate}%`, label: "Win Rate" };
        case "total_pl": return { value: s.total_pl, suffix: " EUR", label: "P&L Total" };
        case "total_bets": return { value: s.total_bets, label: "Paris Settles" };
        case "total_staked": return { value: s.total_staked, suffix: " EUR", label: "Total Mise" };
        case "recent_roi": return { value: `${s.recent_roi}%`, label: "ROI 30j" };
        case "recent_pl": return { value: s.recent_pl, suffix: " EUR", label: "P&L 30j" };
        case "recent_bets_count": return { value: s.recent_bets_count, label: "Paris 30j" };
        case "streak": return { value: st.count, label: `Serie ${st.type === "win" ? "gagnante" : st.type === "loss" ? "perdante" : ""}` };
        default: return { value: s.total_bets, label: "Paris" };
      }
    };
    const resolveColor = (metric: MetricKey | undefined, value: unknown, c?: string) => {
      if (metric === "total_pl" || metric === "recent_pl") return (typeof value === "number" ? value : 0) >= 0 ? "#10b981" : "#ef4444";
      return c ?? "#3b82f6";
    };
    const getSportData = (key: BreakdownKey = "count") => Object.entries(gd.by_sport).map(([name, d]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value: d[key] }));

    switch (widget.type) {
      case "stat-card": {
        const mv = getMetric(config.metric);
        const color = resolveColor(config.metric, mv.value, config.color);
        return <StatCard label={widget.title} value={mv.value} trend={mv.trend} color={color} suffix={mv.suffix ?? config.suffix} />;
      }
      case "trend-card": {
        const mv = getMetric(config.metric);
        return <TrendCard title={widget.title} value={mv.value} trend={mv.trend} data={gd.timeline.map((t) => t.cumulative)} color={config.color ?? "#3b82f6"} />;
      }
      case "gauge": {
        const mv = getMetric(config.metric ?? "win_rate");
        const numVal = typeof mv.value === "number" ? mv.value : parseFloat(String(mv.value)) || 0;
        return <GaugeWidget title={widget.title} value={numVal} label={mv.label} />;
      }
      case "line-chart": {
        const series = (config.series as SeriesKey[] | undefined) ?? ["cumulative", "pl"];
        const yKeys: { key: string; color: string; name: string }[] = [];
        if (series.includes("cumulative")) yKeys.push({ key: "cumulative", color: "#3b82f6", name: "P&L Cumule" });
        if (series.includes("pl")) yKeys.push({ key: "pl", color: "#10b981", name: "P&L Jour" });
        return <LineChartWidget title={widget.title} data={gd.timeline as unknown as Record<string, unknown>[]} xKey="date" yKeys={yKeys} />;
      }
      case "pie-chart":
        return <PieChartWidget title={widget.title} data={getSportData(config.dataKey as BreakdownKey)} />;
      case "bar-chart":
        return <BarChartWidget title={widget.title} data={getSportData((config.dataKey as BreakdownKey) ?? "roi")} />;
      case "data-table": {
        const src = config.dataSource ?? "recent_bets";
        const ps = config.pageSize ?? 5;
        if (src === "campaigns") return <DataTableWidget title={widget.title} data={gd.campaigns.map((c) => ({ Campagne: c.name, Paris: c.bet_count, "P&L": c.pl, Bankroll: c.bankroll }))} pageSize={ps} />;
        return <DataTableWidget title={widget.title} data={gd.recent_bets.map((b) => ({ Match: b.match, Sport: b.sport, Cote: b.odds, Mise: b.stake, "P&L": b.pnl ?? "-", Statut: b.status }))} pageSize={ps} />;
      }
      case "activity-feed":
        return <ActivityFeedWidget items={gd.recent_bets.slice(0, 8).map((b) => ({ id: b.id, label: b.match, detail: `${b.sport} - ${b.odds}x - ${b.stake} EUR`, time: b.date ? new Date(b.date).toLocaleDateString("fr-FR") : "", type: b.pnl != null ? (b.pnl > 0 ? "win" : "loss") : ("pending" as const) }))} />;
      case "value-bets":
        return <ValueBetsWidget bets={gd.value_bets} />;
      default:
        return <div className="h-full bg-white border border-[#e3e6eb] rounded-xl flex items-center justify-center text-[12px] text-[#b0b7c3]">Widget inconnu</div>;
    }
  }

  /* ── Widget renderer ── */
  function renderWidget(widget: DashboardWidget) {
    const id = widget.id as V3WidgetId;

    switch (id) {
      case "campaign-banner":
        return (
          <div className="h-full flex items-center">
            {campaignSummaries.filter((c) => c.total_bets > 0).length > 0 ? (
              <div className="w-full flex items-center gap-3 px-4 py-2.5 rounded-[10px] max-md:flex-wrap max-md:gap-2 max-md:px-3" data-tour="campaign-banner" style={{ background: "linear-gradient(90deg, var(--accent-bg), rgba(59,91,219,0.02))", border: "1px solid var(--accent-border)" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-bg)" }}><Flag size={14} className="text-[#3b5bdb]" /></div>
                <div className="flex-1 min-w-0 text-[12.5px]">
                  {campaignSummaries.filter((c) => c.total_bets > 0).map((c, i) => (
                    <span key={c.id}>{i > 0 && " · "}<strong className="text-[#3b5bdb]">{c.total_bets} matchs</strong><span className="text-[#8a919e]"> sur <strong className="text-[#3c4149]">{c.name}</strong> ({c.won}W-{c.lost}L{c.pending > 0 ? `, ${c.pending} en attente` : ""})</span></span>
                  ))}
                </div>
                <Link to="/campaign" className="px-3 py-[6px] rounded-lg bg-[#3b5bdb] text-white text-[11.5px] font-semibold no-underline whitespace-nowrap transition-all hover:bg-[#2f4ac7] max-md:w-full max-md:text-center">Campagnes →</Link>
              </div>
            ) : (
              <div className="w-full flex items-center gap-3 px-4 py-2.5 rounded-[10px]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--bg-card)" }}><Flag size={14} className="text-[#8a919e]" /></div>
                <span className="text-[12.5px] text-[#8a919e]">Aucune campagne active</span>
                <Link to="/campaign" className="ml-auto px-3 py-[6px] rounded-lg border border-[#e3e6eb] text-[#3c4149] text-[11.5px] font-semibold no-underline whitespace-nowrap transition-all hover:border-[#cdd1d9]">Créer une campagne →</Link>
              </div>
            )}
          </div>
        );

      case "bankroll-initial":
        return (
          <div className="h-full flex items-center" data-tour="bankroll">
            <div className="w-full h-full rounded-xl px-4 py-3 shadow-[0_1px_3px_rgba(16,24,40,0.06)] flex flex-col items-center justify-center text-center" style={{ background: "linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-card) 100%)", border: "1px solid var(--border-color)" }}>
              <span className="text-[10.5px] font-medium text-[#8a919e] uppercase tracking-wide">Bankroll initiale</span>
              <span className="text-[20px] font-extrabold tracking-tight text-[#111318] leading-none mt-1">
                {(prefs?.initial_bankroll ?? 0).toLocaleString("fr-FR")}€
              </span>
              <span className="text-[10px] text-[#b0b7c3] mt-0.5">mise de depart</span>
            </div>
          </div>
        );

      case "bankroll-current": {
        const pnlVal = stats?.total_pnl ?? 0;
        const currentBR = (prefs?.initial_bankroll ?? 0) + pnlVal;
        const pending = stats?.pending_bets ?? 0;
        return (
          <div className="h-full flex items-center">
            <div className="w-full h-full rounded-xl px-4 py-3 shadow-[0_1px_3px_rgba(16,24,40,0.06)] flex flex-col items-center justify-center text-center" style={{ background: "linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-card) 100%)", border: "1px solid var(--border-color)" }}>
              <span className="text-[10.5px] font-medium text-[#8a919e] uppercase tracking-wide">Solde actuel</span>
              <span className="text-[20px] font-extrabold tracking-tight leading-none mt-1" style={{ color: pnlVal >= 0 ? "var(--green)" : "var(--red)" }}>
                {currentBR.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
              </span>
              <span className="text-[10px] text-[#b0b7c3] mt-0.5">
                {pending > 0 ? `${pending} pari${pending > 1 ? "s" : ""} en cours` : "aucun pari en cours"}
              </span>
            </div>
          </div>
        );
      }

      case "bankroll-pnl": {
        const pnl = stats?.total_pnl ?? 0;
        const initBR = prefs?.initial_bankroll ?? 0;
        const pnlPos = pnl >= 0;
        return (
          <div className="h-full flex items-center">
            <div className="w-full h-full rounded-xl px-4 py-3 shadow-[0_1px_3px_rgba(16,24,40,0.06)] flex flex-col items-center justify-center text-center" style={{ background: "linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-card) 100%)", border: "1px solid var(--border-color)" }}>
              <span className="text-[10.5px] font-medium text-[#8a919e] uppercase tracking-wide">Variation P&L</span>
              <span className="text-[20px] font-extrabold tracking-tight leading-none mt-1" style={{ color: pnlPos ? "var(--green)" : "var(--red)" }}>
                {pnlPos ? "+" : ""}{pnl.toFixed(2)}€
              </span>
              <span className="text-[10px] text-[#b0b7c3] mt-0.5">
                {initBR > 0 ? `${pnlPos ? "+" : ""}${((pnl / initBR) * 100).toFixed(1)}% vs initial` : "—"}
              </span>
            </div>
          </div>
        );
      }

      case "kpi-roi":
        return loading ? (
          <div className="h-full bg-white border border-[#e3e6eb] rounded-xl p-[14px_16px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] animate-pulse"><div className="h-3 w-16 bg-[#e3e6eb] rounded mb-3" /><div className="h-6 w-20 bg-[#e3e6eb] rounded" /></div>
        ) : (
          <KPICard dataTour="kpi-roi" label={`ROI (${periodLabel})`} value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`} valueColor={roi >= 0 ? "var(--green)" : "var(--red)"} icon={<TrendingUp size={14} />} iconBg={roi >= 0 ? "var(--green-bg)" : "var(--red-bg)"} iconColor={roi >= 0 ? "var(--green)" : "var(--red)"} delta={roiDelta != null ? `${roiDelta >= 0 ? "+" : ""}${roiDelta.toFixed(1)}% vs mois dernier` : undefined} deltaUp={roiDelta != null ? roiDelta >= 0 : undefined} />
        );

      case "kpi-staked":
        return loading ? (
          <div className="h-full bg-white border border-[#e3e6eb] rounded-xl p-[14px_16px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] animate-pulse"><div className="h-3 w-16 bg-[#e3e6eb] rounded mb-3" /><div className="h-6 w-20 bg-[#e3e6eb] rounded" /></div>
        ) : (
          <KPICard dataTour="kpi-staked" label={`Mise (${periodLabel})`} value={`${totalStaked.toLocaleString("fr-FR")}€`} icon={<DollarSign size={14} />} iconBg="var(--accent-bg)" iconColor="var(--accent)" delta={stakedDelta != null ? `${stakedDelta >= 0 ? "+" : ""}${Math.round(stakedDelta)}€ vs mois dernier` : undefined} deltaUp={stakedDelta != null ? stakedDelta >= 0 : undefined} />
        );

      case "kpi-tickets":
        return loading ? (
          <div className="h-full bg-white border border-[#e3e6eb] rounded-xl p-[14px_16px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] animate-pulse"><div className="h-3 w-16 bg-[#e3e6eb] rounded mb-3" /><div className="h-6 w-20 bg-[#e3e6eb] rounded" /></div>
        ) : (
          <KPICard dataTour="kpi-tickets" label={`Tickets (${periodLabel})`} value={`${totalBets}`} icon={<CheckSquare size={14} />} iconBg="var(--amber-bg)" iconColor="var(--amber)" delta={pendingBets > 0 ? `dont ${pendingBets} en attente` : undefined} />
        );

      case "kpi-winrate":
        return loading ? (
          <div className="h-full bg-white border border-[#e3e6eb] rounded-xl p-[14px_16px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] animate-pulse"><div className="h-3 w-16 bg-[#e3e6eb] rounded mb-3" /><div className="h-6 w-20 bg-[#e3e6eb] rounded" /></div>
        ) : (
          <KPICard dataTour="kpi-winrate" label={`Taux de réussite (${periodLabel})`} value={`${winRate.toFixed(1)}%`} valueColor={winRate >= 50 ? "var(--green)" : "var(--red)"} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} iconBg="var(--green-bg)" iconColor="var(--green)" delta={winRateDelta != null ? `${winRateDelta >= 0 ? "+" : ""}${winRateDelta.toFixed(1)}% vs mois dernier` : undefined} deltaUp={winRateDelta != null ? winRateDelta >= 0 : undefined} />
        );

      case "roi-chart":
        return (
          <div data-tour="roi-chart" className="h-full bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
            <div className="flex items-center px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                <TrendingUp size={13} className="text-[#3b5bdb]" /> Évolution ROI
              </div>
            </div>
            <div className="px-3 py-2 flex-1 flex items-center min-h-0">
              <ROIChart data={history} />
            </div>
          </div>
        );

      case "pnl-chart":
        return (
          <div data-tour="pnl-card" className="h-full bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
            <div className="flex items-center px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                <DollarSign size={13} className="text-[#3b5bdb]" /> P&L Cumulé
              </div>
            </div>
            <div className="px-4 pt-3 pb-2 flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="shrink-0">
                <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: (stats?.total_pnl ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                  {(stats?.total_pnl ?? 0) >= 0 ? "+" : ""}{(stats?.total_pnl ?? 0).toFixed(2)}€
                </div>
                <div className="text-[11px] text-[#8a919e] mt-0.5">sur {totalStaked.toLocaleString("fr-FR")}€ misés</div>
              </div>
              {history.length >= 2 && (
                <div className="flex-1 min-h-0 mt-1">
                  <PnLSparkline data={history} />
                </div>
              )}
            </div>
          </div>
        );

      case "recent-tickets":
        return (
          <div data-tour="recent-bets" className="h-full bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                <CheckSquare size={13} className="text-[#3b5bdb]" /> Tickets récents
              </div>
              <Link to="/portfolio" className="px-2.5 py-1 rounded-[6px] border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[11px] font-medium no-underline transition-all hover:border-[#cdd1d9] hover:text-[#3c4149]">Voir tout</Link>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {betGroups.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-[#b0b7c3]">Aucun ticket</div>
              ) : (
                betGroups.map((group, i) => <TicketCard key={i} group={group} />)
              )}
            </div>
          </div>
        );

      case "sport-breakdown":
        return (
          <div data-tour="sport-breakdown" className="h-full bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                Performance & Répartition
              </div>
            </div>
            <div className="p-3 flex-1 flex items-center gap-4 min-w-0 overflow-hidden">
              <div className="flex-1 min-w-0 overflow-hidden">
                <SportBarsCompact data={sportBreakdown} />
              </div>
              <div className="shrink-0">
                <DonutMini won={won} lost={lost} pending={pendingBets} total={totalBets} />
              </div>
            </div>
          </div>
        );

      case "streaks":
        return (
          <div className="h-full bg-white border border-[#e3e6eb] rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-[#e3e6eb] shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#111318]">
                <Trophy size={13} className="text-[#3b5bdb]" /> Streaks & Records
              </div>
            </div>
            <div className="p-3 flex-1 flex flex-col justify-center gap-1.5">
              <StreakRow icon={<Flame size={13} className="text-[#12b76a]" />} label="Meilleure série" value={`${stats?.longest_winning_streak ?? 0} victoires`} color="var(--green)" />
              <StreakRow icon={<Flame size={13} className="text-[#f04438]" />} label="Pire série" value={`${stats?.longest_losing_streak ?? 0} défaites`} color="var(--red)" />
              <StreakRow icon={<DollarSign size={13} className="text-[#3b5bdb]" />} label="P&L total" value={`${(stats?.total_pnl ?? 0) >= 0 ? "+" : ""}${(stats?.total_pnl ?? 0).toFixed(2)}€`} color={(stats?.total_pnl ?? 0) >= 0 ? "var(--green)" : "var(--red)"} />
              <StreakRow icon={<TrendingUp size={13} className="text-[#f79009]" />} label="Cote moyenne" value={recentBets.length > 0 ? `x${(recentBets.reduce((a, b) => a + b.odds_at_bet, 0) / recentBets.length).toFixed(2)}` : "—"} color="var(--text-secondary)" />
            </div>
          </div>
        );

      default:
        return renderGenericWidget(widget);
    }
  }

  return (
    <div className="flex flex-col gap-2 animate-fade-up">
      {/* ── HEADER ── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        {/* Left: title + week */}
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-[#111318]">Bonjour, {firstName}</h1>
          <p className="text-[12.5px] text-[#8a919e] mt-0.5">Voici un aperçu de vos performances · Semaine {getWeekNumber()}</p>
        </div>

        {/* Right: period selector + toolbar */}
        <div className="flex flex-col gap-1.5 items-end max-md:items-start max-md:w-full">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="flex flex-wrap gap-1 rounded-[9px] p-[3px]" data-tour="period-selector" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
              {PERIODS.filter((p) => p.key !== "custom").map((p) => (
                <button key={p.key} onClick={() => { setPeriod(p.key); setShowCustom(false); }}
                  className={`px-3.5 py-[5px] rounded-[7px] text-[12px] font-medium cursor-pointer transition-all border-none whitespace-nowrap ${period === p.key ? "font-semibold shadow-[0_1px_3px_rgba(16,24,40,0.06)]" : "bg-transparent"}`}
                  style={period === p.key ? { background: "var(--bg-card)", color: "var(--text-primary)" } : { color: "var(--text-muted)" }}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => { setPeriod("custom"); setShowCustom(true); }}
                className={`px-2.5 py-[5px] rounded-[7px] text-[12px] font-medium cursor-pointer transition-all border-none flex items-center gap-1.5 ${period === "custom" ? "font-semibold shadow-[0_1px_3px_rgba(16,24,40,0.06)]" : "bg-transparent"}`}
                style={period === "custom" ? { background: "var(--bg-card)", color: "var(--text-primary)" } : { color: "var(--text-muted)" }}>
                <Calendar size={12} /> Dates
              </button>
            </div>

            {/* Toolbar (preset selector + edit mode) */}
            <DashboardToolbar
              isEditMode={isEditMode}
              onToggleEditMode={() => setIsEditMode(!isEditMode)}
              onSave={handleSave}
              onAddWidget={() => setShowPicker(true)}
              onResetLayout={handleReset}
              isSaving={isSaving}
              presets={presets}
              activePresetId={activePresetId}
              defaultPresetId={defaultPresetId}
              onSelectPreset={handleSelectPreset}
              onCreatePreset={handleCreatePreset}
              onSaveAsNew={handleSaveAsNew}
              onRenamePreset={handleRenamePreset}
              onDeletePreset={handleDeletePreset}
              onDuplicatePreset={handleDuplicatePreset}
            />
          </div>

          {/* Custom date range */}
          {showCustom && (
            <div className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-[3px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] max-md:w-full max-md:flex-wrap" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-[12px] border-none bg-transparent outline-none w-[110px] max-sm:flex-1" style={{ color: "var(--text-primary)" }} />
              <span className="text-[11px]" style={{ color: "var(--text-muted2)" }}>→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-[12px] border-none bg-transparent outline-none w-[110px] max-sm:flex-1" style={{ color: "var(--text-primary)" }} />
              <button onClick={() => { setShowCustom(false); setPeriod("30d"); setCustomFrom(""); setCustomTo(""); }} className="ml-1 cursor-pointer bg-transparent border-none" style={{ color: "var(--text-muted)" }}><X size={12} /></button>
            </div>
          )}
        </div>
      </div>

      {/* ── EDIT MODE INDICATOR ── */}
      {isEditMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Mode edition actif. Deplacez et redimensionnez les widgets, puis sauvegardez.
        </div>
      )}

      {/* ── GRID ── */}
      <div data-tour="widget-grid">
      <DashboardGrid
        widgets={widgets}
        isEditMode={isEditMode}
        onLayoutChange={handleLayoutChange}
        onRemoveWidget={handleRemoveWidget}
        onConfigureWidget={handleConfigureWidget}
        renderWidget={renderWidget}
      />
      </div>

      {showPicker && (
        <WidgetPicker
          onSelect={handlePickWidget}
          onClose={() => setShowPicker(false)}
        />
      )}

      {pendingWidget && (
        <WidgetConfigPanel
          widgetId={pendingWidget.id}
          widgetType={pendingWidget.type}
          title={pendingWidget.title}
          config={pendingWidget.config ?? {}}
          onSave={handleConfirmAddWidget}
          onClose={() => setPendingWidget(null)}
        />
      )}

      {configWidgetId && (() => {
        const cw = widgets.find((w) => w.id === configWidgetId);
        return cw ? (
          <WidgetConfigPanel
            widgetId={cw.id}
            widgetType={cw.type}
            title={cw.title}
            config={cw.config ?? {}}
            onSave={handleSaveWidgetConfig}
            onClose={() => setConfigWidgetId(null)}
          />
        ) : null;
      })()}

      {showTour && <SpotlightTour steps={dashboardTour} onComplete={completeTour} />}
    </div>
  );
}

/* ══════════════════════════════════════════════
   SUB-COMPONENTS (copied from Dashboard V1)
   ══════════════════════════════════════════════ */

/* ── KPI Card ── */
function KPICard({ label, value, valueColor, icon, iconBg, iconColor, delta, deltaUp, dataTour }: {
  label: string; value: string; valueColor?: string; icon: React.ReactNode; iconBg: string; iconColor: string; delta?: string; deltaUp?: boolean; dataTour?: string;
}) {
  return (
    <div data-tour={dataTour} className="h-full bg-white border border-[#e3e6eb] rounded-xl p-[14px_16px] shadow-[0_1px_3px_rgba(16,24,40,0.06)] hover:shadow-[0_4px_16px_rgba(16,24,40,0.08)] transition-shadow flex flex-col items-center text-center justify-center gap-1">
      <div className="w-[28px] h-[28px] rounded-lg flex items-center justify-center" style={{ background: iconBg, color: iconColor }}>{icon}</div>
      <span className="text-[10px] font-medium text-[#8a919e] uppercase tracking-wide">{label}</span>
      <div className="text-[26px] font-extrabold tracking-tight leading-none" style={{ color: valueColor || "var(--text-primary)" }}>{value}</div>
      {delta && (
        <div className="flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: deltaUp === false ? "var(--red)" : deltaUp === true ? "var(--green)" : "var(--text-muted)" }}>
          {deltaUp === true && <ChevronUp size={11} />}{deltaUp === false && <ChevronDown size={11} />}{delta}
        </div>
      )}
    </div>
  );
}

/* ── Ticket Card ── */
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

  const oddsColor = group.result === "won" ? "var(--green)" : group.result === "lost" ? "var(--red)" : "var(--border-color)";
  const oddsText = group.result === "pending" ? "var(--text-secondary)" : "#fff";

  return (
    <div className="border-b border-[#f0f1f3] last:border-b-0">
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
              <span className="text-[10px] text-[#8a919e]">Gains <strong style={{ color: group.gains > 0 ? "var(--green)" : "var(--red)" }}>
                {group.gains > 0 ? `${group.gains.toFixed(2)}€` : "0€"}
              </strong></span>
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
        <defs><linearGradient id="roiFillV3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b5bdb" stopOpacity="0.12" /><stop offset="100%" stopColor="#3b5bdb" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#roiFillV3)" />
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

/* ── P&L Sparkline ── */
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
        <linearGradient id="pnlFillV3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => <line key={t.val} x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#e3e6eb" strokeWidth="0.6" />)}
      {yTicks.map((t) => <text key={`yl-${t.val}`} x={padL - 4} y={t.y + 3} textAnchor="end" className="text-[7.5px] fill-[#8a919e]">{t.val}€</text>)}
      {xLabels.map((l, i) => <text key={i} x={l.x} y={H - 3} textAnchor="middle" className="text-[7.5px] fill-[#8a919e]">{l.label}</text>)}
      <path d={area} fill="url(#pnlFillV3)" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill="white" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ── Sport Bars Compact ── */
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
              <span className="text-[11px] font-bold" style={{ color: isNeg ? "var(--red)" : color }}>
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

/* ── Streak Row ── */
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
