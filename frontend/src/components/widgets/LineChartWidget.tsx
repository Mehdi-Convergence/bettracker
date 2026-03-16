import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BaseWidget } from "./BaseWidget";
import { TrendingUp } from "lucide-react";

interface LineChartWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKeys: { key: string; color: string; name: string }[];
  isLoading?: boolean;
}

export function LineChartWidget({ title, subtitle, data, xKey, yKeys, isLoading }: LineChartWidgetProps) {
  return (
    <BaseWidget title={title} subtitle={subtitle} icon={<TrendingUp className="h-4 w-4" />} isLoading={isLoading}>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">Aucune donnee</div>
      ) : (
        <div className="h-full -m-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey={xKey} stroke="#9ca3af" style={{ fontSize: "11px" }} />
              <YAxis stroke="#9ca3af" style={{ fontSize: "11px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              />
              {yKeys.map(({ key, color, name }) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ fill: color, r: 2 }}
                  name={name}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </BaseWidget>
  );
}
