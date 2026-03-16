import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number;
  trendInverted?: boolean;
  color?: string;
  prefix?: string;
  suffix?: string;
}

export function StatCard({ label, value, trend, trendInverted = false, color = "#3b82f6", prefix = "", suffix = "" }: StatCardProps) {
  const hasTrend = trend !== undefined && trend !== 0;
  const isPositive = trendInverted ? (trend ?? 0) < 0 : (trend ?? 0) > 0;
  const isNegative = trendInverted ? (trend ?? 0) > 0 : (trend ?? 0) < 0;

  const trendColor = isPositive ? "#10b981" : isNegative ? "#ef4444" : "#94a3b8";
  const barColor = hasTrend ? trendColor : color;

  return (
    <div className="relative h-full w-full rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: barColor }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">{label}</p>
        <span className="text-3xl font-bold tracking-tight" style={{ color }}>
          {prefix}{typeof value === "number" ? value.toLocaleString("fr-FR") : value}{suffix}
        </span>
        {hasTrend && (
          <div className="flex items-center gap-0.5 text-xs font-bold mt-0.5" style={{ color: trendColor }}>
            {isPositive && <TrendingUp className="h-3 w-3" />}
            {isNegative && <TrendingDown className="h-3 w-3" />}
            {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
            <span>{isPositive ? "+" : ""}{trend?.toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
