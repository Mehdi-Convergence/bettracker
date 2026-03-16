import { useState, useEffect, useCallback, useRef } from "react";
import { LayoutDashboard, Loader2 } from "lucide-react";
import { DashboardGrid, type DashboardWidget } from "../components/dashboard/DashboardGrid";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { WidgetPicker } from "../components/dashboard/WidgetPicker";
import { type WidgetType, widgetRegistry } from "../components/widgets/registry";
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
import { getWidgetData, getDashboardLayout, saveDashboardLayout } from "../services/api";

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

// ---- Default layout ----
const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "roi", type: "stat-card", title: "ROI", x: 0, y: 0, w: 3, h: 2 },
  { id: "winrate", type: "stat-card", title: "Win Rate", x: 3, y: 0, w: 3, h: 2 },
  { id: "total-pl", type: "stat-card", title: "P&L Total", x: 6, y: 0, w: 3, h: 2 },
  { id: "total-bets", type: "stat-card", title: "Paris", x: 9, y: 0, w: 3, h: 2 },
  { id: "pnl-curve", type: "line-chart", title: "Evolution P&L", x: 0, y: 2, w: 8, h: 4 },
  { id: "sport-dist", type: "pie-chart", title: "Repartition Sports", x: 8, y: 2, w: 4, h: 4 },
  { id: "recent-bets", type: "data-table", title: "Paris Recents", x: 0, y: 6, w: 8, h: 5 },
  { id: "value-bets", type: "value-bets", title: "Value Bets", x: 8, y: 6, w: 4, h: 5 },
];

// ---- Widget renderer ----
function renderWidgetContent(widget: DashboardWidget, data: WidgetData | null) {
  if (!data) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;

  const { stats, timeline, by_sport, value_bets, recent_bets } = data;

  switch (widget.id) {
    case "roi":
      return <StatCard label="ROI" value={`${stats.roi}%`} trend={stats.recent_roi} color="#3b82f6" />;
    case "winrate":
      return <StatCard label="Win Rate" value={`${stats.win_rate}%`} color="#10b981" />;
    case "total-pl":
      return (
        <StatCard
          label="P&L Total"
          value={stats.total_pl}
          suffix=" EUR"
          color={stats.total_pl >= 0 ? "#10b981" : "#ef4444"}
        />
      );
    case "total-bets":
      return <StatCard label="Paris Settles" value={stats.total_bets} color="#8b5cf6" />;
    case "pnl-curve":
      return (
        <LineChartWidget
          title="Evolution P&L (30j)"
          data={timeline as unknown as Record<string, unknown>[]}
          xKey="date"
          yKeys={[
            { key: "cumulative", color: "#3b82f6", name: "P&L Cumule" },
            { key: "pl", color: "#10b981", name: "P&L Jour" },
          ]}
        />
      );
    case "sport-dist": {
      const pieData = Object.entries(by_sport).map(([name, d]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: d.count,
      }));
      return <PieChartWidget title="Repartition Sports" data={pieData} />;
    }
    case "recent-bets":
      return (
        <DataTableWidget
          title="Paris Recents"
          data={recent_bets.map((b) => ({
            Match: b.match,
            Sport: b.sport,
            Cote: b.odds,
            Mise: b.stake,
            "P&L": b.pnl ?? "-",
            CLV: b.clv != null ? `${(b.clv * 100).toFixed(1)}%` : "-",
            Statut: b.status,
          }))}
          pageSize={5}
        />
      );
    case "value-bets":
      return <ValueBetsWidget bets={value_bets} />;
    default:
      break;
  }

  // Generic rendering based on widget type (for user-added widgets)
  switch (widget.type) {
    case "stat-card":
      return <StatCard label={widget.title} value={stats.total_bets} color="#3b82f6" />;
    case "trend-card":
      return (
        <TrendCard
          title={widget.title}
          value={`${stats.roi}%`}
          trend={stats.recent_roi}
          data={timeline.map((t) => t.cumulative)}
        />
      );
    case "gauge":
      return <GaugeWidget title={widget.title} value={stats.win_rate} label="Win Rate" />;
    case "line-chart":
      return (
        <LineChartWidget
          title={widget.title}
          data={timeline as unknown as Record<string, unknown>[]}
          xKey="date"
          yKeys={[{ key: "cumulative", color: "#3b82f6", name: "P&L" }]}
        />
      );
    case "pie-chart": {
      const pieData = Object.entries(by_sport).map(([name, d]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: d.count,
      }));
      return <PieChartWidget title={widget.title} data={pieData} />;
    }
    case "bar-chart": {
      const barData = Object.entries(by_sport).map(([name, d]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: d.roi,
      }));
      return <BarChartWidget title={widget.title} data={barData} />;
    }
    case "data-table":
      return (
        <DataTableWidget
          title={widget.title}
          data={recent_bets.map((b) => ({
            Match: b.match,
            Sport: b.sport,
            Cote: b.odds,
            "P&L": b.pnl ?? "-",
            Statut: b.status,
          }))}
        />
      );
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
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState<WidgetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const widgetCounter = useRef(100);

  // Load data and layout
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [widgetData, savedLayout] = await Promise.all([
          getWidgetData(),
          getDashboardLayout().catch(() => null),
        ]);
        setData(widgetData as unknown as WidgetData);
        if (savedLayout?.widgets) {
          setWidgets(savedLayout.widgets as DashboardWidget[]);
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
      y: Infinity, // will be placed at bottom by compact
      w: def.defaultSize.w,
      h: def.defaultSize.h,
    };
    setWidgets((prev) => [...prev, newWidget]);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveDashboardLayout({ widgets });
    } catch (err) {
      console.error("Failed to save layout:", err);
    } finally {
      setIsSaving(false);
    }
  }, [widgets]);

  const handleReset = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
  }, []);

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard V2</h1>
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
        />
      </div>

      {/* Edit mode indicator */}
      {isEditMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Mode edition actif. Deplacez et redimensionnez les widgets, puis sauvegardez.
        </div>
      )}

      {/* Grid */}
      <DashboardGrid
        widgets={widgets}
        isEditMode={isEditMode}
        onLayoutChange={handleLayoutChange}
        onRemoveWidget={handleRemoveWidget}
        renderWidget={(widget) => renderWidgetContent(widget, data)}
      />

      {/* Widget picker modal */}
      {showPicker && (
        <WidgetPicker
          onSelect={handleAddWidget}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
