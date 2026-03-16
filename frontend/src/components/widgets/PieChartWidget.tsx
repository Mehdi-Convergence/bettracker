import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { BaseWidget } from "./BaseWidget";
import { PieChart as PieIcon } from "lucide-react";

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

interface PieChartWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<{ name: string; value: number }>;
  isLoading?: boolean;
}

export function PieChartWidget({ title, subtitle, data, isLoading }: PieChartWidgetProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <BaseWidget
      title={title}
      subtitle={subtitle ?? `${total} total`}
      icon={<PieIcon className="h-4 w-4" />}
      isLoading={isLoading}
    >
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">Aucune donnee</div>
      ) : (
        <div className="h-full flex items-center gap-4">
          <div className="flex-shrink-0 w-[140px] h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ percent }: { percent?: number }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            {data.map((entry, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="text-xs font-medium text-slate-700 truncate">{entry.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-slate-900">{entry.value}</span>
                  <span className="text-xs text-slate-400 w-10 text-right">
                    {total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </BaseWidget>
  );
}
