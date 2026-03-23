import { useState, useEffect, useCallback } from "react";
import GridLayout, { verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import { GripVertical, X, Settings } from "lucide-react";
import { widgetRegistry, type WidgetType, type WidgetConfig } from "../widgets/registry";
import { WidgetErrorBoundary } from "../widgets/WidgetErrorBoundary";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: WidgetConfig;
}

interface DashboardGridProps {
  widgets: DashboardWidget[];
  isEditMode: boolean;
  onLayoutChange: (widgets: DashboardWidget[]) => void;
  onRemoveWidget: (id: string) => void;
  onConfigureWidget?: (id: string) => void;
  renderWidget: (widget: DashboardWidget) => React.ReactNode;
}

function getResponsiveCols(width: number): number {
  if (width < 768) return 0; // mobile: use CSS layout
  if (width < 1024) return 6;
  return 12;
}

/* ── Mobile layout heights by widget type / id ── */
const MOBILE_HEIGHTS: Record<string, string> = {
  "campaign-banner": "auto",
  "bankroll-initial": "auto",
  "bankroll-current": "auto",
  "bankroll-pnl": "auto",
  "kpi-roi": "auto",
  "kpi-staked": "auto",
  "kpi-tickets": "auto",
  "kpi-winrate": "auto",
  "roi-chart": "200px",
  "pnl-chart": "220px",
  "recent-tickets": "300px",
  "sport-breakdown": "200px",
  "streaks": "180px",
};

/* ── Mobile: which widgets go side-by-side ── */
const MOBILE_LAYOUT_ORDER: Array<string | [string, string]> = [
  "campaign-banner",                          // full width
  ["bankroll-initial", "bankroll-current"],    // side by side
  "bankroll-pnl",                             // full width (P&L variation stands out)
  ["kpi-roi", "kpi-winrate"],                 // side by side
  ["kpi-staked", "kpi-tickets"],              // side by side
  "roi-chart",                                // full width chart
  "pnl-chart",                                // full width chart
  "sport-breakdown",                          // full width
  "streaks",                                  // full width
  "recent-tickets",                           // full width (scrollable)
];

function MobileLayout({ widgets, renderWidget }: { widgets: DashboardWidget[]; renderWidget: (w: DashboardWidget) => React.ReactNode }) {
  const widgetMap = new Map(widgets.map((w) => [w.id, w]));

  return (
    <div className="flex flex-col gap-2">
      {MOBILE_LAYOUT_ORDER.map((entry, i) => {
        if (typeof entry === "string") {
          const w = widgetMap.get(entry);
          if (!w) return null;
          const h = MOBILE_HEIGHTS[entry] ?? "auto";
          return (
            <div key={i} style={{ height: h, minHeight: h === "auto" ? undefined : h }}>
              <WidgetErrorBoundary widgetId={w.id} widgetType={w.type}>
                {renderWidget(w)}
              </WidgetErrorBoundary>
            </div>
          );
        }
        // Pair: side by side
        const [leftId, rightId] = entry;
        const left = widgetMap.get(leftId);
        const right = widgetMap.get(rightId);
        if (!left && !right) return null;
        const h = MOBILE_HEIGHTS[leftId] ?? MOBILE_HEIGHTS[rightId] ?? "90px";
        return (
          <div key={i} className="grid grid-cols-2 gap-2" style={{ height: h, minHeight: h }}>
            {left && (
              <WidgetErrorBoundary widgetId={left.id} widgetType={left.type}>
                {renderWidget(left)}
              </WidgetErrorBoundary>
            )}
            {right && (
              <WidgetErrorBoundary widgetId={right.id} widgetType={right.type}>
                {renderWidget(right)}
              </WidgetErrorBoundary>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DashboardGrid({
  widgets,
  isEditMode,
  onLayoutChange,
  onRemoveWidget,
  onConfigureWidget,
  renderWidget,
}: DashboardGridProps) {
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector(".dashboard-grid-container");
      if (container) setContainerWidth(container.clientWidth);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const cols = getResponsiveCols(containerWidth);
  const isMobile = cols === 0;

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      if (!isEditMode) return;
      const updated = widgets.map((w) => {
        const layoutItem = newLayout.find((l: LayoutItem) => l.i === w.id);
        if (layoutItem) {
          return { ...w, x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h };
        }
        return w;
      });
      onLayoutChange(updated);
    },
    [isEditMode, widgets, onLayoutChange]
  );

  /* ── MOBILE: CSS-based layout ── */
  if (isMobile) {
    return (
      <div className="dashboard-grid-container">
        <MobileLayout widgets={widgets} renderWidget={renderWidget} />
      </div>
    );
  }

  /* ── DESKTOP / TABLET: react-grid-layout ── */
  const adaptedWidgets = widgets.map((w) => ({
    ...w,
    w: Math.min(w.w, cols),
    x: Math.min(w.x, Math.max(0, cols - Math.min(w.w, cols))),
  }));

  return (
    <div className="dashboard-grid-container overflow-x-hidden">
      <GridLayout
        className={`layout ${!isEditMode ? "dashboard-read-only" : ""}`}
        layout={adaptedWidgets.map((w) => {
          const def = widgetRegistry[w.type];
          return {
            i: w.id,
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
            minW: Math.min(def?.minSize.w ?? 2, cols),
            minH: def?.minSize.h ?? 2,
            static: !isEditMode,
          };
        })}
        gridConfig={{
          cols,
          rowHeight: 60,
          margin: [16, 16] as [number, number],
          containerPadding: [0, 0] as [number, number],
          maxRows: Infinity,
        }}
        width={containerWidth}
        dragConfig={{
          enabled: isEditMode,
          handle: ".widget-drag-handle",
          bounded: false,
          threshold: 3,
        }}
        resizeConfig={{
          enabled: isEditMode,
          handles: ["se"] as const,
        }}
        onLayoutChange={handleLayoutChange}
        compactor={verticalCompactor}
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            <div className="relative h-full w-full">
              {isEditMode && (
                <div className="absolute top-2 right-2 z-10 flex gap-1">
                  {onConfigureWidget && (
                    <button
                      className="p-1.5 bg-white rounded shadow-md hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfigureWidget(widget.id);
                      }}
                      title="Configurer"
                    >
                      <Settings className="h-4 w-4 text-gray-600" />
                    </button>
                  )}
                  <button
                    className="widget-drag-handle p-1.5 bg-white rounded shadow-md hover:bg-gray-50 cursor-move"
                    title="Deplacer"
                  >
                    <GripVertical className="h-4 w-4 text-gray-600" />
                  </button>
                  <button
                    className="p-1.5 bg-white rounded shadow-md hover:bg-red-50 hover:text-red-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveWidget(widget.id);
                    }}
                    title="Supprimer"
                  >
                    <X className="h-4 w-4 text-gray-600" />
                  </button>
                </div>
              )}
              <div className="h-full w-full overflow-auto">
                <WidgetErrorBoundary widgetId={widget.id} widgetType={widget.type}>
                  {renderWidget(widget)}
                </WidgetErrorBoundary>
              </div>
            </div>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
