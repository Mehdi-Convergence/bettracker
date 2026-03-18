// Composants et utilitaires partages entre tous les sports du panel detail
import { useState } from "react";
import { TrendingUp, Target, Zap, BarChart2 } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { AIScanMatch } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Tab = "analyse" | "equipes" | "cotes";

export type KeyPlayer = {
  name: string;
  goals: number;
  assists: number;
  goals_per_match: number;
  rating: number;
  is_absent: boolean;
  position?: string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

export const OUTCOME_COLORS = { H: "#3b82f6", D: "#eab308", A: "#ef4444" };

export const CARD_MARKETS = new Set(["1x2", "btts", "double_chance", "draw_no_bet", "winner"]);

// ─── Tooltip helper ───────────────────────────────────────────────────────────

export function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group cursor-help">
      {children}
      <span className="absolute bottom-full left-0 mb-1 w-56 bg-slate-900 text-white text-[10px] rounded px-2 py-1.5 hidden group-hover:block z-50 leading-relaxed shadow-lg">
        {text}
      </span>
    </span>
  );
}

// ─── getTabs ──────────────────────────────────────────────────────────────────

export function getTabs(sport: string): { key: Tab; label: string }[] {
  return [
    { key: "analyse", label: "Analyse" },
    { key: "equipes", label: sport === "tennis" ? "Joueurs & Stats" : sport === "nba" ? "Stats NBA" : sport === "mlb" ? "Stats MLB" : "Equipes & Stats" },
    { key: "cotes", label: "Cotes" },
  ];
}

// ─── ProbBar ──────────────────────────────────────────────────────────────────

export function ProbBar({ label, prob, color, edge }: { label: string; prob: number; color: string; edge: number | null }) {
  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-900 font-medium">{(prob * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${prob * 100}%` }} />
      </div>
      {edge !== null && (
        <div className="text-[10px] mt-0.5 text-right">
          <span className={edge > 0 ? "text-emerald-600" : "text-slate-400"}>
            {edge > 0 ? "+" : ""}{(edge * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ─── FormRow ──────────────────────────────────────────────────────────────────

export function FormRow({ label, homeVal, awayVal, homeBetter, tooltip }: {
  label: string;
  homeVal: string;
  awayVal: string;
  homeBetter?: boolean;
  tooltip?: string;
}) {
  return (
    <>
      <div className={`text-right text-xs py-0.5 ${homeBetter === true ? "text-emerald-600 font-semibold" : homeBetter === false ? "text-slate-400" : "text-slate-700"}`}>
        {homeVal}
      </div>
      <div className="text-center text-slate-400 text-[10px] py-0.5">
        {tooltip ? (
          <Tip text={tooltip}><span className="underline decoration-dotted cursor-help">{label}</span></Tip>
        ) : label}
      </div>
      <div className={`text-left text-xs py-0.5 ${homeBetter === false ? "text-emerald-600 font-semibold" : homeBetter === true ? "text-slate-400" : "text-slate-700"}`}>
        {awayVal}
      </div>
    </>
  );
}

// ─── PredictionSection (tous sports) ─────────────────────────────────────────

export function PredictionSection({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const isTennis = am.sport === "tennis";
  const probH = am.model_prob_home ?? 0;
  const probD = am.model_prob_draw ?? 0;
  const probA = am.model_prob_away ?? 0;

  const isBinary = isTennis || am.sport === "nba" || am.sport === "mlb";
  const pieData = isBinary
    ? [
        { name: home, value: probH, color: OUTCOME_COLORS.H },
        { name: away, value: probA, color: OUTCOME_COLORS.A },
      ]
    : [
        { name: home, value: probH, color: OUTCOME_COLORS.H },
        { name: "Nul", value: probD, color: OUTCOME_COLORS.D },
        { name: away, value: probA, color: OUTCOME_COLORS.A },
      ];

  const bestOutcome = isTennis
    ? (probH >= probA ? "P1" : "P2")
    : (am.sport === "nba" || am.sport === "mlb")
      ? (probH >= probA ? "Home" : "Away")
      : (probH >= probD && probH >= probA ? "H" : probD >= probH && probD >= probA ? "D" : "A");
  const bestOutcomeLabel = isTennis
    ? (bestOutcome === "P1" ? home : away)
    : (am.sport === "nba" || am.sport === "mlb")
      ? (bestOutcome === "Home" ? home : away)
      : (bestOutcome === "H" ? home : bestOutcome === "D" ? "Nul" : away);
  const bestProb = isTennis
    ? (bestOutcome === "P1" ? probH : probA)
    : (am.sport === "nba" || am.sport === "mlb")
      ? (bestOutcome === "Home" ? probH : probA)
      : (bestOutcome === "H" ? probH : bestOutcome === "D" ? probD : probA);

  const allEdges = Object.entries(am.edges ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const bestEdgeEntry = allEdges[0];
  const bestEdgeKey = bestEdgeEntry?.[0];
  const bestEdge = bestEdgeEntry?.[1] ?? 0;

  const SECONDARY_EDGE_LABELS: Record<string, string> = {
    Over: `Over ${am.total_line ?? ""}`,
    Under: `Under ${am.total_line ?? ""}`,
    BTTS_Yes: "Les 2 marquent (Oui)",
    BTTS_No: "Les 2 marquent (Non)",
    Over25: "Plus de 2.5 buts",
    Under25: "Moins de 2.5 buts",
  };
  const H2H_KEYS = new Set(["H", "D", "A", "P1", "P2", "Home", "Away"]);
  const isSecondaryBet = bestEdgeKey != null && !H2H_KEYS.has(bestEdgeKey);
  const bestH2HEntry = allEdges.find(([k]) => H2H_KEYS.has(k));
  const bestH2HKey = bestH2HEntry?.[0];
  const bestH2HEdge = bestH2HEntry?.[1] ?? 0;

  const oddForEdge = (() => {
    const o = am.odds as Record<string, Record<string, unknown>>;
    const edgeKey = isSecondaryBet ? bestH2HKey : bestEdgeKey;
    const marketKey = isBinary ? "winner" : "1x2";
    const market = o?.[marketKey];
    if (!market || !edgeKey) return null;
    const entry = market[edgeKey];
    if (!entry) return null;
    if (typeof entry === "number") return entry;
    if (typeof entry === "object" && !Array.isArray(entry)) {
      const vals = Object.values(entry as Record<string, number>).map(Number).filter(Boolean);
      return vals.length ? Math.max(...vals) : null;
    }
    return null;
  })();

  const maxPts = isTennis ? 18 : (am.sport === "nba" || am.sport === "mlb") ? 6 : am.sport === "rugby" ? 7 : 23;

  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <Target size={15} className="text-blue-500" />
        <h4 className="text-slate-900 font-semibold text-sm">Prediction du modele</h4>
        {am.data_quality && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${
            am.data_quality === "green" ? "bg-emerald-100 text-emerald-700" :
            am.data_quality === "yellow" ? "bg-amber-100 text-amber-700" :
            "bg-red-100 text-red-600"
          }`}>
            {am.data_score != null ? `Donnees ${Math.round(am.data_score * maxPts)}/${maxPts}` : am.data_quality}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-6">
        <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={52} dataKey="value" strokeWidth={0}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                formatter={(v: number | undefined) => `${((v ?? 0) * 100).toFixed(1)}%`}
                contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex gap-3">
            {isTennis ? (
              <>
                <ProbBar label={home.split(" ").pop() ?? "P1"} prob={probH} color="bg-blue-500" edge={am.edges?.P1 ?? null} />
                <ProbBar label={away.split(" ").pop() ?? "P2"} prob={probA} color="bg-red-500" edge={am.edges?.P2 ?? null} />
              </>
            ) : (am.sport === "nba" || am.sport === "mlb") ? (
              <>
                <ProbBar label="DOM" prob={probH} color="bg-blue-500" edge={am.edges?.Home ?? null} />
                <ProbBar label="EXT" prob={probA} color="bg-red-500" edge={am.edges?.Away ?? null} />
              </>
            ) : (
              <>
                <ProbBar label="DOM" prob={probH} color="bg-blue-500" edge={am.edges?.H ?? null} />
                <ProbBar label="NUL" prob={probD} color="bg-amber-400" edge={am.edges?.D ?? null} />
                <ProbBar label="EXT" prob={probA} color="bg-red-500" edge={am.edges?.A ?? null} />
              </>
            )}
          </div>
          <div className="pt-3 border-t border-slate-200 space-y-1">
            <p className="text-sm text-slate-600">
              Pari recommande :{" "}
              <span className="font-bold text-slate-900">{bestOutcomeLabel}</span>
              <span className="text-slate-400 text-xs ml-1">({(bestProb * 100).toFixed(1)}% confiance)</span>
            </p>
            {bestH2HEdge > 0 && bestH2HKey && (
              <p className="text-sm text-slate-500">
                Value bet :{" "}
                <span className={`font-semibold ${
                  bestH2HKey === "H" || bestH2HKey === "P1" || bestH2HKey === "Home" ? "text-blue-600" :
                  bestH2HKey === "D" ? "text-amber-600" : "text-red-600"
                }`}>
                  {isTennis
                    ? (bestH2HKey === "P1" ? home.split(" ").pop() : away.split(" ").pop())
                    : (am.sport === "nba" || am.sport === "mlb")
                      ? (bestH2HKey === "Home" ? "DOM" : "EXT")
                      : (bestH2HKey === "H" ? "DOM" : bestH2HKey === "D" ? "NUL" : "EXT")}
                </span>
                <span className="text-emerald-600 ml-2 font-medium">+{(bestH2HEdge * 100).toFixed(1)}% <Tip text="Ecart entre la probabilite estimee par le modele et la probabilite implicite de la cote du bookmaker. Positif = valeur detectee."><span className="underline decoration-dotted cursor-help">edge</span></Tip></span>
                {oddForEdge && <span className="text-amber-600 ml-2">@ {oddForEdge.toFixed(2)}</span>}
              </p>
            )}
            {isSecondaryBet && bestEdgeKey && (
              <p className="text-sm">
                <span className="text-amber-600 font-semibold">Meilleur pari : </span>
                <span className="font-bold text-slate-900">{SECONDARY_EDGE_LABELS[bestEdgeKey] ?? bestEdgeKey}</span>
                <span className="text-emerald-600 ml-2 font-medium">+{(bestEdge * 100).toFixed(1)}% <Tip text="Ecart entre la probabilite estimee par le modele et la probabilite implicite de la cote du bookmaker. Positif = valeur detectee."><span className="underline decoration-dotted cursor-help">edge</span></Tip></span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RecentMatchesSection (football + tennis) ─────────────────────────────────

export function RecentMatchesSection({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const homeMatches = am.form_home_detail ?? [];
  const awayMatches = am.form_away_detail ?? [];
  const maxLen = Math.max(homeMatches.length, awayMatches.length);
  if (maxLen === 0) return null;

  function resultChar(s: string) {
    const c = s.trim().charAt(0).toUpperCase();
    if (c === "V" || c === "W") return { char: "V", cls: "bg-emerald-500 text-white" };
    if (c === "N") return { char: "N", cls: "bg-amber-400 text-white" };
    return { char: "D", cls: "bg-red-500 text-white" };
  }

  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={15} className="text-blue-500" />
        <h4 className="text-slate-900 font-semibold text-sm">Derniers matchs</h4>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-blue-600 mb-2">{home}</div>
          <div className="space-y-1">
            {homeMatches.map((m, i) => {
              const { char, cls } = resultChar(m);
              const detail = m.substring(1).trim();
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${cls}`}>{char}</span>
                  <span className="text-slate-600 truncate">{detail}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-red-600 mb-2">{away}</div>
          <div className="space-y-1">
            {awayMatches.map((m, i) => {
              const { char, cls } = resultChar(m);
              const detail = m.substring(1).trim();
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${cls}`}>{char}</span>
                  <span className="text-slate-600 truncate">{detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CotesMarketSection ───────────────────────────────────────────────────────

export function CotesMarketSection({ market, label, outcomes, isMainMarket, modelProbs, maxProb, getAltModelInfo, defaultOpen }: {
  market: string;
  label: string;
  outcomes: [string, unknown][];
  isMainMarket: boolean;
  modelProbs: Record<string, number>;
  maxProb: number;
  getAltModelInfo: (market: string, outcome: string) => { prob: number | null; edge: number | null };
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [selectedBk, setSelectedBk] = useState<Record<string, string>>({});
  const [expandedOutcome, setExpandedOutcome] = useState<string | null>(null);
  const isCard = CARD_MARKETS.has(market) && outcomes.length <= 3;

  function buildBkOptions(val: unknown): { bk: string; odd: number }[] {
    if (typeof val === "number") return [{ bk: "Best", odd: val }];
    if (val && typeof val === "object") {
      return Object.entries(val as Record<string, number>)
        .map(([bk, odd]) => ({ bk, odd: Number(odd) }))
        .filter(({ odd }) => odd > 0)
        .sort((a, b) => b.odd - a.odd);
    }
    return [];
  }

  const totalBks = new Set(outcomes.flatMap(([, val]) => {
    if (val && typeof val === "object" && !Array.isArray(val)) return Object.keys(val as Record<string, unknown>);
    return [];
  })).size;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-slate-700 flex-1">{label}</span>
        {totalBks > 0 && (
          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{totalBks} books</span>
        )}
        <span className="text-slate-400">
          {open ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {isCard ? (
            <div className="p-3">
              <div className={`grid gap-2 ${outcomes.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
                {outcomes.map(([outcome, val]) => {
                  const bkOptions = buildBkOptions(val);
                  if (bkOptions.length === 0) return null;
                  const bestBk = bkOptions[0];
                  const prob = isMainMarket ? (modelProbs[outcome] ?? 0) : 0;
                  const isFav = isMainMarket && prob === maxProb && maxProb > 0;
                  const altModel = getAltModelInfo(market, outcome);
                  const hasAltModel = altModel.prob !== null;
                  const hasValueEdge = altModel.edge !== null && altModel.edge > 0;
                  const isExpanded = expandedOutcome === `${market}__${outcome}`;

                  return (
                    <div key={outcome} className={`rounded-xl overflow-hidden border-2 bg-white ${isFav ? "border-emerald-300" : hasValueEdge ? "border-amber-300" : "border-slate-100"}`}>
                      {(isMainMarket && prob > 0) && <div className={`h-1 ${isFav ? "bg-emerald-400" : "bg-slate-200"}`} />}
                      {hasAltModel && <div className={`h-1 ${hasValueEdge ? "bg-amber-400" : "bg-slate-200"}`} style={{ width: `${(altModel.prob! * 100).toFixed(0)}%` }} />}
                      <div className="flex flex-col items-center px-2 pt-2.5 pb-2 gap-1">
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide truncate w-full text-center">{outcome}</span>
                        <span className={`text-2xl font-bold tabular-nums ${isFav ? "text-emerald-600" : "text-slate-800"}`}>{bestBk.odd.toFixed(2)}</span>
                        {isMainMarket && prob > 0 && (
                          <span className={`text-[9px] font-medium ${isFav ? "text-emerald-500" : "text-slate-400"}`}>{(prob * 100).toFixed(0)}%</span>
                        )}
                        {hasAltModel && (
                          <span className={`text-[9px] font-medium ${hasValueEdge ? "text-amber-600" : "text-slate-400"}`}>
                            {(altModel.prob! * 100).toFixed(1)}%
                            {hasValueEdge && <span className="text-emerald-600 ml-1">+{(altModel.edge! * 100).toFixed(1)}%</span>}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">{bestBk.bk}</span>
                        {bkOptions.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedOutcome(isExpanded ? null : `${market}__${outcome}`); }}
                            className="text-[10px] text-blue-500 hover:text-blue-700 font-medium mt-0.5"
                          >
                            {isExpanded ? "Masquer" : `${bkOptions.length} bookmakers`}
                          </button>
                        )}
                      </div>
                      {isExpanded && bkOptions.length > 1 && (
                        <div className="border-t border-slate-100 px-2 py-1.5 bg-slate-50 max-h-32 overflow-y-auto">
                          {bkOptions.map(({ bk, odd }, i) => (
                            <div key={bk} className={`flex justify-between py-0.5 text-[11px] ${i === 0 ? "font-semibold text-emerald-700" : "text-slate-600"}`}>
                              <span className="truncate mr-2">{bk}</span>
                              <span className="tabular-nums font-medium">{odd.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {outcomes.map(([outcome, val]) => {
                const bkOptions = buildBkOptions(val);
                if (bkOptions.length === 0) return null;
                const bestBk = bkOptions[0];
                const key = `${market}__${outcome}`;
                const currentBk = selectedBk[key] ?? bestBk.bk;
                const currentOdd = bkOptions.find((b) => b.bk === currentBk)?.odd ?? bestBk.odd;
                const isExpanded = expandedOutcome === key;

                const altModel = getAltModelInfo(market, outcome);
                const hasEdge = altModel.edge !== null && altModel.edge > 0;

                return (
                  <div key={outcome}>
                    <div className={`flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer ${hasEdge ? "border-l-2 border-amber-400" : ""}`}
                      onClick={() => bkOptions.length > 1 && setExpandedOutcome(isExpanded ? null : key)}
                    >
                      <span className="flex-1 text-sm text-slate-600 truncate">{outcome}</span>
                      {altModel.prob !== null && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {(altModel.prob * 100).toFixed(1)}%
                          {hasEdge && <span className="text-emerald-600 ml-1 font-semibold">+{(altModel.edge! * 100).toFixed(1)}%</span>}
                        </span>
                      )}
                      <span className="text-base font-bold tabular-nums text-slate-900 min-w-[3rem] text-right shrink-0">{currentOdd.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 shrink-0 max-w-[70px] truncate">{currentBk}</span>
                      {bkOptions.length > 1 && (
                        <span className="text-slate-300 shrink-0">
                          {isExpanded
                            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>}
                        </span>
                      )}
                    </div>
                    {isExpanded && bkOptions.length > 1 && (
                      <div className="bg-slate-50 px-4 py-2 border-t border-slate-100">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                          {bkOptions.map(({ bk, odd }, i) => (
                            <button key={bk}
                              onClick={() => setSelectedBk((prev) => ({ ...prev, [key]: bk }))}
                              className={`flex justify-between py-1 px-2 rounded text-[11px] transition-colors ${
                                bk === currentBk ? "bg-blue-50 text-blue-700 font-semibold" :
                                i === 0 ? "text-emerald-700 font-medium hover:bg-emerald-50" :
                                "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              <span className="truncate mr-1">{bk}</span>
                              <span className="tabular-nums">{odd.toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CotesTab (tous sports) ───────────────────────────────────────────────────

export function CotesTab({ am }: { am: AIScanMatch }) {
  const odds = am.odds as Record<string, Record<string, unknown>>;

  if (!odds || Object.keys(odds).length === 0) {
    return <p className="text-sm text-slate-400">Aucune cote disponible.</p>;
  }

  const isTennis = am.sport === "tennis";
  const isNBAOdds = am.sport === "nba";
  const isMLBOdds = am.sport === "mlb";
  const MARKET_ORDER = isTennis
    ? ["winner", "sets", "games", "handicap_sets", "handicap_games", "over_under_games", "first_set_winner", "correct_score"]
    : isNBAOdds
      ? ["winner", "over_under", "handicap", "player_points", "player_assists", "player_rebounds"]
      : isMLBOdds
        ? ["winner", "over_under", "run_line", "first_5_innings", "team_total_runs"]
        : ["1x2", "btts", "over_under_2.5", "over_under", "double_chance", "draw_no_bet", "asian_handicap", "goalscorer_anytime", "goalscorer_first"];
  const MARKET_LABELS: Record<string, string> = isTennis
    ? {
        "winner": "Vainqueur du match",
        "sets": "Nombre de sets",
        "games": "Total de jeux",
        "handicap_sets": "Handicap sets",
        "handicap_games": "Handicap jeux",
        "over_under_games": "Plus / Moins de jeux",
        "first_set_winner": "Vainqueur 1er set",
        "correct_score": "Score exact (sets)",
      }
    : isNBAOdds
      ? {
          "winner": "Vainqueur du match",
          "over_under": "Total de points (O/U)",
          "handicap": "Handicap",
          "player_points": "Points joueur",
          "player_assists": "Passes decisives joueur",
          "player_rebounds": "Rebonds joueur",
        }
      : isMLBOdds
        ? {
            "winner": "Vainqueur du match (Moneyline)",
            "over_under": "Total de runs (O/U)",
            "run_line": "Run Line (handicap)",
            "first_5_innings": "5 premieres manches",
            "team_total_runs": "Total equipe",
          }
        : {
            "1x2": "Resultat du match",
            "btts": "Les deux equipes marquent",
            "over_under": "Plus / Moins de buts",
            "over_under_2.5": "Plus / Moins 2.5 buts",
            "double_chance": "Double chance",
            "draw_no_bet": "Match nul rembourse",
            "goalscorer_first": "Premier buteur",
            "goalscorer_anytime": "Buteur (a tout moment)",
            "asian_handicap": "Handicap",
          };

  const orderedMarkets = [
    ...MARKET_ORDER.filter((m) => odds[m]),
    ...Object.keys(odds).filter((m) => !MARKET_ORDER.includes(m)),
  ];

  const modelProbs: Record<string, number> = isTennis
    ? { P1: am.model_prob_home ?? 0, P2: am.model_prob_away ?? 0 }
    : (isNBAOdds || isMLBOdds)
      ? { Home: am.model_prob_home ?? 0, Away: am.model_prob_away ?? 0 }
      : { H: am.model_prob_home ?? 0, D: am.model_prob_draw ?? 0, A: am.model_prob_away ?? 0 };
  const maxProb = Math.max(...Object.values(modelProbs));
  const mainMarket = isTennis || isNBAOdds || isMLBOdds ? "winner" : "1x2";

  function getAltModelInfo(market: string, outcome: string): { prob: number | null; edge: number | null } {
    const o = outcome.toLowerCase();
    if ((market === "btts" || market === "both_teams_to_score") && (o === "yes" || o === "oui")) {
      return { prob: am.btts_model_prob ?? null, edge: am.btts_edge ?? null };
    }
    if ((market === "over_under_2.5" || market === "over_under") && o.startsWith("over 2.5")) {
      return { prob: am.over25_model_prob ?? null, edge: am.over25_edge ?? null };
    }
    return { prob: null, edge: null };
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <BarChart2 size={12} />
        <span>{orderedMarkets.length} marches disponibles</span>
      </div>
      {orderedMarkets.map((market, idx) => {
        const outcomes = odds[market];
        if (!outcomes || typeof outcomes !== "object") return null;
        const entries = Object.entries(outcomes);
        return (
          <CotesMarketSection
            key={market}
            market={market}
            label={MARKET_LABELS[market] ?? market.replace(/_/g, " ")}
            outcomes={entries}
            isMainMarket={market === mainMarket}
            modelProbs={modelProbs}
            maxProb={maxProb}
            getAltModelInfo={getAltModelInfo}
            defaultOpen={idx < 3}
          />
        );
      })}
    </div>
  );
}

// ─── IAConseilTab (football + tennis + NBA) ───────────────────────────────────

export function IAConseilTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const isTennis = am.sport === "tennis";
  const isNBA = am.sport === "nba";
  const isMLBC = am.sport === "mlb";
  const isBinaryC = isTennis || isNBA || isMLBC;
  const probH = am.model_prob_home ?? 0;
  const probD = am.model_prob_draw ?? 0;
  const probA = am.model_prob_away ?? 0;

  const bestOutcome = isTennis
    ? (probH >= probA ? "P1" : "P2")
    : (isNBA || isMLBC)
      ? (probH >= probA ? "Home" : "Away")
      : (probH >= probD && probH >= probA ? "H" : probD >= probA ? "D" : "A");
  const bestLabel = isTennis
    ? (bestOutcome === "P1" ? home : away)
    : (isNBA || isMLBC)
      ? (bestOutcome === "Home" ? home : away)
      : (bestOutcome === "H" ? home : bestOutcome === "D" ? "Nul" : away);
  const bestProb = isBinaryC
    ? (bestOutcome === "P1" || bestOutcome === "Home" ? probH : probA)
    : (bestOutcome === "H" ? probH : bestOutcome === "D" ? probD : probA);

  const oddsObj = am.odds as Record<string, Record<string, unknown>> | null;

  const bestOdd = (() => {
    const marketKey = isBinaryC ? "winner" : "1x2";
    const market = oddsObj?.[marketKey];
    if (!market) return null;
    const val = market[bestOutcome];
    if (typeof val === "number") return val;
    if (val && typeof val === "object") {
      const vals = Object.values(val as Record<string, number>).map(Number).filter(Boolean);
      return vals.length ? Math.max(...vals) : null;
    }
    return null;
  })();

  const edge = am.edges?.[bestOutcome] ?? null;

  type Sentence = { text: string; type: "primary" | "secondary" | "info" };
  const sentences: Sentence[] = [];

  if (bestProb > 0) {
    sentences.push({ text: `Notre modele donne ${(bestProb * 100).toFixed(1)}% de chance a ${bestLabel}.`, type: "primary" });
  }

  if (isTennis) {
    if (am.ranking_p1 != null && am.ranking_p2 != null) {
      const diff = Math.abs(am.ranking_p1 - am.ranking_p2);
      if (diff >= 20) {
        const better = am.ranking_p1 < am.ranking_p2 ? home : away;
        const betterRank = Math.min(am.ranking_p1, am.ranking_p2);
        const worseRank = Math.max(am.ranking_p1, am.ranking_p2);
        sentences.push({ text: `${better} est nettement mieux classe (${betterRank}e vs ${worseRank}e mondial).`, type: "info" });
      }
    }

    if (am.surface && am.p1_surface_record && am.p2_surface_record) {
      sentences.push({ text: `Sur ${am.surface} : ${home} (${am.p1_surface_record}) vs ${away} (${am.p2_surface_record}).`, type: "info" });
    }

    if (am.p1_serve_pct != null && am.p2_serve_pct != null) {
      const diff = am.p1_serve_pct - am.p2_serve_pct;
      if (Math.abs(diff) >= 3) {
        const betterServer = diff > 0 ? home : away;
        sentences.push({ text: `${betterServer} a un meilleur % au service (${diff > 0 ? am.p1_serve_pct : am.p2_serve_pct}% vs ${diff > 0 ? am.p2_serve_pct : am.p1_serve_pct}%).`, type: "info" });
      }
    }

    if (edge !== null && Math.abs(edge) > 0.01 && bestOdd) {
      const bookProb = (1 / bestOdd * 100).toFixed(1);
      if (edge > 0) {
        sentences.push({
          text: `Le bookmaker donne ${bookProb}% a ${bestLabel} (cote ${bestOdd.toFixed(2)}). Notre modele estime ${(bestProb * 100).toFixed(1)}%. Difference : +${(edge * 100).toFixed(1)}%.`,
          type: "info",
        });
      }
    }

    if (am.form_home && am.form_away) {
      const winsH = (am.form_home.match(/[VW]/g) || []).length;
      const winsA = (am.form_away.match(/[VW]/g) || []).length;
      if (winsH !== winsA) {
        const better = winsH > winsA ? home : away;
        sentences.push({ text: `${better} est en meilleure forme recente (${Math.max(winsH, winsA)} victoires sur 5 contre ${Math.min(winsH, winsA)}).`, type: "info" });
      }
    }

    if (am.h2h_summary) {
      sentences.push({ text: `H2H : ${am.h2h_summary}`, type: "info" });
    }

    if (am.p1_rest_days != null && am.p2_rest_days != null && Math.abs(am.p1_rest_days - am.p2_rest_days) >= 2) {
      const tired = am.p1_rest_days < am.p2_rest_days ? home : away;
      const fresh = am.p1_rest_days < am.p2_rest_days ? away : home;
      sentences.push({ text: `${fresh} est plus repose (${Math.max(am.p1_rest_days, am.p2_rest_days)}j de repos vs ${Math.min(am.p1_rest_days, am.p2_rest_days)}j pour ${tired}).`, type: "secondary" });
    }

    if (am.p1_season_record && am.p2_season_record) {
      sentences.push({ text: `Bilan saison : ${home} (${am.p1_season_record}) vs ${away} (${am.p2_season_record}).`, type: "secondary" });
    }
  } else if (isNBA) {
    if (am.home_win_rate_10 != null && am.away_win_rate_10 != null) {
      const diff = Math.abs(am.home_win_rate_10 - am.away_win_rate_10);
      if (diff >= 0.15) {
        const better = am.home_win_rate_10 > am.away_win_rate_10 ? home : away;
        const betterRate = Math.max(am.home_win_rate_10, am.away_win_rate_10);
        sentences.push({ text: `${better} est en meilleure forme (${(betterRate * 100).toFixed(0)}% de victoires sur les 10 derniers matchs).`, type: "info" });
      }
    }

    if (am.home_pt_diff_10 != null && am.away_pt_diff_10 != null) {
      const diff = am.home_pt_diff_10 - am.away_pt_diff_10;
      if (Math.abs(diff) >= 5) {
        const better = diff > 0 ? home : away;
        const betterDiff = diff > 0 ? am.home_pt_diff_10 : am.away_pt_diff_10;
        sentences.push({ text: `${better} domine par le differentiel de points (${betterDiff > 0 ? "+" : ""}${betterDiff.toFixed(1)} pts/match sur 10j).`, type: "info" });
      }
    }

    if (am.home_pts_avg_10 != null && am.away_pts_avg_10 != null) {
      const totalAvg = am.home_pts_avg_10 + am.away_pts_avg_10;
      sentences.push({ text: `Attaque : ${home} marque en moyenne ${am.home_pts_avg_10.toFixed(1)} pts, ${away} ${am.away_pts_avg_10.toFixed(1)} pts (total moyen attendu : ${totalAvg.toFixed(1)} pts).`, type: "secondary" });
    }

    if (am.home_b2b) {
      sentences.push({ text: `Attention : ${home} joue dos-a-dos (2e match en 2 nuits), ce qui peut affecter ses performances.`, type: "info" });
    }
    if (am.away_b2b) {
      sentences.push({ text: `Attention : ${away} joue dos-a-dos (2e match en 2 nuits), ce qui peut affecter ses performances.`, type: "info" });
    }

    if (am.home_streak != null && Math.abs(am.home_streak) >= 3) {
      const type = am.home_streak > 0 ? "serie de victoires" : "serie de defaites";
      sentences.push({ text: `${home} est en ${type} (${Math.abs(am.home_streak)} matchs consecutifs).`, type: am.home_streak > 0 ? "secondary" : "info" });
    }
    if (am.away_streak != null && Math.abs(am.away_streak) >= 3) {
      const type = am.away_streak > 0 ? "serie de victoires" : "serie de defaites";
      sentences.push({ text: `${away} est en ${type} (${Math.abs(am.away_streak)} matchs consecutifs).`, type: am.away_streak > 0 ? "secondary" : "info" });
    }

    if (edge !== null && Math.abs(edge) > 0.01 && bestOdd) {
      const bookProb = (1 / bestOdd * 100).toFixed(1);
      if (edge > 0) {
        sentences.push({
          text: `Le bookmaker donne ${bookProb}% a ${bestLabel} (cote ${bestOdd.toFixed(2)}). Notre modele estime ${(bestProb * 100).toFixed(1)}%. Difference : +${(edge * 100).toFixed(1)}%.`,
          type: "info",
        });
      }
    }

    if (am.total_line != null && am.home_pts_avg_10 != null && am.away_pts_avg_10 != null) {
      const avgTotal = am.home_pts_avg_10 + am.away_pts_avg_10;
      if (avgTotal > am.total_line + 5) {
        sentences.push({ text: `Les deux equipes marquent en moyenne ${avgTotal.toFixed(0)} pts cumulees, au-dessus de la ligne O/U (${am.total_line}).`, type: "secondary" });
      } else if (avgTotal < am.total_line - 5) {
        sentences.push({ text: `Les deux equipes marquent en moyenne ${avgTotal.toFixed(0)} pts cumulees, en dessous de la ligne O/U (${am.total_line}).`, type: "secondary" });
      }
    }
  } else {
    // Football
    if (am.lambda_home != null && am.lambda_away != null) {
      sentences.push({
        text: `Le modele Poisson predit ${am.lambda_home} buts pour ${home.split(" ")[0]} et ${am.lambda_away} buts pour ${away.split(" ")[0]} (total attendu : ${(am.lambda_home + am.lambda_away).toFixed(1)} buts).`,
        type: "info",
      });
    }

    if (edge !== null && Math.abs(edge) > 0.01 && bestOdd) {
      const bookProb = (1 / bestOdd * 100).toFixed(1);
      if (edge > 0) {
        sentences.push({
          text: `Le bookmaker donne ${bookProb}% a ${bestLabel} (cote ${bestOdd.toFixed(2)}). Notre modele estime ${(bestProb * 100).toFixed(1)}%. Difference : +${(edge * 100).toFixed(1)}%.`,
          type: "info",
        });
      }
    }

    if (am.form_home && am.form_away) {
      const winsH = (am.form_home.match(/[VW]/g) || []).length;
      const winsA = (am.form_away.match(/[VW]/g) || []).length;
      if (winsH !== winsA) {
        const better = winsH > winsA ? home.split(" ")[0] : away.split(" ")[0];
        const w = Math.max(winsH, winsA);
        const l = Math.min(winsH, winsA);
        sentences.push({ text: `${better} est en meilleure forme sur les 5 derniers matchs (${w} victoires vs ${l}).`, type: "info" });
      }
    }

    if (am.position_home != null && am.position_away != null) {
      const diff = am.position_away - am.position_home;
      if (Math.abs(diff) >= 3) {
        const better = diff > 0 ? home.split(" ")[0] : away.split(" ")[0];
        sentences.push({ text: `${better} est mieux classe au classement (${diff > 0 ? am.position_home : am.position_away}e vs ${diff > 0 ? am.position_away : am.position_home}e).`, type: "info" });
      }
    }

    const absH = am.key_absences_home ?? [];
    const absA = am.key_absences_away ?? [];
    if (absH.length > 0) sentences.push({ text: `Attention : ${home.split(" ")[0]} est prive de ${absH.slice(0, 2).join(", ")}.`, type: "info" });
    if (absA.length > 0) sentences.push({ text: `Attention : ${away.split(" ")[0]} est prive de ${absA.slice(0, 2).join(", ")}.`, type: "info" });

    if (am.lambda_home != null && am.lambda_away != null) {
      const lh = am.lambda_home;
      const la = am.lambda_away;
      const pBTTS = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
      const mu = lh + la;
      const pUnder25 = Math.exp(-mu) * (1 + mu + mu * mu / 2);
      const pOver25 = 1 - pUnder25;
      const pOver15 = 1 - Math.exp(-mu) * (1 + mu);

      if (pBTTS > 0.65) {
        sentences.push({ text: `Les deux equipes marquent : ${(pBTTS * 100).toFixed(0)}% de probabilite selon Poisson.`, type: "secondary" });
      }
      if (pOver25 > 0.65) {
        sentences.push({ text: `Plus de 2.5 buts : ${(pOver25 * 100).toFixed(0)}% de probabilite (${mu.toFixed(1)} buts attendus au total).`, type: "secondary" });
      } else if (pOver25 < 0.35) {
        sentences.push({ text: `Moins de 2.5 buts : ${((1 - pOver25) * 100).toFixed(0)}% de probabilite. Match ferme attendu.`, type: "secondary" });
      }
      if (pOver15 > 0.75) {
        sentences.push({ text: `Plus de 1.5 buts : ${(pOver15 * 100).toFixed(0)}% de probabilite.`, type: "secondary" });
      }
    }

    const goalscorerOdds = oddsObj?.["goalscorer_anytime"];
    if (goalscorerOdds && typeof goalscorerOdds === "object") {
      const highProb = Object.entries(goalscorerOdds)
        .filter(([, v]) => typeof v === "number" && v > 0 && 1 / (v as number) > 0.35)
        .map(([name, v]) => ({ name, prob: 1 / (v as number) }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 2);
      highProb.forEach(({ name, prob }) => {
        sentences.push({ text: `Buteur probable : ${name} (${(prob * 100).toFixed(0)}% de chance de marquer).`, type: "secondary" });
      });
    }
  }

  if (sentences.length === 0) {
    return <p className="text-sm text-slate-400">Donnees insuffisantes pour generer une analyse.</p>;
  }

  return (
    <div className="space-y-2">
      {sentences.map((s, i) => (
        <div key={i} className={`p-3 rounded-lg text-sm leading-relaxed border ${
          s.type === "primary" ? "bg-blue-50 border-blue-100 text-blue-800 font-medium" :
          s.type === "secondary" ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
          "bg-slate-50 border-slate-100 text-slate-600"
        }`}>
          {s.text}
        </div>
      ))}
    </div>
  );
}

// ─── EdgeBarChart helper ──────────────────────────────────────────────────────

export function EdgeBarChart({ edgeData, height = 28 }: {
  edgeData: { name: string; value: number; fill: string }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={edgeData} layout="vertical" margin={{ left: 80, right: 30, top: 0, bottom: 0 }}>
          <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} />
          <YAxis type="category" dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} width={75} />
          <Tooltip
            formatter={(v: number | undefined) => { const n = v ?? 0; return `${n > 0 ? "+" : ""}${n}%`; }}
            contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {edgeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EdgeLegend() {
  return (
    <div className="flex gap-4 text-[10px] text-slate-400 mt-1">
      <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Value (modele &gt; marche)</span>
      <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Cote trop basse</span>
    </div>
  );
}

// ─── DataQualityRow helper ────────────────────────────────────────────────────

export function DataQualityRow({ am, maxPts }: { am: AIScanMatch; maxPts: number }) {
  if (!am.data_quality) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 mb-2">
        <Tip text="Nombre de sources de donnees disponibles. Plus c'est eleve, plus notre modele est fiable.">
          Fiabilite des donnees <span className="text-slate-400 underline decoration-dotted">i</span>
        </Tip>
      </div>
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${am.data_quality === "green" ? "bg-emerald-500" : am.data_quality === "yellow" ? "bg-amber-400" : "bg-red-500"}`} />
        <span className="text-sm text-slate-700">
          {am.data_quality === "green" ? "Excellente" : am.data_quality === "yellow" ? "Correcte" : "Limitee"}
          {am.data_score != null && <span className="text-slate-400 ml-1">({Math.round(am.data_score * maxPts)}/{maxPts} points)</span>}
        </span>
      </div>
    </div>
  );
}

// ─── AbsencesGrid helper ──────────────────────────────────────────────────────

export function AbsencesGrid({ am, home, away, withPositionImpact = false }: {
  am: AIScanMatch;
  home: string;
  away: string;
  withPositionImpact?: boolean;
}) {
  if ((am.key_absences_home?.length ?? 0) === 0 && (am.key_absences_away?.length ?? 0) === 0) return null;
  const posImpact: Record<string, string> = { Goalkeeper: "-10% GK", Attacker: "-7% ATT", Midfielder: "-5% MIL", Defender: "-3% DEF" };

  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="text-xs font-semibold text-slate-600 mb-2">Blessures / Absences</div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: home, list: am.key_absences_home, keyPlayers: withPositionImpact ? am.key_players_home : undefined },
          { label: away, list: am.key_absences_away, keyPlayers: withPositionImpact ? am.key_players_away : undefined },
        ].map(({ label, list, keyPlayers }) => {
          if (withPositionImpact && keyPlayers !== undefined) {
            const absentKeys = (keyPlayers ?? []).filter((p) => p.is_absent);
            const absentKeyNames = new Set(absentKeys.map((p) => p.name));
            const otherAbsences = (list ?? []).filter((name) => !absentKeyNames.has(name));
            return (
              <div key={label}>
                <div className="text-[10px] text-slate-500 mb-1 font-medium truncate">{label}</div>
                {absentKeys.length === 0 && otherAbsences.length === 0
                  ? <span className="text-[11px] text-slate-300">Aucune absence</span>
                  : <>
                    {absentKeys.map((p, i) => (
                      <div key={i} className="flex items-center gap-1 text-[11px] mb-0.5">
                        <span className="text-red-400 shrink-0">•</span>
                        <span className="text-red-700 font-medium truncate">{p.name}</span>
                        {p.position && (
                          <span className="text-[9px] text-slate-400 shrink-0">{p.position.slice(0, 3).toUpperCase()}</span>
                        )}
                        {p.position && posImpact[p.position] && (
                          <span className="text-[9px] text-amber-600 font-medium shrink-0">{posImpact[p.position]}</span>
                        )}
                      </div>
                    ))}
                    {otherAbsences.map((ab, i) => (
                      <div key={i} className="flex items-start gap-1 text-[11px] text-red-500 mb-0.5">
                        <span className="text-red-300 shrink-0 mt-0.5">•</span>
                        <span>{ab}</span>
                      </div>
                    ))}
                  </>
                }
              </div>
            );
          }
          return (
            <div key={label}>
              <div className="text-[10px] text-slate-500 mb-1 font-medium truncate">{label}</div>
              {list && list.length > 0 ? list.map((ab, i) => (
                <div key={i} className="flex items-start gap-1 text-[11px] text-red-600 mb-0.5">
                  <span className="text-red-400 shrink-0 mt-0.5">-</span>
                  <span>{ab}</span>
                </div>
              )) : <span className="text-[11px] text-slate-300">Aucune absence</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FormBubbles helper ───────────────────────────────────────────────────────

export function FormBubbles({ form, size = "md" }: { form: string; size?: "sm" | "md" }) {
  const cls = size === "sm"
    ? "w-4 h-4 text-[8px]"
    : "w-5 h-5 text-[9px]";
  return (
    <>
      {(form || "").split("").slice(0, 5).map((c, i) => (
        <span key={i} className={`${cls} rounded-full flex items-center justify-center font-bold text-white ${
          c === "V" || c === "W" ? "bg-emerald-500" : c === "N" || c === "D" ? "bg-amber-400" : "bg-red-500"
        }`}>{c === "W" ? "V" : c === "L" ? "D" : c}</span>
      ))}
    </>
  );
}

// ─── OverUnderCard helper ─────────────────────────────────────────────────────

export function OverUnderSection({ am }: { am: AIScanMatch }) {
  if (am.total_line == null || am.odds_over == null) return null;
  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={15} className="text-amber-500" />
        <h4 className="text-slate-900 font-semibold text-sm">Marches secondaires</h4>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[11px] text-slate-500 font-medium mb-1">Over {am.total_line}</div>
          {am.odds_over != null && <div className="text-lg font-bold text-slate-800">{am.odds_over.toFixed(2)}</div>}
          {am.edges?.Over != null && (
            <div className={`text-xs font-semibold mt-1 ${am.edges.Over > 0 ? "text-emerald-600" : "text-red-500"}`}>
              Edge : {am.edges.Over > 0 ? "+" : ""}{(am.edges.Over * 100).toFixed(1)}%
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[11px] text-slate-500 font-medium mb-1">Under {am.total_line}</div>
          {am.odds_under != null && <div className="text-lg font-bold text-slate-800">{am.odds_under.toFixed(2)}</div>}
          {am.edges?.Under != null && (
            <div className={`text-xs font-semibold mt-1 ${am.edges.Under > 0 ? "text-emerald-600" : "text-red-500"}`}>
              Edge : {am.edges.Under > 0 ? "+" : ""}{(am.edges.Under * 100).toFixed(1)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TotalOUContext helper ────────────────────────────────────────────────────

export function TotalOUContext({ am }: { am: AIScanMatch }) {
  if (am.total_line == null && am.odds_over == null) return null;
  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={15} className="text-slate-500" />
        <h4 className="text-slate-900 font-semibold text-sm">Total Over/Under</h4>
      </div>
      <div className="space-y-1 text-sm">
        {am.total_line != null && <div className="flex justify-between"><span className="text-slate-500">Ligne O/U</span><span className="font-semibold">{am.total_line} pts</span></div>}
        {am.odds_over != null && <div className="flex justify-between"><span className="text-slate-500">Cote Over {am.total_line}</span><span className="font-semibold text-blue-600">{am.odds_over.toFixed(2)}</span></div>}
        {am.odds_under != null && <div className="flex justify-between"><span className="text-slate-500">Cote Under {am.total_line}</span><span className="font-semibold text-blue-600">{am.odds_under.toFixed(2)}</span></div>}
      </div>
    </div>
  );
}
