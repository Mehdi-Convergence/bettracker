import { useState } from "react";
import type { MarketData, MarketSelection } from "../types";

// Market type display names
const MARKET_LABELS: Record<string, string> = {
  "1x2": "1X2",
  "double_chance": "Double Chance",
  "over_under": "Buts +/-",
  "btts": "Les 2 marquent",
  "correct_score": "Score exact",
  "half_time_result": "Mi-temps",
  "half_time_2_result": "2e Mi-temps",
  "goal_margin": "Ecart de buts",
  "goalscorer": "Buteur",
  "goalscorer_sub": "Buteur/Remp.",
  "assist_or_goal": "Joueur decisif",
  "team_total": "Buts equipe",
  "team_to_score": "Equipe marque",
  "early_win": "EarlyWin",
  "btts_or_over": "BTTS ou +2.5",
  "double_chance_scorer": "DC Buteur",
};

// Group markets into tabs
const MARKET_TABS: { label: string; types: string[] }[] = [
  { label: "Tous", types: [] }, // All markets
  { label: "Resultats", types: ["1x2", "double_chance", "early_win"] },
  { label: "Buts", types: ["over_under", "btts", "btts_or_over", "team_total", "team_to_score", "goal_margin"] },
  { label: "Score exact", types: ["correct_score", "half_time_result", "half_time_2_result"] },
  { label: "Buteurs", types: ["goalscorer", "goalscorer_sub", "assist_or_goal", "double_chance_scorer"] },
];

function SelectionCard({ sel }: { sel: MarketSelection }) {
  const hasEdge = sel.edge !== null && sel.edge !== undefined;
  const isValue = hasEdge && sel.edge! > 0.02;

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
        isValue
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-gray-100 bg-gray-50/50 hover:border-gray-200"
      }`}
    >
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-800 truncate block">{sel.name}</span>
        {sel.model_prob !== null && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-gray-400">
              Modele: {(sel.model_prob * 100).toFixed(0)}%
            </span>
            {hasEdge && (
              <span
                className={`text-[10px] font-semibold ${
                  sel.edge! > 0 ? "text-emerald-600" : "text-red-400"
                }`}
              >
                {sel.edge! > 0 ? "+" : ""}{(sel.edge! * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <span className="text-lg font-bold text-gray-900">{sel.odds.toFixed(2)}</span>
        {isValue && (
          <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
            VALUE
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  markets: MarketData[];
}

export default function MatchMarketsPanel({ markets }: Props) {
  const [activeTab, setActiveTab] = useState(0);

  if (!markets || markets.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-gray-400 text-sm">
        Aucun marche disponible pour ce match.
      </div>
    );
  }

  // Filter markets by active tab
  const tabConfig = MARKET_TABS[activeTab];
  const filteredMarkets =
    tabConfig.types.length === 0
      ? markets
      : markets.filter((m) => tabConfig.types.includes(m.market_type));

  // Count value bets per tab
  const tabCounts = MARKET_TABS.map((tab) => {
    const tabMarkets = tab.types.length === 0 ? markets : markets.filter((m) => tab.types.includes(m.market_type));
    return tabMarkets.reduce(
      (acc, m) => acc + m.selections.filter((s) => s.edge !== null && s.edge > 0.02).length,
      0
    );
  });

  return (
    <div className="border-t border-gray-100">
      {/* Tab bar */}
      <div className="flex gap-1 px-3 pt-2 pb-1 overflow-x-auto">
        {MARKET_TABS.map((tab, i) => {
          const hasMarkets =
            tab.types.length === 0
              ? markets.length > 0
              : markets.some((m) => tab.types.includes(m.market_type));
          if (!hasMarkets && i > 0) return null;

          return (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                activeTab === i
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {tab.label}
              {tabCounts[i] > 0 && (
                <span
                  className={`text-[9px] px-1 py-0 rounded-full font-bold ${
                    activeTab === i ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {tabCounts[i]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Markets */}
      <div className="px-3 pb-3 space-y-3 max-h-[500px] overflow-y-auto">
        {filteredMarkets.map((market, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1.5 mt-2">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {MARKET_LABELS[market.market_type] || market.market_name}
              </span>
              <span className="text-[10px] text-gray-400">
                {market.selections.length} selections
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {market.selections.map((sel, j) => (
                <SelectionCard key={j} sel={sel} />
              ))}
            </div>
          </div>
        ))}
        {filteredMarkets.length === 0 && (
          <div className="text-center py-4 text-gray-400 text-sm">
            Aucun marche dans cette categorie.
          </div>
        )}
      </div>
    </div>
  );
}
