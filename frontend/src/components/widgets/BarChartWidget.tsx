import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { BaseWidget } from "./BaseWidget";
import { BarChart3 } from "lucide-react";

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface BarChartWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<{ name: string; value: number }>;
  isLoading?: boolean;
}

export function BarChartWidget({ title, subtitle, data, isLoading }: BarChartWidgetProps) {
  return (
    <BaseWidget title={title} subtitle={subtitle} icon={<BarChart3 className="h-4 w-4" />} isLoading={isLoading}>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">Aucune donnee</div>
      ) : (
        <div className="h-full -m-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#9ca3af" style={{ fontSize: "11px" }} />
              <YAxis stroke="#9ca3af" style={{ fontSize: "11px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </BaseWidget>
  );
}
