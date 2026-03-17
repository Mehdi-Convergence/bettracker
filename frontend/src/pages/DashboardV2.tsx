import { useState, useEffect, useCallback, useRef } from "react";
import { LayoutDashboard, Loader2 } from "lucide-react";
import { DashboardGrid, type DashboardWidget } from "../components/dashboard/DashboardGrid";
import { DashboardToolbar, type PresetInfo } from "../components/dashboard/DashboardToolbar";
import { WidgetPicker } from "../components/dashboard/WidgetPicker";
import { WidgetConfigPanel } from "../components/dashboard/WidgetConfigPanel";
import { type WidgetType, type WidgetConfig, type MetricKey, type BreakdownKey, type SeriesKey, widgetRegistry } from "../components/widgets/registry";
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
import {
  getWidgetData,
  listDashboardPresets,
  createDashboardPreset,
  updateDashboardPreset,
  deleteDashboardPreset,
  activateDashboardPreset,
  duplicateDashboardPreset,
} from "../services/api";

// ---- Types for widget data ----
interface WidgetDataStats {
  total_bets: number;
  total_staked: number;
  total_pl: number;
  roi: number;
  win_rate: number;
  recent_roi: number;
  recent_pl: number;
  recent_bets_count: number;
}

interface TimelinePoint {
  date: string;
  pl: number;
  cumulative: number;
}

interface SportBreakdown {
  count: number;
  pl: number;
  staked: number;
  wins: number;
  roi: number;
  win_rate: number;
}

interface CampaignItem {
  name: string;
  bet_count: number;
  pl: number;
  bankroll: number;
}

interface ValueBetItem {
  sport: string;
  match: string;
  league: string;
  edge: number;
  odds: number;
}

interface RecentBetItem {
  id: number;
  match: string;
  sport: string;
  odds: number;
  stake: number;
  pnl: number | null;
  status: string;
  date: string | null;
  clv: number | null;
}

interface WidgetData {
  stats: WidgetDataStats;
  timeline: TimelinePoint[];
  by_sport: Record<string, SportBreakdown>;
  campaigns: CampaignItem[];
  value_bets: ValueBetItem[];
  recent_bets: RecentBetItem[];
  streak: { type: string; count: number };
}

// ---- Default layout with configs ----
const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "roi", type: "stat-card", title: "ROI", x: 0, y: 0, w: 3, h: 2, config: { metric: "roi", color: "#3b82f6" } },
  { id: "winrate", type: "stat-card", title: "Win Rate", x: 3, y: 0, w: 3, h: 2, config: { metric: "win_rate", color: "#10b981" } },
  { id: "total-pl", type: "stat-card", title: "P&L Total", x: 6, y: 0, w: 3, h: 2, config: { metric: "total_pl", color: "#10b981" } },
  { id: "total-bets", type: "stat-card", title: "Paris Settles", x: 9, y: 0, w: 3, h: 2, config: { metric: "total_bets", color: "#8b5cf6" } },
  { id: "pnl-curve", type: "line-chart", title: "Evolution P&L (30j)", x: 0, y: 2, w: 8, h: 4, config: { series: ["cumulative", "pl"] } },
  { id: "sport-dist", type: "pie-chart", title: "Repartition Sports", x: 8, y: 2, w: 4, h: 4, config: { dataKey: "count" } },
  { id: "recent-bets", type: "data-table", title: "Paris Recents", x: 0, y: 6, w: 8, h: 5, config: { dataSource: "recent_bets", pageSize: 5 } },
  { id: "value-bets", type: "value-bets", title: "Value Bets", x: 8, y: 6, w: 4, h: 5, config: {} },
];

// ---- Helpers to extract metric values ----
function getMetricValue(
  metric: MetricKey | undefined,
  stats: WidgetDataStats,
  streak: { type: string; count: number },
): { value: string | number; suffix?: string; trend?: number; label?: string } {
  switch (metric) {
    case "roi":
      return { value: `${stats.roi}%`, trend: stats.recent_roi, label: "ROI" };
    case "win_rate":
      return { value: `${stats.win_rate}%`, label: "Win Rate" };
    case "total_pl":
      return { value: stats.total_pl, suffix: " EUR", label: "P&L Total" };
    case "total_bets":
      return { value: stats.total_bets, label: "Paris Settles" };
    case "total_staked":
      return { value: stats.total_staked, suffix: " EUR", label: "Total Mise" };
    case "recent_roi":
      return { value: `${stats.recent_roi}%`, label: "ROI 30j" };
    case "recent_pl":
      return { value: stats.recent_pl, suffix: " EUR", label: "P&L 30j" };
    case "recent_bets_count":
      return { value: stats.recent_bets_count, label: "Paris 30j" };
    case "streak":
      return {
        value: streak.count,
        label: `Serie ${streak.type === "win" ? "gagnante" : streak.type === "loss" ? "perdante" : ""}`,
      };
    default:
      return { value: stats.total_bets, label: "Paris" };
  }
}

function getSportBreakdownData(
  by_sport: Record<string, SportBreakdown>,
  dataKey: BreakdownKey = "count",
): Array<{ name: string; value: number }> {
  return Object.entries(by_sport).map(([name, d]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: d[dataKey],
  }));
}

// ---- Metric color resolver ----
function resolveColor(metric: MetricKey | undefined, value: unknown, configColor?: string): string {
  if (metric === "total_pl" || metric === "recent_pl") {
    return (typeof value === "number" ? value : 0) >= 0 ? "#10b981" : "#ef4444";
  }
  return configColor ?? "#3b82f6";
}

// ---- Config-based widget renderer ----
function renderWidgetContent(widget: DashboardWidget, data: WidgetData | null) {
  if (!data) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;

  const { stats, timeline, by_sport, campaigns, value_bets, recent_bets, streak } = data;
  const config = widget.config ?? widgetRegistry[widget.type]?.defaultConfig ?? {};

  switch (widget.type) {
    case "stat-card": {
      const mv = getMetricValue(config.metric, stats, streak);
      const color = resolveColor(config.metric, mv.value, config.color);
      return <StatCard label={widget.title} value={mv.value} trend={mv.trend} color={color} suffix={mv.suffix ?? config.suffix} />;
    }

    case "trend-card": {
      const mv = getMetricValue(config.metric, stats, streak);
      const color = config.color ?? "#3b82f6";
      return (
        <TrendCard
          title={widget.title}
          value={mv.value}
          trend={mv.trend}
          data={timeline.map((t) => t.cumulative)}
          color={color}
        />
      );
    }

    case "gauge": {
      const mv = getMetricValue(config.metric ?? "win_rate", stats, streak);
      const numValue = typeof mv.value === "number" ? mv.value : parseFloat(String(mv.value)) || 0;
      return <GaugeWidget title={widget.title} value={numValue} label={mv.label} />;
    }

    case "line-chart": {
      const series = (config.series as SeriesKey[] | undefined) ?? ["cumulative", "pl"];
      const yKeys: { key: string; color: string; name: string }[] = [];
      if (series.includes("cumulative")) yKeys.push({ key: "cumulative", color: "#3b82f6", name: "P&L Cumule" });
      if (series.includes("pl")) yKeys.push({ key: "pl", color: "#10b981", name: "P&L Jour" });
      return (
        <LineChartWidget
          title={widget.title}
          data={timeline as unknown as Record<string, unknown>[]}
          xKey="date"
          yKeys={yKeys}
        />
      );
    }

    case "pie-chart": {
      const pieData = getSportBreakdownData(by_sport, config.dataKey as BreakdownKey);
      return <PieChartWidget title={widget.title} data={pieData} />;
    }

    case "bar-chart": {
      const barData = getSportBreakdownData(by_sport, config.dataKey as BreakdownKey ?? "roi");
      return <BarChartWidget title={widget.title} data={barData} />;
    }

    case "data-table": {
      const source = config.dataSource ?? "recent_bets";
      const pageSize = config.pageSize ?? 5;
      if (source === "campaigns") {
        return (
          <DataTableWidget
            title={widget.title}
            data={campaigns.map((c) => ({
              Campagne: c.name,
              Paris: c.bet_count,
              "P&L": c.pl,
              Bankroll: c.bankroll,
            }))}
            pageSize={pageSize}
          />
        );
      }
      return (
        <DataTableWidget
          title={widget.title}
          data={recent_bets.map((b) => ({
            Match: b.match,
            Sport: b.sport,
            Cote: b.odds,
            Mise: b.stake,
            "P&L": b.pnl ?? "-",
            CLV: b.clv != null ? `${(b.clv * 100).toFixed(1)}%` : "-",
            Statut: b.status,
          }))}
          pageSize={pageSize}
        />
      );
    }

    case "activity-feed":
      return (
        <ActivityFeedWidget
          items={recent_bets.slice(0, 8).map((b) => ({
            id: b.id,
            label: b.match,
            detail: `${b.sport} - ${b.odds}x - ${b.stake} EUR`,
            time: b.date ? new Date(b.date).toLocaleDateString("fr-FR") : "",
            type: b.pnl != null ? (b.pnl > 0 ? "win" : "loss") : "pending",
          }))}
        />
      );

    case "value-bets":
      return <ValueBetsWidget bets={value_bets} />;

    default:
      return <div className="text-center text-gray-400 text-sm">Widget non configure</div>;
  }
}

// ---- Main page component ----
export default function DashboardV2() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState<WidgetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const widgetCounter = useRef(100);

  // Presets state
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Load data and presets
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [widgetData, presetsData] = await Promise.all([
          getWidgetData(),
          listDashboardPresets().catch(() => null),
        ]);
        setData(widgetData as unknown as WidgetData);

        if (presetsData && presetsData.presets.length > 0) {
          setPresets(presetsData.presets.map((p) => ({ id: p.id, name: p.name })));
          setActivePresetId(presetsData.active_preset_id);
          // Load widgets from active preset
          const active = presetsData.presets.find((p) => p.id === presetsData.active_preset_id);
          if (active) {
            setWidgets(active.widgets as unknown as DashboardWidget[]);
          }
        } else {
          // No presets yet - auto-create default
          try {
            const created = await createDashboardPreset({ name: "Mon Dashboard", widgets: DEFAULT_WIDGETS as never[] });
            setPresets([{ id: created.id, name: created.name }]);
            setActivePresetId(created.id);
          } catch {
            // Fallback to default widgets
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadAll();
  }, []);

  const handleLayoutChange = useCallback((updated: DashboardWidget[]) => {
    setWidgets(updated);
  }, []);

  const handleRemoveWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const handleAddWidget = useCallback((type: WidgetType) => {
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
    setWidgets((prev) => [...prev, newWidget]);
  }, []);

  const handleConfigureWidget = useCallback((id: string) => {
    setConfigWidgetId(id);
  }, []);

  const handleSaveWidgetConfig = useCallback((widgetId: string, title: string, config: WidgetConfig) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, title, config } : w))
    );
  }, []);

  // Save current layout to active preset
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
    setWidgets(DEFAULT_WIDGETS);
  }, []);

  // ---- Preset CRUD handlers ----
  const handleSelectPreset = useCallback(async (id: string) => {
    try {
      await activateDashboardPreset(id);
      setActivePresetId(id);
      // Reload preset widgets
      const presetsData = await listDashboardPresets();
      const selected = presetsData.presets.find((p) => p.id === id);
      if (selected) {
        setWidgets(selected.widgets as unknown as DashboardWidget[]);
      }
    } catch (err) {
      console.error("Failed to switch preset:", err);
    }
  }, []);

  const handleCreatePreset = useCallback(async (name: string) => {
    try {
      const created = await createDashboardPreset({ name, widgets: DEFAULT_WIDGETS as never[] });
      setPresets((prev) => [...prev, { id: created.id, name: created.name }]);
      // Auto-switch to new preset
      await activateDashboardPreset(created.id);
      setActivePresetId(created.id);
      setWidgets(DEFAULT_WIDGETS);
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
      // If deleted was active, switch to first remaining
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

  // Widget being configured
  const configWidget = configWidgetId ? widgets.find((w) => w.id === configWidgetId) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Chargement du dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <LayoutDashboard className="h-6 w-6 text-blue-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">Dashboard</h1>
            <p className="text-sm text-slate-500">Dashboard personnalisable</p>
          </div>
        </div>
        <DashboardToolbar
          isEditMode={isEditMode}
          onToggleEditMode={() => setIsEditMode(!isEditMode)}
          onSave={handleSave}
          onAddWidget={() => setShowPicker(true)}
          onResetLayout={handleReset}
          isSaving={isSaving}
          presets={presets}
          activePresetId={activePresetId}
          onSelectPreset={handleSelectPreset}
          onCreatePreset={handleCreatePreset}
          onRenamePreset={handleRenamePreset}
          onDeletePreset={handleDeletePreset}
          onDuplicatePreset={handleDuplicatePreset}
        />
      </div>

      {/* Edit mode indicator */}
      {isEditMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Mode edition actif. Deplacez, redimensionnez et configurez les widgets, puis sauvegardez.
        </div>
      )}

      {/* Grid */}
      <DashboardGrid
        widgets={widgets}
        isEditMode={isEditMode}
        onLayoutChange={handleLayoutChange}
        onRemoveWidget={handleRemoveWidget}
        onConfigureWidget={handleConfigureWidget}
        renderWidget={(widget) => renderWidgetContent(widget, data)}
      />

      {/* Widget picker modal */}
      {showPicker && (
        <WidgetPicker
          onSelect={handleAddWidget}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Widget config panel */}
      {configWidget && (
        <WidgetConfigPanel
          widgetId={configWidget.id}
          widgetType={configWidget.type}
          title={configWidget.title}
          config={configWidget.config ?? {}}
          onSave={handleSaveWidgetConfig}
          onClose={() => setConfigWidgetId(null)}
        />
      )}
    </div>
  );
}
