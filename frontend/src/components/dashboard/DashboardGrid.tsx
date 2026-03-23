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
  if (width < 400) return 1;
  if (width < 600) return 2;
  if (width < 768) return 4;
  if (width < 1024) return 6;
  return 12;
}

function adaptLayoutForCols(widgets: DashboardWidget[], cols: number): DashboardWidget[] {
  if (cols >= 12) return widgets;
  return widgets.map((w) => {
    const clampedW = Math.min(w.w, cols);
    let h = w.h;
    // On single-column mobile, reduce tall widgets to avoid endless scrolling
    if (cols <= 2) {
      if (w.type === "activity-feed") h = Math.min(h, 6);
      else if (w.type === "line-chart" || w.type === "bar-chart") h = Math.min(h, 4);
      else if (w.h >= 3) h = Math.min(h, 2);
    }
    return {
      ...w,
      w: clampedW,
      h,
      x: Math.min(w.x, Math.max(0, cols - clampedW)),
    };
  });
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
  const isMobile = containerWidth < 768;
  const adaptedWidgets = adaptLayoutForCols(widgets, cols);

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
            static: !isEditMode || isMobile,
          };
        })}
        gridConfig={{
          cols,
          rowHeight: cols <= 2 ? 45 : isMobile ? 50 : 60,
          margin: cols <= 2 ? [6, 6] as [number, number] : isMobile ? [8, 8] as [number, number] : [16, 16] as [number, number],
          containerPadding: [0, 0] as [number, number],
          maxRows: Infinity,
        }}
        width={containerWidth}
        dragConfig={{
          enabled: isEditMode && !isMobile,
          handle: ".widget-drag-handle",
          bounded: false,
          threshold: 3,
        }}
        resizeConfig={{
          enabled: isEditMode && !isMobile,
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
