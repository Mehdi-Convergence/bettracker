import { useState, useEffect } from "react";
import { X, TrendingUp, Trophy, Target, Zap, Activity, BarChart2 } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { AIScanMatch } from "@/types";

interface Props {
  am: AIScanMatch;
  home: string;
  away: string;
  onClose: () => void;
  inline?: boolean;
}

// ─── Tooltip helper ───────────────────────────────────────────────────────────
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group cursor-help">
      {children}
      <span className="absolute bottom-full left-0 mb-1 w-56 bg-slate-900 text-white text-[10px] rounded px-2 py-1.5 hidden group-hover:block z-50 leading-relaxed shadow-lg">
        {text}
      </span>
    </span>
  );
}

const OUTCOME_COLORS = { H: "#3b82f6", D: "#eab308", A: "#ef4444" };

type Tab = "analyse" | "equipes" | "cotes";

function getTabs(sport: string): { key: Tab; label: string }[] {
  return [
    { key: "analyse", label: "Analyse" },
    { key: "equipes", label: sport === "tennis" ? "Joueurs & Stats" : sport === "nba" ? "Stats NBA" : sport === "mlb" ? "Stats MLB" : "Equipes & Stats" },
    { key: "cotes", label: "Cotes" },
  ];
}

export default function AIScanMatchDetailPanel({ am, home, away, onClose, inline }: Props) {
  const [tab, setTab] = useState<Tab>("analyse");
  const isTennis = am.sport === "tennis";
  const isNBA = am.sport === "nba";
  const isMLB = am.sport === "mlb";
  const isRugby = am.sport === "rugby";
  const tabs = getTabs(am.sport ?? "football");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const dateStr = am.date
    ? new Date(am.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <>
      {!inline && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}
      <div className={inline
        ? "w-full h-full bg-white border-l border-[#e3e6eb] flex flex-col shadow-xl"
        : "fixed right-0 top-0 h-full w-full max-w-2xl bg-white border-l border-slate-200 z-50 flex flex-col shadow-2xl"
      }>

        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{home} vs {away}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {am.league} &bull; {dateStr}
              {am.venue && <span className="text-slate-400"> &bull; {am.venue}</span>}
              {isTennis && am.surface && <span className="text-slate-400"> &bull; {am.surface}</span>}
              {isTennis && am.round && <span className="text-slate-400"> &bull; {am.round}</span>}
              {isMLB && <span className="text-slate-400"> &bull; Baseball</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 mt-1">
            <X size={20} />
          </button>
        </div>

        {/* Tabs — top */}
        <div className="shrink-0 bg-white px-5 flex gap-1 pt-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap border-b-2 ${
                tab === key
                  ? "text-blue-600 border-blue-500 bg-blue-50/60"
                  : "text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="shrink-0 h-px bg-slate-200 mx-0" />

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === "analyse" && (
            <>
              {am.model_prob_home != null && <PredictionSection am={am} home={home} away={away} />}
              {isTennis ? (
                <TennisAnalyseTab am={am} home={home} away={away} />
              ) : isNBA ? (
                <NBAnalyseTab am={am} home={home} away={away} />
              ) : isMLB ? (
                <MLBAnalyseTab am={am} home={home} away={away} />
              ) : isRugby ? (
                <RugbyAnalyseTab am={am} home={home} away={away} />
              ) : (
                <IADataTab am={am} home={home} away={away} />
              )}
              {!isNBA && !isMLB && !isRugby && <IAConseilTab am={am} home={home} away={away} />}
            </>
          )}
          {tab === "equipes" && (
            <>
              {isTennis ? (
                <TennisStatsTab am={am} home={home} away={away} />
              ) : isNBA ? (
                <NBAStatsTab am={am} home={home} away={away} />
              ) : isMLB ? (
                <MLBStatsTab am={am} home={home} away={away} />
              ) : isRugby ? (
                <RugbyStatsTab am={am} home={home} away={away} />
              ) : (
                <>
                  <FormSection am={am} home={home} away={away} />
                  {((am.form_home_detail && am.form_home_detail.length > 0) || (am.form_away_detail && am.form_away_detail.length > 0)) && (
                    <RecentMatchesSection am={am} home={home} away={away} />
                  )}
                  <H2HSection am={am} home={home} away={away} />
                  <CompoTab am={am} home={home} away={away} />
                </>
              )}
            </>
          )}
          {tab === "cotes" && <CotesTab am={am} />}
        </div>
      </div>
    </>
  );
}

// ─── Prediction Section ───────────────────────────────────────────────────────

function PredictionSection({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
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

  const bestEdgeEntry = Object.entries(am.edges ?? {}).sort((a, b) => b[1] - a[1])[0];
  const bestEdgeKey = bestEdgeEntry?.[0];
  const bestEdge = bestEdgeEntry?.[1] ?? 0;

  const oddForEdge = (() => {
    const o = am.odds as Record<string, Record<string, unknown>>;
    const marketKey = isBinary ? "winner" : "1x2";
    const market = o?.[marketKey];
    if (!market || !bestEdgeKey) return null;
    const entry = market[bestEdgeKey];
    if (!entry) return null;
    if (typeof entry === "number") return entry;
    if (typeof entry === "object" && !Array.isArray(entry)) {
      const vals = Object.values(entry as Record<string, number>).map(Number).filter(Boolean);
      return vals.length ? Math.max(...vals) : null;
    }
    return null;
  })();

  // Data score display: /18 for tennis, /20 for football, /6 for NBA/MLB, /7 for rugby
  const maxPts = isTennis ? 18 : (am.sport === "nba" || am.sport === "mlb") ? 6 : am.sport === "rugby" ? 7 : 20;

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
      <div className="flex items-center gap-6">
        <div className="w-28 h-28 shrink-0">
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
            {bestEdge > 0 && (
              <p className="text-sm text-slate-500">
                Value bet :{" "}
                <span className={`font-semibold ${
                  bestEdgeKey === "H" || bestEdgeKey === "P1" || bestEdgeKey === "Home" ? "text-blue-600" :
                  bestEdgeKey === "D" ? "text-amber-600" : "text-red-600"
                }`}>
                  {isTennis
                    ? (bestEdgeKey === "P1" ? home.split(" ").pop() : away.split(" ").pop())
                    : (am.sport === "nba" || am.sport === "mlb")
                      ? (bestEdgeKey === "Home" ? "DOM" : "EXT")
                      : (bestEdgeKey === "H" ? "DOM" : bestEdgeKey === "D" ? "NUL" : "EXT")}
                </span>
                <span className="text-emerald-600 ml-2 font-medium">+{(bestEdge * 100).toFixed(1)}% edge</span>
                {oddForEdge && <span className="text-amber-600 ml-2">@ {oddForEdge.toFixed(2)}</span>}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProbBar({ label, prob, color, edge }: { label: string; prob: number; color: string; edge: number | null }) {
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

// ─── Form Section ─────────────────────────────────────────────────────────────

function FormSection({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const form_h = am.form_home ?? "";
  const form_a = am.form_away ?? "";

  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "Classement", hv: am.position_home != null ? `${am.position_home}e` : null, av: am.position_away != null ? `${am.position_away}e` : null, lowerBetter: true },
    { label: "Buts marques (saison)", hv: am.home_goals_scored != null ? String(am.home_goals_scored) : null, av: am.away_goals_scored != null ? String(am.away_goals_scored) : null },
    { label: "Buts encaisses (saison)", hv: am.home_goals_conceded != null ? String(am.home_goals_conceded) : null, av: am.away_goals_conceded != null ? String(am.away_goals_conceded) : null, lowerBetter: true },
    { label: "Buts marques/match", hv: am.home_goals_scored_avg5 != null ? am.home_goals_scored_avg5.toFixed(2) : null, av: am.away_goals_scored_avg5 != null ? am.away_goals_scored_avg5.toFixed(2) : null },
    { label: "Buts encaisses/match", hv: am.home_goals_conceded_avg5 != null ? am.home_goals_conceded_avg5.toFixed(2) : null, av: am.away_goals_conceded_avg5 != null ? am.away_goals_conceded_avg5.toFixed(2) : null, lowerBetter: true },
    { label: "Buts attendus (xG)", hv: am.home_xg_avg != null ? am.home_xg_avg.toFixed(2) : null, av: am.away_xg_avg != null ? am.away_xg_avg.toFixed(2) : null },
    { label: "Possession balle %", hv: am.home_possession_avg != null ? `${am.home_possession_avg}%` : null, av: am.away_possession_avg != null ? `${am.away_possession_avg}%` : null },
    { label: "Tirs par match", hv: am.home_shots_pg != null ? am.home_shots_pg.toFixed(1) : null, av: am.away_shots_pg != null ? am.away_shots_pg.toFixed(1) : null },
    { label: "Corners par match", hv: am.home_corners_avg != null ? am.home_corners_avg.toFixed(1) : null, av: am.away_corners_avg != null ? am.away_corners_avg.toFixed(1) : null },
    { label: "Cartons jaunes / match", hv: am.home_cards_avg != null ? am.home_cards_avg.toFixed(1) : null, av: am.away_cards_avg != null ? am.away_cards_avg.toFixed(1) : null, lowerBetter: true },
    { label: "Cartons rouges / match", hv: am.home_red_cards_pg != null ? am.home_red_cards_pg.toFixed(2) : null, av: am.away_red_cards_pg != null ? am.away_red_cards_pg.toFixed(2) : null, lowerBetter: true },
    { label: "Les 2 equipes marquent %", hv: am.home_btts_pct != null ? `${am.home_btts_pct}%` : null, av: am.away_btts_pct != null ? `${am.away_btts_pct}%` : null },
    { label: "Plus de 2.5 buts %", hv: am.home_over25_pct != null ? `${am.home_over25_pct}%` : null, av: am.away_over25_pct != null ? `${am.away_over25_pct}%` : null },
    { label: "Matchs sans encaisser", hv: am.home_clean_sheets != null ? `${am.home_clean_sheets}/5` : null, av: am.away_clean_sheets != null ? `${am.away_clean_sheets}/5` : null },
    { label: "Serie en cours", hv: am.home_current_streak ?? null, av: am.away_current_streak ?? null },
    { label: "Jours de repos", hv: am.home_rest_days != null ? `${am.home_rest_days}j` : null, av: am.away_rest_days != null ? `${am.away_rest_days}j` : null },
    { label: "Meilleur buteur", hv: am.home_top_scorer ?? null, av: am.away_top_scorer ?? null },
  ].filter((r) => r.hv != null || r.av != null);

  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={15} className="text-emerald-500" />
        <h4 className="text-slate-900 font-semibold text-sm">Forme des equipes</h4>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
        {/* Headers */}
        <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
        <div className="text-center text-slate-400 text-xs">VS</div>
        <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>

        {/* Form bubbles */}
        <div className="flex justify-end gap-0.5">
          {(form_h || "").split("").slice(0, 5).map((c, i) => (
            <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
              c === "V" || c === "W" ? "bg-emerald-500" : c === "N" || c === "D" ? "bg-amber-400" : "bg-red-500"
            }`}>{c === "W" ? "V" : c === "L" ? "D" : c}</span>
          ))}
        </div>
        <div className="text-center text-slate-400 text-[10px] self-center">5 derniers</div>
        <div className="flex gap-0.5">
          {(form_a || "").split("").slice(0, 5).map((c, i) => (
            <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
              c === "V" || c === "W" ? "bg-emerald-500" : c === "N" || c === "D" ? "bg-amber-400" : "bg-red-500"
            }`}>{c === "W" ? "V" : c === "L" ? "D" : c}</span>
          ))}
        </div>

        {/* Forme domicile / extérieur */}
        {(am.form_home_home || am.form_away_away) && (
          <>
            <div className="flex justify-end gap-0.5">
              {(am.form_home_home || "").split("").slice(0, 5).map((c, i) => (
                <span key={i} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${
                  c === "V" || c === "W" ? "bg-emerald-400" : c === "N" || c === "D" ? "bg-amber-300" : "bg-red-400"
                }`}>{c === "W" ? "V" : c === "L" ? "D" : c}</span>
              ))}
            </div>
            <div className="text-center text-slate-400 text-[10px] self-center">Dom / Ext</div>
            <div className="flex gap-0.5">
              {(am.form_away_away || "").split("").slice(0, 5).map((c, i) => (
                <span key={i} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${
                  c === "V" || c === "W" ? "bg-emerald-400" : c === "N" || c === "D" ? "bg-amber-300" : "bg-red-400"
                }`}>{c === "W" ? "V" : c === "L" ? "D" : c}</span>
              ))}
            </div>
          </>
        )}

        {/* Stats rows */}
        {rows.map(({ label, hv, av, lowerBetter }) => {
          const hNum = parseFloat(hv ?? "");
          const aNum = parseFloat(av ?? "");
          const canCompare = !isNaN(hNum) && !isNaN(aNum) && hNum !== aNum;
          const homeBetter = canCompare ? (lowerBetter ? hNum < aNum : hNum > aNum) : undefined;
          return (
            <FormRow key={label} label={label} homeVal={hv ?? "-"} awayVal={av ?? "-"} homeBetter={homeBetter} />
          );
        })}
      </div>
    </div>
  );
}

function FormRow({ label, homeVal, awayVal, homeBetter }: { label: string; homeVal: string; awayVal: string; homeBetter?: boolean }) {
  return (
    <>
      <div className={`text-right text-xs py-0.5 ${homeBetter === true ? "text-emerald-600 font-semibold" : homeBetter === false ? "text-slate-400" : "text-slate-700"}`}>
        {homeVal}
      </div>
      <div className="text-center text-slate-400 text-[10px] py-0.5">{label}</div>
      <div className={`text-left text-xs py-0.5 ${homeBetter === false ? "text-emerald-600 font-semibold" : homeBetter === true ? "text-slate-400" : "text-slate-700"}`}>
        {awayVal}
      </div>
    </>
  );
}

// ─── Recent Matches ───────────────────────────────────────────────────────────

function RecentMatchesSection({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
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

// ─── H2H Section ─────────────────────────────────────────────────────────────

function H2HSection({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const details = am.h2h_details ?? [];
  const hasDetails = details.length > 0;
  const summary = am.h2h_summary;
  const avgGoals = am.h2h_avg_goals;

  if (!hasDetails && !summary) return null;

  const homeWins = details.filter((m) => {
    const homeIsHome = m.home_name?.toLowerCase().includes(home.split(" ")[0].toLowerCase());
    return homeIsHome ? m.score_h != null && m.score_a != null && m.score_h > m.score_a
      : m.score_h != null && m.score_a != null && m.score_a > m.score_h;
  }).length;
  const draws = details.filter((m) => m.score_h != null && m.score_a != null && m.score_h === m.score_a).length;
  const awayWins = details.length - homeWins - draws;

  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={15} className="text-amber-500" />
        <h4 className="text-slate-900 font-semibold text-sm">Confrontations directes</h4>
        {hasDetails && <span className="text-xs text-slate-400">({details.length} matchs)</span>}
      </div>

      {hasDetails && details.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-blue-600 font-medium w-16 text-right">{home.split(" ")[0]} {homeWins}</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden flex">
              {homeWins > 0 && <div className="bg-blue-500 h-full" style={{ width: `${homeWins / details.length * 100}%` }} />}
              {draws > 0 && <div className="bg-amber-400 h-full" style={{ width: `${draws / details.length * 100}%` }} />}
              {awayWins > 0 && <div className="bg-red-500 h-full" style={{ width: `${awayWins / details.length * 100}%` }} />}
            </div>
            <span className="text-xs text-red-600 font-medium w-16">{awayWins} {away.split(" ")[0]}</span>
          </div>
          {avgGoals != null && (
            <p className="text-xs text-slate-400 mb-3">{draws} nul{draws !== 1 ? "s" : ""} &bull; {avgGoals.toFixed(1)} buts/match en moy.</p>
          )}

          {/* Match list */}
          <div className="space-y-0.5">
            {details.slice(0, 8).map((m, i) => (
              <div key={i} className="flex items-center text-[11px] gap-2 py-1 border-b border-slate-100 last:border-0">
                <span className="text-slate-400 w-20 shrink-0">{m.date ? m.date.slice(0, 10) : ""}</span>
                <span className="flex-1 text-right text-slate-700 truncate">{m.home_name}</span>
                <span className="text-slate-900 font-bold w-12 text-center shrink-0">
                  {m.score_h != null ? `${m.score_h} - ${m.score_a}` : "-"}
                </span>
                <span className="flex-1 text-slate-700 truncate">{m.away_name}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!hasDetails && summary && (
        <p className="text-sm text-slate-600">{summary}</p>
      )}
    </div>
  );
}

// ─── IA Data Tab ──────────────────────────────────────────────────────────────

function IADataTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const edges = am.edges ?? {};
  const edgeData = Object.entries(edges)
    .map(([k, v]) => ({
      name: k === "H" ? `DOM (${home.split(" ")[0]})` : k === "D" ? "Nul" : k === "A" ? `EXT (${away.split(" ")[0]})` : k,
      value: parseFloat((v * 100).toFixed(2)),
      fill: v > 0 ? "#10b981" : "#ef4444",
    }))
    .filter((d) => Math.abs(d.value) > 0.01);

  return (
    <div className="space-y-4">
      {/* Poisson */}
      {am.lambda_home != null && am.lambda_away != null && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
            <Zap size={11} className="text-purple-500" />
            <Tip text="Distribution de Poisson utilisée pour calculer les probabilités de buts attendus par équipe.">
              Notre modèle (Poisson) <span className="text-slate-400 underline decoration-dotted">ⓘ</span>
            </Tip>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-blue-700">
                <Tip text="Nombre de buts prédit par le modèle pour cette équipe. Plus λ est élevé, plus l'équipe est attendue offensive.">
                  λ {am.lambda_home}
                </Tip>
              </div>
              <div className="text-xs text-blue-500 mt-0.5">Buts attendus {home.split(" ")[0]}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-red-700">
                <Tip text="Nombre de buts prédit par le modèle pour cette équipe. Plus λ est élevé, plus l'équipe est attendue offensive.">
                  λ {am.lambda_away}
                </Tip>
              </div>
              <div className="text-xs text-red-500 mt-0.5">Buts attendus {away.split(" ")[0]}</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Distribution de Poisson : P(X buts) = e^(-&lambda;) &times; &lambda;^X / X!
          </p>
        </div>
      )}

      {/* Edge breakdown */}
      {edgeData.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2">
            <Tip text="Différence entre la probabilité de notre modèle et celle implicite dans la cote du bookmaker. Positif = notre modèle pense que l'issue est sous-cotée.">
              Avantage modèle vs bookmakers <span className="text-slate-400 underline decoration-dotted">ⓘ</span>
            </Tip>
          </div>
          <div className="h-28">
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
          <div className="flex gap-4 text-[10px] text-slate-400 mt-1">
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Value (modele &gt; marche)</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Cote trop basse</span>
          </div>
        </div>
      )}

      {/* Data quality */}
      {am.data_quality && (
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
              {am.data_score != null && <span className="text-slate-400 ml-1">({Math.round(am.data_score * 20)}/20 points)</span>}
            </span>
          </div>
        </div>
      )}

      {/* Context */}
      {am.context && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Contexte</div>
          <p className="text-xs text-slate-600 leading-relaxed">{am.context}</p>
        </div>
      )}

      {/* Motivation */}
      {am.motivation && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Enjeu du match</div>
          <p className="text-xs text-slate-600 leading-relaxed">{am.motivation}</p>
        </div>
      )}

      {/* Referee & Weather */}
      {(am.referee || am.weather) && (
        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
          {am.referee && (
            <span>Arbitre : <span className="text-slate-700 font-medium">{am.referee}</span></span>
          )}
          {am.weather && (
            <span>Meteo : <span className="text-slate-700 font-medium">{am.weather}</span></span>
          )}
        </div>
      )}

      {/* Absences */}
      {((am.key_absences_home?.length ?? 0) > 0 || (am.key_absences_away?.length ?? 0) > 0) && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2">Absences cles</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: home, list: am.key_absences_home, keyPlayers: am.key_players_home },
              { label: away, list: am.key_absences_away, keyPlayers: am.key_players_away },
            ].map(({ label, list, keyPlayers }) => {
              const posImpact: Record<string, string> = { Goalkeeper: "-10% GK", Attacker: "-7% ATT", Midfielder: "-5% MIL", Defender: "-3% DEF" };
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
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tennis Analyse Tab ──────────────────────────────────────────────────────

function TennisAnalyseTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const edges = am.edges ?? {};
  const edgeData = Object.entries(edges)
    .map(([k, v]) => ({
      name: k === "P1" ? home.split(" ").pop() ?? "P1" : k === "P2" ? away.split(" ").pop() ?? "P2" : k,
      value: parseFloat((v * 100).toFixed(2)),
      fill: v > 0 ? "#10b981" : "#ef4444",
    }))
    .filter((d) => Math.abs(d.value) > 0.01);

  const maxPts = 18;

  return (
    <div className="space-y-4">
      {/* ML model badge */}
      {am.tennis_ml_used && (
        <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
          <span className="text-xs text-violet-700 font-medium">Modele ML actif (XGBoost + LightGBM, 60 features)</span>
        </div>
      )}
      {/* Rankings comparison */}
      {(am.ranking_p1 != null || am.ranking_p2 != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1">
            <Trophy size={11} className="text-amber-500" />
            Classement ATP/WTA
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">#{am.ranking_p1 ?? "?"}</div>
              <div className="text-xs text-blue-500 mt-0.5 truncate">{home}</div>
              {am.p1_age && <div className="text-[10px] text-slate-400">{am.p1_age} ans</div>}
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-700">#{am.ranking_p2 ?? "?"}</div>
              <div className="text-xs text-red-500 mt-0.5 truncate">{away}</div>
              {am.p2_age && <div className="text-[10px] text-slate-400">{am.p2_age} ans</div>}
            </div>
          </div>
        </div>
      )}

      {/* Surface analysis */}
      {am.surface && (am.p1_surface_record || am.p2_surface_record) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1">
            <Zap size={11} className="text-purple-500" />
            <Tip text={`Performance des joueurs sur ${am.surface}. Un bon bilan sur la surface est crucial en tennis.`}>
              Performance sur {am.surface} <span className="text-slate-400 underline decoration-dotted">i</span>
            </Tip>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ name: home, record: am.p1_surface_record, color: "blue" }, { name: away, record: am.p2_surface_record, color: "red" }].map(({ name, record, color }) => {
              const parsed = record?.match(/(\d+)\s*[-/]\s*(\d+)/);
              const wins = parsed ? parseInt(parsed[1]) : 0;
              const losses = parsed ? parseInt(parsed[2]) : 0;
              const total = wins + losses;
              const pct = total > 0 ? (wins / total * 100).toFixed(0) : null;
              return (
                <div key={name} className={`bg-${color === "blue" ? "blue" : "red"}-50 border border-${color === "blue" ? "blue" : "red"}-100 rounded-lg p-3`}>
                  <div className="text-xs font-medium text-slate-700 truncate mb-1">{name}</div>
                  <div className="text-lg font-bold text-slate-800">{record ?? "-"}</div>
                  {pct && <div className={`text-[10px] ${parseInt(pct) >= 60 ? "text-emerald-600" : parseInt(pct) >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}% de victoires</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Serve & Return */}
      {(am.p1_serve_pct != null || am.p2_serve_pct != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1">
            <Target size={11} className="text-blue-500" />
            <Tip text="% de points gagnes au service et en retour. Un bon serveur domine avec un haut % au service. Un bon retourneur excelle en retour.">
              Service & Retour <span className="text-slate-400 underline decoration-dotted">i</span>
            </Tip>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home.split(" ").pop()}</div>
            <div className="text-center text-slate-400 text-xs">VS</div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away.split(" ").pop()}</div>

            {am.p1_serve_pct != null && am.p2_serve_pct != null && (
              <FormRow label="Service %" homeVal={`${am.p1_serve_pct}%`} awayVal={`${am.p2_serve_pct}%`} homeBetter={am.p1_serve_pct > am.p2_serve_pct ? true : am.p1_serve_pct < am.p2_serve_pct ? false : undefined} />
            )}
            {am.p1_return_pct != null && am.p2_return_pct != null && (
              <FormRow label="Retour %" homeVal={`${am.p1_return_pct}%`} awayVal={`${am.p2_return_pct}%`} homeBetter={am.p1_return_pct > am.p2_return_pct ? true : am.p1_return_pct < am.p2_return_pct ? false : undefined} />
            )}
            {am.p1_aces_avg != null && am.p2_aces_avg != null && (
              <FormRow label="Aces/match" homeVal={am.p1_aces_avg.toFixed(1)} awayVal={am.p2_aces_avg.toFixed(1)} homeBetter={am.p1_aces_avg > am.p2_aces_avg ? true : am.p1_aces_avg < am.p2_aces_avg ? false : undefined} />
            )}
          </div>
        </div>
      )}

      {/* Edge breakdown */}
      {edgeData.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2">
            <Tip text="Difference entre la probabilite de notre modele et celle implicite dans la cote du bookmaker.">
              Avantage modele vs bookmakers <span className="text-slate-400 underline decoration-dotted">i</span>
            </Tip>
          </div>
          <div className="h-20">
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
        </div>
      )}

      {/* Data quality */}
      {am.data_quality && (
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
      )}

      {/* Context */}
      {am.context && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Contexte</div>
          <p className="text-xs text-slate-600 leading-relaxed">{am.context}</p>
        </div>
      )}

      {/* Motivation */}
      {am.motivation && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Enjeu du match</div>
          <p className="text-xs text-slate-600 leading-relaxed">{am.motivation}</p>
        </div>
      )}

      {/* Weather */}
      {am.weather && (
        <div className="text-[11px] text-slate-500">
          <span>Meteo : <span className="text-slate-700 font-medium">{am.weather}</span></span>
        </div>
      )}
    </div>
  );
}

// ─── Tennis Stats Tab (Joueurs & Stats) ──────────────────────────────────────

function TennisStatsTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const form_h = am.form_home ?? "";
  const form_a = am.form_away ?? "";

  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "Classement", hv: am.ranking_p1 != null ? `#${am.ranking_p1}` : null, av: am.ranking_p2 != null ? `#${am.ranking_p2}` : null, lowerBetter: true },
    { label: "Age", hv: am.p1_age != null ? `${am.p1_age} ans` : null, av: am.p2_age != null ? `${am.p2_age} ans` : null },
    { label: "Bilan saison", hv: am.p1_season_record, av: am.p2_season_record },
    { label: `Bilan ${am.surface ?? "surface"}`, hv: am.p1_surface_record, av: am.p2_surface_record },
    { label: "Service %", hv: am.p1_serve_pct != null ? `${am.p1_serve_pct}%` : null, av: am.p2_serve_pct != null ? `${am.p2_serve_pct}%` : null },
    { label: "Retour %", hv: am.p1_return_pct != null ? `${am.p1_return_pct}%` : null, av: am.p2_return_pct != null ? `${am.p2_return_pct}%` : null },
    { label: "Aces/match", hv: am.p1_aces_avg != null ? am.p1_aces_avg.toFixed(1) : null, av: am.p2_aces_avg != null ? am.p2_aces_avg.toFixed(1) : null },
    { label: "Jours de repos", hv: am.p1_rest_days != null ? `${am.p1_rest_days}j` : null, av: am.p2_rest_days != null ? `${am.p2_rest_days}j` : null },
  ].filter((r) => r.hv != null || r.av != null);

  return (
    <div className="space-y-4">
      {/* Form & stats comparison */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-emerald-500" />
          <h4 className="text-slate-900 font-semibold text-sm">Comparaison des joueurs</h4>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
          <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
          <div className="text-center text-slate-400 text-xs">VS</div>
          <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>

          {/* Form bubbles */}
          {(form_h || form_a) && (
            <>
              <div className="flex justify-end gap-0.5">
                {(form_h || "").split("").slice(0, 5).map((c, i) => (
                  <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                    c === "V" || c === "W" ? "bg-emerald-500" : c === "N" || c === "D" ? "bg-amber-400" : "bg-red-500"
                  }`}>{c === "W" ? "V" : c === "L" ? "D" : c}</span>
                ))}
              </div>
              <div className="text-center text-slate-400 text-[10px] self-center">5 derniers</div>
              <div className="flex gap-0.5">
                {(form_a || "").split("").slice(0, 5).map((c, i) => (
                  <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                    c === "V" || c === "W" ? "bg-emerald-500" : c === "N" || c === "D" ? "bg-amber-400" : "bg-red-500"
                  }`}>{c === "W" ? "V" : c === "L" ? "D" : c}</span>
                ))}
              </div>
            </>
          )}

          {rows.map(({ label, hv, av, lowerBetter }) => {
            const hNum = parseFloat(hv?.replace(/[^0-9.-]/g, "") ?? "");
            const aNum = parseFloat(av?.replace(/[^0-9.-]/g, "") ?? "");
            const canCompare = !isNaN(hNum) && !isNaN(aNum) && hNum !== aNum;
            const homeBetter = canCompare ? (lowerBetter ? hNum < aNum : hNum > aNum) : undefined;
            return <FormRow key={label} label={label} homeVal={hv ?? "-"} awayVal={av ?? "-"} homeBetter={homeBetter} />;
          })}
        </div>
      </div>

      {/* Historical serve stats (Tennis Abstract) */}
      {(am.p1_serve_stats || am.p2_serve_stats) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-violet-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Stats de service (moy. 5 derniers matchs)</h4>
            <span className="ml-auto text-[10px] text-slate-400">Tennis Abstract</span>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs"></div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {[
              { key: "1st_serve_in", label: "1re balle %", pct: true },
              { key: "1st_serve_won", label: "1re balle gagnee %", pct: true },
              { key: "2nd_serve_won", label: "2e balle gagnee %", pct: true },
              { key: "bp_save", label: "Balle de break sauvee", pct: true },
              { key: "ace_rate", label: "Aces / point servi", pct: true, lowerBetter: false },
              { key: "df_rate", label: "Double fautes / point", pct: true, lowerBetter: true },
            ].map(({ key, label, pct, lowerBetter }) => {
              const v1 = am.p1_serve_stats?.[key];
              const v2 = am.p2_serve_stats?.[key];
              if (v1 == null && v2 == null) return null;
              const fmt = (v: number | undefined) => v != null ? (pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(2)) : "-";
              const homeBetter = v1 != null && v2 != null
                ? (lowerBetter === true ? v1 < v2 : v1 > v2)
                : undefined;
              return <FormRow key={key} label={label} homeVal={fmt(v1)} awayVal={fmt(v2)} homeBetter={homeBetter} />;
            })}
          </div>
        </div>
      )}

      {/* Recent matches */}
      {((am.form_home_detail && am.form_home_detail.length > 0) || (am.form_away_detail && am.form_away_detail.length > 0)) && (
        <RecentMatchesSection am={am} home={home} away={away} />
      )}

      {/* H2H */}
      {(am.h2h_summary || (am.h2h_last3 && am.h2h_last3.length > 0)) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-amber-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Confrontations directes</h4>
          </div>
          {am.h2h_summary && <p className="text-xs text-slate-600 mb-2">{am.h2h_summary}</p>}
          {am.h2h_surface && (
            <p className="text-xs text-slate-500 mb-2">
              Sur {am.surface ?? "cette surface"} : <span className="font-medium text-slate-700">{am.h2h_surface}</span>
            </p>
          )}
          {am.h2h_last3 && am.h2h_last3.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 mb-1 font-medium">3 derniers matchs :</div>
              <div className="space-y-0.5">
                {am.h2h_last3.map((m, i) => (
                  <div key={i} className="text-[11px] text-slate-600 py-0.5">{m}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Absences / injuries */}
      {((am.key_absences_home?.length ?? 0) > 0 || (am.key_absences_away?.length ?? 0) > 0) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-xs font-semibold text-slate-600 mb-2">Blessures / Absences</div>
          <div className="grid grid-cols-2 gap-3">
            {[{ label: home, list: am.key_absences_home }, { label: away, list: am.key_absences_away }].map(({ label, list }) => (
              <div key={label}>
                <div className="text-[10px] text-slate-500 mb-1 font-medium truncate">{label}</div>
                {list && list.length > 0 ? list.map((ab, i) => (
                  <div key={i} className="flex items-start gap-1 text-[11px] text-red-600 mb-0.5">
                    <span className="text-red-400 shrink-0 mt-0.5">-</span>
                    <span>{ab}</span>
                  </div>
                )) : <span className="text-[11px] text-slate-300">Aucune absence</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cotes Tab ────────────────────────────────────────────────────────────────

// Markets displayed as horizontal cards (≤3 outcomes)
const CARD_MARKETS = new Set(["1x2", "btts", "double_chance", "draw_no_bet", "winner"]);

function CotesTab({ am }: { am: AIScanMatch }) {
  const odds = am.odds as Record<string, Record<string, unknown>>;
  const [selectedBk, setSelectedBk] = useState<Record<string, string>>({});

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
            "asian_handicap": "Handicap asiatique",
          };

  const orderedMarkets = [
    ...MARKET_ORDER.filter((m) => odds[m]),
    ...Object.keys(odds).filter((m) => !MARKET_ORDER.includes(m)),
  ];

  // Model probs for main market probability bar
  const modelProbs: Record<string, number> = isTennis
    ? { P1: am.model_prob_home ?? 0, P2: am.model_prob_away ?? 0 }
    : (isNBAOdds || isMLBOdds)
      ? { Home: am.model_prob_home ?? 0, Away: am.model_prob_away ?? 0 }
      : { H: am.model_prob_home ?? 0, D: am.model_prob_draw ?? 0, A: am.model_prob_away ?? 0 };
  const maxProb = Math.max(...Object.values(modelProbs));
  const mainMarket = isTennis || isNBAOdds || isMLBOdds ? "winner" : "1x2";

  // Model info for alternative markets (BTTS, Over 2.5)
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

  function buildBkOptions(val: unknown): { bk: string; odd: number }[] {
    if (typeof val === "number") return [{ bk: "Modèle IA", odd: val }];
    if (val && typeof val === "object") {
      return Object.entries(val as Record<string, number>)
        .map(([bk, odd]) => ({ bk, odd: Number(odd) }))
        .filter(({ odd }) => odd > 0)
        .sort((a, b) => b.odd - a.odd);
    }
    return [];
  }

  return (
    <div className="space-y-6">
      {orderedMarkets.map((market) => {
        const outcomes = odds[market];
        if (!outcomes || typeof outcomes !== "object") return null;
        const entries = Object.entries(outcomes);
        const isCard = CARD_MARKETS.has(market) && entries.length <= 3;

        return (
          <div key={market}>
            {/* Market label with line */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                {MARKET_LABELS[market] ?? market.replace(/_/g, " ")}
              </span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            {isCard ? (
              /* ── Horizontal cards (style épuré) ── */
              <div className={`grid gap-2 ${entries.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {entries.map(([outcome, val]) => {
                  const bkOptions = buildBkOptions(val);
                  if (bkOptions.length === 0) return null;
                  const bestBk = bkOptions[0];
                  const key = `${market}__${outcome}`;
                  const currentBk = selectedBk[key] ?? bestBk.bk;
                  const currentOdd = bkOptions.find((b) => b.bk === currentBk)?.odd ?? bestBk.odd;
                  const prob = market === mainMarket ? (modelProbs[outcome] ?? 0) : 0;
                  const isFav = market === mainMarket && prob === maxProb && maxProb > 0;
                  const altModel = getAltModelInfo(market, outcome);
                  const hasAltModel = altModel.prob !== null;
                  const hasValueEdge = altModel.edge !== null && altModel.edge > 0;

                  return (
                    <div key={outcome} className={`flex flex-col rounded-xl overflow-hidden border-2 bg-white shadow-sm ${isFav ? "border-emerald-300" : hasValueEdge ? "border-amber-300" : "border-slate-100"}`}>
                      {/* Prob bar top */}
                      {market === mainMarket && prob > 0 && (
                        <div className={`h-1 w-full ${isFav ? "bg-emerald-400" : "bg-slate-200"}`} />
                      )}
                      {hasAltModel && (
                        <div className={`h-1 w-full ${hasValueEdge ? "bg-amber-400" : "bg-slate-200"}`}
                          style={{ width: `${(altModel.prob! * 100).toFixed(0)}%` }} />
                      )}
                      {/* Card body */}
                      <div className="flex flex-col items-center px-2 pt-2.5 pb-2 gap-1">
                        <span className="text-[10px] font-medium text-slate-500 text-center leading-tight w-full truncate text-center uppercase tracking-wide">
                          {outcome}
                        </span>
                        <span className={`text-2xl font-bold tabular-nums ${isFav ? "text-emerald-600" : "text-slate-800"}`}>
                          {currentOdd.toFixed(2)}
                        </span>
                        {market === mainMarket && prob > 0 && (
                          <span className={`text-[9px] font-medium ${isFav ? "text-emerald-500" : "text-slate-400"}`}>
                            {(prob * 100).toFixed(0)}%
                          </span>
                        )}
                        {hasAltModel && (
                          <span className={`text-[9px] font-medium ${hasValueEdge ? "text-amber-600" : "text-slate-400"}`}>
                            modele {(altModel.prob! * 100).toFixed(1)}%
                            {altModel.edge !== null && altModel.edge > 0 && (
                              <span className="text-emerald-600 ml-1">+{(altModel.edge * 100).toFixed(1)}% edge</span>
                            )}
                          </span>
                        )}
                        {bkOptions.length > 1 ? (
                          <select
                            className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 rounded px-1 py-0.5 cursor-pointer focus:outline-none w-full text-center mt-0.5"
                            value={currentBk}
                            onChange={(e) => setSelectedBk((prev) => ({ ...prev, [key]: e.target.value }))}
                          >
                            {bkOptions.map(({ bk, odd }) => (
                              <option key={bk} value={bk}>{bk} : {odd.toFixed(2)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] text-slate-400 mt-0.5">{bestBk.bk}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Vertical list (O/U, goalscorer, handicap, etc.) ── */
              <div className="divide-y divide-slate-50 border border-slate-100 rounded-xl overflow-hidden">
                {entries.map(([outcome, val]) => {
                  const bkOptions = buildBkOptions(val);
                  if (bkOptions.length === 0) return null;
                  const bestBk = bkOptions[0];
                  const key = `${market}__${outcome}`;
                  const currentBk = selectedBk[key] ?? bestBk.bk;
                  const currentOdd = bkOptions.find((b) => b.bk === currentBk)?.odd ?? bestBk.odd;

                  const listAltModel = getAltModelInfo(market, outcome);
                  const listHasEdge = listAltModel.edge !== null && listAltModel.edge > 0;

                  return (
                    <div key={outcome} className={`flex items-center gap-3 bg-white px-3 py-2.5 hover:bg-slate-50 transition-colors ${listHasEdge ? "border-l-2 border-amber-400" : ""}`}>
                      <span className="flex-1 text-sm text-slate-600 truncate">{outcome}</span>
                      {listAltModel.prob !== null && (
                        <span className="text-[10px] text-slate-400">
                          {(listAltModel.prob * 100).toFixed(1)}%
                          {listHasEdge && <span className="text-emerald-600 ml-1 font-semibold">+{(listAltModel.edge! * 100).toFixed(1)}%</span>}
                        </span>
                      )}
                      <span className="text-base font-bold tabular-nums text-slate-900 min-w-[3rem] text-right">
                        {currentOdd.toFixed(2)}
                      </span>
                      {bkOptions.length > 1 ? (
                        <select
                          className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-blue-300 max-w-[110px]"
                          value={currentBk}
                          onChange={(e) => setSelectedBk((prev) => ({ ...prev, [key]: e.target.value }))}
                        >
                          {bkOptions.map(({ bk, odd }) => (
                            <option key={bk} value={bk}>{bk} : {odd.toFixed(2)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-slate-400 max-w-[110px] truncate">{bestBk.bk}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── IA Conseil Tab ───────────────────────────────────────────────────────────

function IAConseilTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
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

  // Best odd for best outcome
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

  // Main prediction
  if (bestProb > 0) {
    sentences.push({ text: `Notre modele donne ${(bestProb * 100).toFixed(1)}% de chance a ${bestLabel}.`, type: "primary" });
  }

  if (isTennis) {
    // Tennis-specific insights
    // Ranking context
    if (am.ranking_p1 != null && am.ranking_p2 != null) {
      const diff = Math.abs(am.ranking_p1 - am.ranking_p2);
      if (diff >= 20) {
        const better = am.ranking_p1 < am.ranking_p2 ? home : away;
        const betterRank = Math.min(am.ranking_p1, am.ranking_p2);
        const worseRank = Math.max(am.ranking_p1, am.ranking_p2);
        sentences.push({ text: `${better} est nettement mieux classe (${betterRank}e vs ${worseRank}e mondial).`, type: "info" });
      }
    }

    // Surface context
    if (am.surface && am.p1_surface_record && am.p2_surface_record) {
      sentences.push({ text: `Sur ${am.surface} : ${home} (${am.p1_surface_record}) vs ${away} (${am.p2_surface_record}).`, type: "info" });
    }

    // Serve/return context
    if (am.p1_serve_pct != null && am.p2_serve_pct != null) {
      const diff = am.p1_serve_pct - am.p2_serve_pct;
      if (Math.abs(diff) >= 3) {
        const betterServer = diff > 0 ? home : away;
        sentences.push({ text: `${betterServer} a un meilleur % au service (${diff > 0 ? am.p1_serve_pct : am.p2_serve_pct}% vs ${diff > 0 ? am.p2_serve_pct : am.p1_serve_pct}%).`, type: "info" });
      }
    }

    // Edge as secondary context
    if (edge !== null && Math.abs(edge) > 0.01 && bestOdd) {
      const bookProb = (1 / bestOdd * 100).toFixed(1);
      if (edge > 0) {
        sentences.push({
          text: `Le bookmaker donne ${bookProb}% a ${bestLabel} (cote ${bestOdd.toFixed(2)}). Notre modele estime ${(bestProb * 100).toFixed(1)}%. Difference : +${(edge * 100).toFixed(1)}%.`,
          type: "info",
        });
      }
    }

    // Form context
    if (am.form_home && am.form_away) {
      const winsH = (am.form_home.match(/[VW]/g) || []).length;
      const winsA = (am.form_away.match(/[VW]/g) || []).length;
      if (winsH !== winsA) {
        const better = winsH > winsA ? home : away;
        sentences.push({ text: `${better} est en meilleure forme recente (${Math.max(winsH, winsA)} victoires sur 5 contre ${Math.min(winsH, winsA)}).`, type: "info" });
      }
    }

    // H2H context
    if (am.h2h_summary) {
      sentences.push({ text: `H2H : ${am.h2h_summary}`, type: "info" });
    }

    // Rest days
    if (am.p1_rest_days != null && am.p2_rest_days != null && Math.abs(am.p1_rest_days - am.p2_rest_days) >= 2) {
      const tired = am.p1_rest_days < am.p2_rest_days ? home : away;
      const fresh = am.p1_rest_days < am.p2_rest_days ? away : home;
      sentences.push({ text: `${fresh} est plus repose (${Math.max(am.p1_rest_days, am.p2_rest_days)}j de repos vs ${Math.min(am.p1_rest_days, am.p2_rest_days)}j pour ${tired}).`, type: "secondary" });
    }

    // Season record
    if (am.p1_season_record && am.p2_season_record) {
      sentences.push({ text: `Bilan saison : ${home} (${am.p1_season_record}) vs ${away} (${am.p2_season_record}).`, type: "secondary" });
    }
  } else if (isNBA) {
    // NBA-specific insights
    // Win rate context
    if (am.home_win_rate_10 != null && am.away_win_rate_10 != null) {
      const diff = Math.abs(am.home_win_rate_10 - am.away_win_rate_10);
      if (diff >= 0.15) {
        const better = am.home_win_rate_10 > am.away_win_rate_10 ? home : away;
        const betterRate = Math.max(am.home_win_rate_10, am.away_win_rate_10);
        sentences.push({ text: `${better} est en meilleure forme (${(betterRate * 100).toFixed(0)}% de victoires sur les 10 derniers matchs).`, type: "info" });
      }
    }

    // Point differential
    if (am.home_pt_diff_10 != null && am.away_pt_diff_10 != null) {
      const diff = am.home_pt_diff_10 - am.away_pt_diff_10;
      if (Math.abs(diff) >= 5) {
        const better = diff > 0 ? home : away;
        const betterDiff = diff > 0 ? am.home_pt_diff_10 : am.away_pt_diff_10;
        sentences.push({ text: `${better} domine par le differentiel de points (${betterDiff > 0 ? "+" : ""}${betterDiff.toFixed(1)} pts/match sur 10j).`, type: "info" });
      }
    }

    // Scoring attack
    if (am.home_pts_avg_10 != null && am.away_pts_avg_10 != null) {
      const totalAvg = am.home_pts_avg_10 + am.away_pts_avg_10;
      sentences.push({ text: `Attaque : ${home} marque en moyenne ${am.home_pts_avg_10.toFixed(1)} pts, ${away} ${am.away_pts_avg_10.toFixed(1)} pts (total moyen attendu : ${totalAvg.toFixed(1)} pts).`, type: "secondary" });
    }

    // B2B fatigue
    if (am.home_b2b) {
      sentences.push({ text: `Attention : ${home} joue dos-a-dos (2e match en 2 nuits), ce qui peut affecter ses performances.`, type: "info" });
    }
    if (am.away_b2b) {
      sentences.push({ text: `Attention : ${away} joue dos-a-dos (2e match en 2 nuits), ce qui peut affecter ses performances.`, type: "info" });
    }

    // Streak context
    if (am.home_streak != null && Math.abs(am.home_streak) >= 3) {
      const type = am.home_streak > 0 ? "serie de victoires" : "serie de defaites";
      sentences.push({ text: `${home} est en ${type} (${Math.abs(am.home_streak)} matchs consecutifs).`, type: am.home_streak > 0 ? "secondary" : "info" });
    }
    if (am.away_streak != null && Math.abs(am.away_streak) >= 3) {
      const type = am.away_streak > 0 ? "serie de victoires" : "serie de defaites";
      sentences.push({ text: `${away} est en ${type} (${Math.abs(am.away_streak)} matchs consecutifs).`, type: am.away_streak > 0 ? "secondary" : "info" });
    }

    // Edge context
    if (edge !== null && Math.abs(edge) > 0.01 && bestOdd) {
      const bookProb = (1 / bestOdd * 100).toFixed(1);
      if (edge > 0) {
        sentences.push({
          text: `Le bookmaker donne ${bookProb}% a ${bestLabel} (cote ${bestOdd.toFixed(2)}). Notre modele estime ${(bestProb * 100).toFixed(1)}%. Difference : +${(edge * 100).toFixed(1)}%.`,
          type: "info",
        });
      }
    }

    // Over/under context
    if (am.total_line != null && am.home_pts_avg_10 != null && am.away_pts_avg_10 != null) {
      const avgTotal = am.home_pts_avg_10 + am.away_pts_avg_10;
      if (avgTotal > am.total_line + 5) {
        sentences.push({ text: `Les deux equipes marquent en moyenne ${avgTotal.toFixed(0)} pts cumulees, au-dessus de la ligne O/U (${am.total_line}).`, type: "secondary" });
      } else if (avgTotal < am.total_line - 5) {
        sentences.push({ text: `Les deux equipes marquent en moyenne ${avgTotal.toFixed(0)} pts cumulees, en dessous de la ligne O/U (${am.total_line}).`, type: "secondary" });
      }
    }
  } else {
    // Football-specific insights (unchanged)
    // Poisson context
    if (am.lambda_home != null && am.lambda_away != null) {
      sentences.push({
        text: `Le modele Poisson predit ${am.lambda_home} buts pour ${home.split(" ")[0]} et ${am.lambda_away} buts pour ${away.split(" ")[0]} (total attendu : ${(am.lambda_home + am.lambda_away).toFixed(1)} buts).`,
        type: "info",
      });
    }

    // Edge as secondary context
    if (edge !== null && Math.abs(edge) > 0.01 && bestOdd) {
      const bookProb = (1 / bestOdd * 100).toFixed(1);
      if (edge > 0) {
        sentences.push({
          text: `Le bookmaker donne ${bookProb}% a ${bestLabel} (cote ${bestOdd.toFixed(2)}). Notre modele estime ${(bestProb * 100).toFixed(1)}%. Difference : +${(edge * 100).toFixed(1)}%.`,
          type: "info",
        });
      }
    }

    // Form context
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

    // Position context
    if (am.position_home != null && am.position_away != null) {
      const diff = am.position_away - am.position_home;
      if (Math.abs(diff) >= 3) {
        const better = diff > 0 ? home.split(" ")[0] : away.split(" ")[0];
        sentences.push({ text: `${better} est mieux classe au classement (${diff > 0 ? am.position_home : am.position_away}e vs ${diff > 0 ? am.position_away : am.position_home}e).`, type: "info" });
      }
    }

    // Absences
    const absH = am.key_absences_home ?? [];
    const absA = am.key_absences_away ?? [];
    if (absH.length > 0) sentences.push({ text: `Attention : ${home.split(" ")[0]} est prive de ${absH.slice(0, 2).join(", ")}.`, type: "info" });
    if (absA.length > 0) sentences.push({ text: `Attention : ${away.split(" ")[0]} est prive de ${absA.slice(0, 2).join(", ")}.`, type: "info" });

    // Secondary bets from Poisson
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

    // Goalscorer — only if bookmaker odds available and implied prob > 35%
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

// ─── Compo Tab ────────────────────────────────────────────────────────────────

type KeyPlayer = { name: string; goals: number; assists: number; goals_per_match: number; rating: number; is_absent: boolean; position?: string };

function _normName(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function findKeyPlayer(lineupName: string, keyPlayers: KeyPlayer[]): KeyPlayer | undefined {
  const norm = _normName(lineupName);
  const parts = norm.split(/\s+/);
  const last = parts[parts.length - 1];
  return keyPlayers.find((kp) => {
    const kn = _normName(kp.name);
    if (kn === norm) return true;
    const kp_parts = kn.split(/\s+/);
    const kp_last = kp_parts[kp_parts.length - 1];
    if (kp_last === last) return true;
    // abbreviated: "A. Trezza" vs "Antonio Trezza"
    if (kp_last === last && kp_parts[0][0] === parts[0][0]) return true;
    return false;
  });
}

function PlayerRow({ name, pos, number, stats }: {
  name: string; pos: string; number: number | null;
  stats: KeyPlayer | null;
}) {
  const isAbsent = stats?.is_absent ?? false;
  const hasStats = stats && (stats.goals > 0 || stats.assists > 0 || stats.rating > 0);

  if (hasStats) {
    return (
      <div className={`px-2 py-1.5 rounded-lg border text-[11px] ${isAbsent ? "bg-red-50 border-red-100" : "bg-white border-slate-100"}`}>
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {number != null && <span className="text-slate-300 w-4 text-right text-[9px] shrink-0">{number}</span>}
            <span className="text-[9px] text-slate-400 w-6 shrink-0 uppercase">{pos}</span>
            <span className={`font-medium truncate ${isAbsent ? "text-red-700 line-through" : "text-slate-800"}`}>{name}</span>
          </div>
          {isAbsent && <span className="text-[9px] bg-red-500 text-white px-1 py-0.5 rounded font-bold shrink-0">ABSENT</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] pl-[26px]">
          {stats!.goals > 0 && <span className="text-emerald-600 font-semibold">{stats!.goals} buts</span>}
          {stats!.assists > 0 && <span className="text-blue-500">{stats!.assists} PD</span>}
          {stats!.rating > 0 && <span className="text-amber-500">★ {stats!.rating.toFixed(1)}</span>}
          {stats!.goals_per_match > 0 && <span className="text-slate-400">{stats!.goals_per_match.toFixed(2)}/m</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-[11px] py-[3px] ${isAbsent ? "text-red-400" : "text-slate-600"}`}>
      {number != null && <span className="text-slate-300 w-4 text-right text-[9px] shrink-0">{number}</span>}
      <span className="text-[9px] text-slate-400 w-6 shrink-0 uppercase">{pos}</span>
      <span className={isAbsent ? "line-through" : ""}>{name}</span>
      {isAbsent && <span className="text-[9px] bg-red-500 text-white px-1 py-0.5 rounded font-bold ml-1">ABSENT</span>}
    </div>
  );
}

function CompoTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const lineupH = am.lineup_home ?? [];
  const lineupA = am.lineup_away ?? [];
  const keyH = am.key_players_home ?? [];
  const keyA = am.key_players_away ?? [];

  const hasLineup = lineupH.length > 0 || lineupA.length > 0;
  const hasKeyPlayers = keyH.length > 0 || keyA.length > 0;

  if (!hasLineup && !hasKeyPlayers) {
    return <p className="text-sm text-slate-400">Composition non disponible pour ce match.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
          am.lineup_status === "confirmed" ? "bg-emerald-100 text-emerald-700" :
          am.lineup_status === "presumed" ? "bg-slate-100 text-slate-500" :
          "bg-slate-50 text-slate-400"
        }`}>
          {am.lineup_status === "confirmed" ? "Compo officielle confirmee" :
           am.lineup_status === "presumed" ? "Compo presumee (derniere connue - blesses)" :
           "Compo non disponible"}
        </span>
      </div>

      {hasLineup ? (
        <div className="grid grid-cols-2 gap-4">
          {[{ label: home, lineup: lineupH, keyPlayers: keyH, color: "text-blue-600" }, { label: away, lineup: lineupA, keyPlayers: keyA, color: "text-red-600" }].map(({ label, lineup, keyPlayers, color }) => (
            <div key={label}>
              <div className={`text-xs font-semibold mb-2 truncate ${color}`}>{label}</div>
              <div className="space-y-0.5">
                {lineup.map((p, i) => {
                  // Prefer inline stats from backend enrichment, fallback to key_players matching
                  const hasInline = p.goals != null || p.assists != null || p.rating != null;
                  const inlineStats: KeyPlayer | null = hasInline ? {
                    name: p.name,
                    goals: p.goals ?? 0,
                    assists: p.assists ?? 0,
                    goals_per_match: (p.games && p.games > 0) ? (p.goals ?? 0) / p.games : 0,
                    rating: p.rating ?? 0,
                    is_absent: p.is_absent ?? false,
                  } : null;
                  const stats = inlineStats ?? findKeyPlayer(p.name, keyPlayers) ?? null;
                  return <PlayerRow key={i} name={p.name} pos={p.pos} number={p.number} stats={stats} />;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* No lineup but key players exist — show key players only */
        <div className="grid grid-cols-2 gap-4">
          {[{ label: home, players: keyH, color: "text-blue-600" }, { label: away, players: keyA, color: "text-red-600" }].map(({ label, players, color }) => (
            <div key={label}>
              <div className={`text-xs font-semibold mb-2 truncate ${color}`}>{label}</div>
              <div className="space-y-0.5">
                {players.map((p, i) => (
                  <PlayerRow key={i} name={p.name} pos={p.position?.slice(0, 3) ?? ""} number={null} stats={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── NBA Analyse Tab ──────────────────────────────────────────────────────────

function NBAnalyseTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const edges = am.edges ?? {};
  const edgeData = Object.entries(edges)
    .filter(([k]) => k === "Home" || k === "Away")
    .map(([k, v]) => ({
      name: k === "Home" ? home : away,
      value: parseFloat((v * 100).toFixed(2)),
      fill: v > 0 ? "#10b981" : "#ef4444",
    }))
    .filter((d) => Math.abs(d.value) > 0.01);

  const maxPts = 6;

  return (
    <div className="space-y-4">
      {am.nba_ml_used && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
          <span className="text-xs text-orange-700 font-medium">Modele ML actif (XGBoost + LightGBM, 38 features)</span>
        </div>
      )}
      {/* Win rates + point differential */}
      {(am.home_win_rate_10 != null || am.away_win_rate_10 != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Forme (10 derniers matchs)</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs">VS</div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {[
              { label: "Win rate (10j)", h: am.home_win_rate_10, a: am.away_win_rate_10, fmt: (v: number) => `${(v * 100).toFixed(0)}%`, higherBetter: true },
              { label: "Pts marques / match", h: am.home_pts_avg_10, a: am.away_pts_avg_10, fmt: (v: number) => v.toFixed(1), higherBetter: true },
              { label: "Pts encaisses / match", h: am.home_pts_allowed_10, a: am.away_pts_allowed_10, fmt: (v: number) => v.toFixed(1), higherBetter: false },
              { label: "Diff. pts (10j)", h: am.home_pt_diff_10, a: am.away_pt_diff_10, fmt: (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)), higherBetter: true },
            ].map(({ label, h, a, fmt, higherBetter }) => {
              if (h == null && a == null) return null;
              const homeBetter = h != null && a != null ? (higherBetter ? h > a : h < a) : undefined;
              return <FormRow key={label} label={label} homeVal={h != null ? fmt(h) : "-"} awayVal={a != null ? fmt(a) : "-"} homeBetter={homeBetter} />;
            })}
          </div>
        </div>
      )}
      {/* Streak + B2B */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-slate-500" />
          <h4 className="text-slate-900 font-semibold text-sm">Contexte du match</h4>
        </div>
        <div className="space-y-2">
          {am.home_streak != null && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Streak {home}</span>
              <span className={`font-semibold ${am.home_streak > 0 ? "text-emerald-600" : am.home_streak < 0 ? "text-red-500" : "text-slate-600"}`}>
                {am.home_streak > 0 ? `+${am.home_streak}V` : am.home_streak < 0 ? `${Math.abs(am.home_streak)}D` : "Neutre"}
              </span>
            </div>
          )}
          {am.away_streak != null && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Streak {away}</span>
              <span className={`font-semibold ${am.away_streak > 0 ? "text-emerald-600" : am.away_streak < 0 ? "text-red-500" : "text-slate-600"}`}>
                {am.away_streak > 0 ? `+${am.away_streak}V` : am.away_streak < 0 ? `${Math.abs(am.away_streak)}D` : "Neutre"}
              </span>
            </div>
          )}
          {(am.home_b2b || am.away_b2b) && (
            <div className="flex gap-2 flex-wrap pt-1">
              {am.home_b2b && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">{home} joue dos-a-dos</span>}
              {am.away_b2b && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">{away} joue dos-a-dos</span>}
            </div>
          )}
          {am.total_line != null && (
            <div className="flex justify-between text-sm pt-1">
              <span className="text-slate-500">Ligne Over/Under</span>
              <span className="font-semibold text-slate-700">{am.total_line} pts</span>
            </div>
          )}
        </div>
      </div>
      {/* Edge breakdown */}
      {edgeData.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2">
            <Tip text="Difference entre la probabilite de notre modele et celle implicite dans la cote du bookmaker. Positif = value bet.">
              Avantage modele vs bookmakers <span className="text-slate-400 underline decoration-dotted">i</span>
            </Tip>
          </div>
          <div className="h-20">
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
          <div className="flex gap-4 text-[10px] text-slate-400 mt-1">
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Value (modele &gt; marche)</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Cote trop basse</span>
          </div>
        </div>
      )}
      {/* Data quality */}
      {am.data_quality && (
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
      )}
    </div>
  );
}

// ─── NBA Stats Tab ────────────────────────────────────────────────────────────

function NBAStatsTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "Win rate (10j)", hv: am.home_win_rate_10 != null ? `${(am.home_win_rate_10 * 100).toFixed(0)}%` : null, av: am.away_win_rate_10 != null ? `${(am.away_win_rate_10 * 100).toFixed(0)}%` : null },
    { label: "Pts/match (10j)", hv: am.home_pts_avg_10?.toFixed(1) ?? null, av: am.away_pts_avg_10?.toFixed(1) ?? null },
    { label: "Pts encaisses/match", hv: am.home_pts_allowed_10?.toFixed(1) ?? null, av: am.away_pts_allowed_10?.toFixed(1) ?? null, lowerBetter: true },
    { label: "Differentiel pts", hv: am.home_pt_diff_10 != null ? (am.home_pt_diff_10 > 0 ? `+${am.home_pt_diff_10.toFixed(1)}` : am.home_pt_diff_10.toFixed(1)) : null, av: am.away_pt_diff_10 != null ? (am.away_pt_diff_10 > 0 ? `+${am.away_pt_diff_10.toFixed(1)}` : am.away_pt_diff_10.toFixed(1)) : null },
  ].filter(r => r.hv != null || r.av != null);

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-orange-500" />
          <h4 className="text-slate-900 font-semibold text-sm">Statistiques des equipes</h4>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
          <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
          <div className="text-center text-slate-400 text-xs">VS</div>
          <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
          {rows.map(({ label, hv, av, lowerBetter }) => {
            const hNum = parseFloat(hv?.replace(/[^0-9.-]/g, "") ?? "");
            const aNum = parseFloat(av?.replace(/[^0-9.-]/g, "") ?? "");
            const canCompare = !isNaN(hNum) && !isNaN(aNum) && hNum !== aNum;
            const homeBetter = canCompare ? (lowerBetter ? hNum < aNum : hNum > aNum) : undefined;
            return <FormRow key={label} label={label} homeVal={hv ?? "-"} awayVal={av ?? "-"} homeBetter={homeBetter} />;
          })}
        </div>
      </div>
      {/* Total O/U context */}
      {(am.total_line != null || am.odds_over != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={15} className="text-slate-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Total Over/Under</h4>
          </div>
          <div className="space-y-1 text-sm">
            {am.total_line != null && <div className="flex justify-between"><span className="text-slate-500">Ligne O/U</span><span className="font-semibold">{am.total_line}</span></div>}
            {am.odds_over != null && <div className="flex justify-between"><span className="text-slate-500">Cote Over {am.total_line}</span><span className="font-semibold text-blue-600">{am.odds_over.toFixed(2)}</span></div>}
            {am.odds_under != null && <div className="flex justify-between"><span className="text-slate-500">Cote Under {am.total_line}</span><span className="font-semibold text-blue-600">{am.odds_under.toFixed(2)}</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rugby Analyse Tab ────────────────────────────────────────────────────────

function RugbyAnalyseTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  return (
    <div className="space-y-4">
      {am.rugby_ml_used && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-medium">Modele ML actif (XGBoost + LightGBM, 36 features)</span>
        </div>
      )}
      {/* Win rates + point differential */}
      {(am.home_win_rate_10 != null || am.away_win_rate_10 != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-green-600" />
            <h4 className="text-slate-900 font-semibold text-sm">Forme (10 derniers matchs)</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs"></div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {[
              { label: "Win rate (10j)", h: am.home_win_rate_10, a: am.away_win_rate_10, fmt: (v: number) => `${(v * 100).toFixed(0)}%`, higherBetter: true },
              { label: "Points marques/match", h: am.home_pts_avg_10, a: am.away_pts_avg_10, fmt: (v: number) => v.toFixed(1), higherBetter: true },
              { label: "Points encaisses/match", h: am.home_pts_allowed_10, a: am.away_pts_allowed_10, fmt: (v: number) => v.toFixed(1), higherBetter: false },
              { label: "Diff. points (10j)", h: am.home_pt_diff_10, a: am.away_pt_diff_10, fmt: (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)), higherBetter: true },
            ].map(({ label, h, a, fmt, higherBetter }) => {
              if (h == null && a == null) return null;
              const homeBetter = h != null && a != null ? (higherBetter ? h > a : h < a) : undefined;
              return <FormRow key={label} label={label} homeVal={h != null ? fmt(h) : "-"} awayVal={a != null ? fmt(a) : "-"} homeBetter={homeBetter} />;
            })}
          </div>
        </div>
      )}
      {/* Rugby specifics: tries & penalties */}
      {(am.home_tries_avg_10 != null || am.away_tries_avg_10 != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-amber-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Stats rugby (10 derniers)</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs"></div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {[
              { label: "Essais / match", h: am.home_tries_avg_10, a: am.away_tries_avg_10, fmt: (v: number) => v.toFixed(1), higherBetter: true },
              { label: "Penalites / match", h: am.home_penalties_avg_10, a: am.away_penalties_avg_10, fmt: (v: number) => v.toFixed(1), higherBetter: false },
            ].map(({ label, h, a, fmt, higherBetter }) => {
              if (h == null && a == null) return null;
              const homeBetter = h != null && a != null ? (higherBetter ? h > a : h < a) : undefined;
              return <FormRow key={label} label={label} homeVal={h != null ? fmt(h) : "-"} awayVal={a != null ? fmt(a) : "-"} homeBetter={homeBetter} />;
            })}
          </div>
        </div>
      )}
      {/* Streak context */}
      {(am.home_streak != null || am.away_streak != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={15} className="text-slate-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Contexte</h4>
          </div>
          <div className="space-y-2">
            {am.home_streak != null && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Streak {home}</span>
                <span className={`font-semibold ${am.home_streak > 0 ? "text-emerald-600" : am.home_streak < 0 ? "text-red-500" : "text-slate-600"}`}>
                  {am.home_streak > 0 ? `+${am.home_streak}V` : am.home_streak < 0 ? `${Math.abs(am.home_streak)}D` : "Neutre"}
                </span>
              </div>
            )}
            {am.away_streak != null && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Streak {away}</span>
                <span className={`font-semibold ${am.away_streak > 0 ? "text-emerald-600" : am.away_streak < 0 ? "text-red-500" : "text-slate-600"}`}>
                  {am.away_streak > 0 ? `+${am.away_streak}V` : am.away_streak < 0 ? `${Math.abs(am.away_streak)}D` : "Neutre"}
                </span>
              </div>
            )}
            {am.total_line != null && (
              <div className="flex justify-between text-sm pt-1">
                <span className="text-slate-500">Total O/U</span>
                <span className="font-semibold text-slate-700">{am.total_line} pts</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rugby Stats Tab ──────────────────────────────────────────────────────────

function RugbyStatsTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "Win rate (10j)", hv: am.home_win_rate_10 != null ? `${(am.home_win_rate_10 * 100).toFixed(0)}%` : null, av: am.away_win_rate_10 != null ? `${(am.away_win_rate_10 * 100).toFixed(0)}%` : null },
    { label: "Points/match (10j)", hv: am.home_pts_avg_10?.toFixed(1) ?? null, av: am.away_pts_avg_10?.toFixed(1) ?? null },
    { label: "Points encaisses/match", hv: am.home_pts_allowed_10?.toFixed(1) ?? null, av: am.away_pts_allowed_10?.toFixed(1) ?? null, lowerBetter: true },
    { label: "Differentiel pts", hv: am.home_pt_diff_10 != null ? (am.home_pt_diff_10 > 0 ? `+${am.home_pt_diff_10.toFixed(1)}` : am.home_pt_diff_10.toFixed(1)) : null, av: am.away_pt_diff_10 != null ? (am.away_pt_diff_10 > 0 ? `+${am.away_pt_diff_10.toFixed(1)}` : am.away_pt_diff_10.toFixed(1)) : null },
    { label: "Essais / match (10j)", hv: am.home_tries_avg_10?.toFixed(1) ?? null, av: am.away_tries_avg_10?.toFixed(1) ?? null },
    { label: "Penalites / match (10j)", hv: am.home_penalties_avg_10?.toFixed(1) ?? null, av: am.away_penalties_avg_10?.toFixed(1) ?? null, lowerBetter: true },
  ].filter(r => r.hv != null || r.av != null);

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-green-600" />
          <h4 className="text-slate-900 font-semibold text-sm">Statistiques des equipes</h4>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
          <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
          <div className="text-center text-slate-400 text-xs">VS</div>
          <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
          {rows.map(({ label, hv, av, lowerBetter }) => {
            const hNum = parseFloat(hv?.replace(/[^0-9.-]/g, "") ?? "");
            const aNum = parseFloat(av?.replace(/[^0-9.-]/g, "") ?? "");
            const canCompare = !isNaN(hNum) && !isNaN(aNum) && hNum !== aNum;
            const homeBetter = canCompare ? (lowerBetter ? hNum < aNum : hNum > aNum) : undefined;
            return <FormRow key={label} label={label} homeVal={hv ?? "-"} awayVal={av ?? "-"} homeBetter={homeBetter} />;
          })}
        </div>
      </div>
      {/* Scoring guide */}
      <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
        <div className="text-xs font-semibold text-amber-700 mb-1.5">Systeme de points rugby</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-amber-800">
          <span>Essai : 5 pts</span>
          <span>Transformation : 2 pts</span>
          <span>Penalite : 3 pts</span>
          <span>Drop : 3 pts</span>
        </div>
      </div>
      {/* Total O/U */}
      {(am.total_line != null || am.odds_over != null) && (
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
      )}
    </div>
  );
}

// ─── MLB Analyse Tab ──────────────────────────────────────────────────────────

function MLBAnalyseTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const edges = am.edges ?? {};
  const edgeData = Object.entries(edges)
    .filter(([k]) => k === "Home" || k === "Away")
    .map(([k, v]) => ({
      name: k === "Home" ? home : away,
      value: parseFloat((v * 100).toFixed(2)),
      fill: v > 0 ? "#10b981" : "#ef4444",
    }))
    .filter((d) => Math.abs(d.value) > 0.01);

  const maxPts = 6;

  return (
    <div className="space-y-4">
      {am.mlb_ml_used && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
          <span className="text-xs text-orange-700 font-medium">Modele ML actif (XGBoost + LightGBM, features baseball)</span>
        </div>
      )}
      {/* Pitcher matchup */}
      {(am.starter_home_name || am.starter_away_name) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-amber-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Lanceurs partants</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-blue-700 truncate">{am.starter_home_name ?? "?"}</div>
              <div className="text-xs text-blue-500 mt-0.5 truncate">{home}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-red-700 truncate">{am.starter_away_name ?? "?"}</div>
              <div className="text-xs text-red-500 mt-0.5 truncate">{away}</div>
            </div>
          </div>
        </div>
      )}
      {/* Runs avg */}
      {(am.home_runs_avg_10 != null || am.away_runs_avg_10 != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Offensif / Defensif (10 derniers)</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs">VS</div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {[
              { label: "Runs marques / match", h: am.home_runs_avg_10, a: am.away_runs_avg_10, fmt: (v: number) => v.toFixed(2), higherBetter: true },
              { label: "Runs encaisses / match", h: am.home_runs_allowed_10, a: am.away_runs_allowed_10, fmt: (v: number) => v.toFixed(2), higherBetter: false },
            ].map(({ label, h, a, fmt, higherBetter }) => {
              if (h == null && a == null) return null;
              const homeBetter = h != null && a != null ? (higherBetter ? h > a : h < a) : undefined;
              return <FormRow key={label} label={label} homeVal={h != null ? fmt(h) : "-"} awayVal={a != null ? fmt(a) : "-"} homeBetter={homeBetter} />;
            })}
          </div>
        </div>
      )}
      {/* Edge breakdown */}
      {edgeData.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2">
            <Tip text="Difference entre la probabilite de notre modele et celle implicite dans la cote du bookmaker. Positif = value bet.">
              Avantage modele vs bookmakers <span className="text-slate-400 underline decoration-dotted">i</span>
            </Tip>
          </div>
          <div className="h-20">
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
          <div className="flex gap-4 text-[10px] text-slate-400 mt-1">
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Value (modele &gt; marche)</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Cote trop basse</span>
          </div>
        </div>
      )}
      {/* Data quality */}
      {am.data_quality && (
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
      )}
      {/* Context */}
      {am.context && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Contexte</div>
          <p className="text-xs text-slate-600 leading-relaxed">{am.context}</p>
        </div>
      )}
      {/* Venue */}
      {am.venue && (
        <div className="text-[11px] text-slate-500">
          <span>Stade : <span className="text-slate-700 font-medium">{am.venue}</span></span>
        </div>
      )}
    </div>
  );
}

// ─── MLB Stats Tab ────────────────────────────────────────────────────────────

function MLBStatsTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "Runs marques / match (10j)", hv: am.home_runs_avg_10 != null ? am.home_runs_avg_10.toFixed(2) : null, av: am.away_runs_avg_10 != null ? am.away_runs_avg_10.toFixed(2) : null },
    { label: "Runs encaisses / match (10j)", hv: am.home_runs_allowed_10 != null ? am.home_runs_allowed_10.toFixed(2) : null, av: am.away_runs_allowed_10 != null ? am.away_runs_allowed_10.toFixed(2) : null, lowerBetter: true },
  ].filter(r => r.hv != null || r.av != null);

  return (
    <div className="space-y-4">
      {/* Pitcher matchup */}
      {(am.starter_home_name || am.starter_away_name) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-amber-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Lanceurs partants</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-blue-700 truncate">{am.starter_home_name ?? "?"}</div>
              <div className="text-xs text-blue-500 mt-0.5 truncate">{home}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-red-700 truncate">{am.starter_away_name ?? "?"}</div>
              <div className="text-xs text-red-500 mt-0.5 truncate">{away}</div>
            </div>
          </div>
        </div>
      )}
      {/* Stats comparison */}
      {rows.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Statistiques des equipes (10 derniers)</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs">VS</div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {rows.map(({ label, hv, av, lowerBetter }) => {
              const hNum = parseFloat(hv?.replace(/[^0-9.-]/g, "") ?? "");
              const aNum = parseFloat(av?.replace(/[^0-9.-]/g, "") ?? "");
              const canCompare = !isNaN(hNum) && !isNaN(aNum) && hNum !== aNum;
              const homeBetter = canCompare ? (lowerBetter ? hNum < aNum : hNum > aNum) : undefined;
              return <FormRow key={label} label={label} homeVal={hv ?? "-"} awayVal={av ?? "-"} homeBetter={homeBetter} />;
            })}
          </div>
        </div>
      )}
      {/* Scoring guide */}
      <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
        <div className="text-xs font-semibold text-orange-700 mb-1.5">Regles baseball (MLB)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-orange-800">
          <span>9 manches par match</span>
          <span>3 outs par manche</span>
          <span>Moneyline : victoire nette</span>
          <span>Run Line : handicap ±1.5</span>
        </div>
      </div>
    </div>
  );
}
