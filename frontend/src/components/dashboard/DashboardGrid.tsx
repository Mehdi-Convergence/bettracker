import { useState, useEffect, useCallback } from "react";
import GridLayout, { verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import { GripVertical, X } from "lucide-react";
import { widgetRegistry, type WidgetType } from "../widgets/registry";
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
}

interface DashboardGridProps {
  widgets: DashboardWidget[];
  isEditMode: boolean;
  onLayoutChange: (widgets: DashboardWidget[]) => void;
  onRemoveWidget: (id: string) => void;
  renderWidget: (widget: DashboardWidget) => React.ReactNode;
}

export function DashboardGrid({
  widgets,
  isEditMode,
  onLayoutChange,
  onRemoveWidget,
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
    <div className="dashboard-grid-container">
      <GridLayout
        className={`layout ${!isEditMode ? "dashboard-read-only" : ""}`}
        layout={widgets.map((w) => {
          const def = widgetRegistry[w.type];
          return {
            i: w.id,
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
            minW: def?.minSize.w ?? 2,
            minH: def?.minSize.h ?? 2,
            static: !isEditMode,
          };
        })}
        gridConfig={{
          cols: 12,
          rowHeight: 60,
          margin: [16, 16] as const,
          containerPadding: [0, 0] as const,
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
