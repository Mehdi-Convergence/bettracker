import { BaseWidget } from "./BaseWidget";
import { Zap } from "lucide-react";

interface ValueBet {
  sport: string;
  match: string;
  league: string;
  edge: number;
  odds: number;
}

const SPORT_EMOJI: Record<string, string> = {
  football: "⚽",
  tennis: "🎾",
  nba: "🏀",
  mlb: "⚾",
  rugby: "🏉",
};

interface ValueBetsWidgetProps {
  title?: string;
  bets: ValueBet[];
  isLoading?: boolean;
}

export function ValueBetsWidget({ title = "Value Bets", bets, isLoading }: ValueBetsWidgetProps) {
  return (
    <BaseWidget
      title={title}
      subtitle={`${bets.length} opportunite${bets.length > 1 ? "s" : ""}`}
      icon={<Zap className="h-4 w-4" />}
      isLoading={isLoading}
    >
      {bets.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          Aucun value bet detecte
        </div>
      ) : (
        <div className="space-y-2">
          {bets.map((bet, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
              <span className="text-lg flex-shrink-0">{SPORT_EMOJI[bet.sport] ?? "🎯"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{bet.match}</p>
                <p className="text-xs text-slate-500 truncate">{bet.league}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-emerald-600">+{bet.edge}%</p>
                <p className="text-xs text-slate-500">@{bet.odds?.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </BaseWidget>
  );
}
