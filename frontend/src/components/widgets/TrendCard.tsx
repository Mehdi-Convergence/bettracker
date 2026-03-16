import { useId } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TrendCardProps {
  title: string;
  value: string | number;
  trend?: number;
  data: number[];
  color?: string;
  suffix?: string;
}

export function TrendCard({ title, value, trend, data, color = "#3b82f6", suffix = "" }: TrendCardProps) {
  const gradientId = useId();
  const isPositive = (trend ?? 0) > 0;
  const isNegative = (trend ?? 0) < 0;
  const chartColor = isPositive ? "#10b981" : isNegative ? "#ef4444" : color;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const pathD = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return i === 0 ? `M${x},${y}` : `L${x},${y}`;
  }).join(" ");

  const areaD = `${pathD} L100,100 L0,100 Z`;

  return (
    <div className="h-full w-full rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      </div>
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-black" style={{ color }}>
            {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
            {suffix && <span className="text-lg ml-1 text-slate-400">{suffix}</span>}
          </div>
          {trend !== undefined && trend !== 0 && (
            <div
              className="flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-full"
              style={{ backgroundColor: `${chartColor}20`, color: chartColor }}
            >
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{isPositive ? "+" : ""}{trend.toFixed(1)}%</span>
            </div>
          )}
        </div>
        {data.length > 1 && (
          <div className="mt-3 h-16 w-full">
            <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={chartColor} stopOpacity="0.05" />
                </linearGradient>
              </defs>
              <path d={areaD} fill={`url(#${gradientId})`} />
              <path d={pathD} fill="none" stroke={chartColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
