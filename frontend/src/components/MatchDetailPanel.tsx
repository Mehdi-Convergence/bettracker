import { useEffect, useState, useRef } from "react";
import { X, Loader2, Trophy, Shield, Target, TrendingUp, AlertCircle, Users } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getMatchDetails, getTeamPlayers } from "../services/api";
import type { ValueBet, MatchDetail, TeamFormStats, H2HStats, ModelAnalysis, HistoricalAverages, KeyFeature, TeamPlayersResponse } from "../types";
import { LEAGUE_INFO } from "../types";

interface Props {
  bet: ValueBet;
  onClose: () => void;
}

const OUTCOME_COLORS = { H: "#3b82f6", D: "#eab308", A: "#ef4444" };
const RESULT_COLORS = { W: "bg-emerald-500", D: "bg-amber-500", L: "bg-red-500" };

type TabKey = "analysis" | "home" | "away";

export default function MatchDetailPanel({ bet, onClose }: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("analysis");

  useEffect(() => {
    setLoading(true);
    setError("");
    setActiveTab("analysis");
    getMatchDetails({
      home_team: bet.home_team,
      away_team: bet.away_team,
      league: bet.league,
      date: bet.date,
    })
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bet.home_team, bet.away_team, bet.league, bet.date]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const leagueInfo = LEAGUE_INFO[bet.league];

  const tabs: { key: TabKey; label: string }[] = [
    { key: "analysis", label: "Analyse" },
    { key: "home", label: bet.home_team },
    { key: "away", label: bet.away_team },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white border-l border-gray-200 z-50 overflow-y-auto shadow-2xl animate-slide-in">
        {/* Header + Tabs */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <div className="flex items-center justify-between p-4 pb-0">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{bet.home_team} vs {bet.away_team}</h3>
              <p className="text-sm text-gray-500">
                {leagueInfo ? `${leagueInfo.flag} ${leagueInfo.name}` : bet.league} | {bet.date}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
              <X size={20} />
            </button>
          </div>
          {/* Tab navigation */}
          <div className="flex gap-0 px-4 mt-3">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.key !== "analysis" && <Users size={12} className="inline mr-1.5" />}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Analysis tab */}
        {activeTab === "analysis" && (
          <>
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-blue-500" />
                <span className="ml-2 text-gray-500">Chargement des details...</span>
              </div>
            )}

            {error && (
              <div className="m-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
            )}

            {detail && (
              <div className="p-4 space-y-4">
                <ModelPredictionSection model={detail.model} bet={bet} />
                <FormComparisonSection home={detail.home_form} away={detail.away_form} />
                <H2HSection h2h={detail.h2h} homeName={bet.home_team} awayName={bet.away_team} />
                <KeyFeaturesSection features={detail.model.key_features} />
                <HistoricalStatsSection stats={detail.historical} homeName={bet.home_team} awayName={bet.away_team} />
              </div>
            )}
          </>
        )}

        {/* Home team tab */}
        {activeTab === "home" && (
          <TeamPlayersTab teamName={bet.home_team} league={bet.league} />
        )}

        {/* Away team tab */}
        {activeTab === "away" && (
          <TeamPlayersTab teamName={bet.away_team} league={bet.league} />
        )}
      </div>
    </>
  );
}

// --- Team Players Tab (lazy-loaded) ---

function TeamPlayersTab({ teamName, league }: { teamName: string; league: string }) {
  const [data, setData] = useState<TeamPlayersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    getTeamPlayers(teamName, league)
      .then(setData)
      .catch(() => setData({ team_name: teamName, injuries: [], players: [], scraped_at: null, available: false, error: "Erreur de connexion" }))
      .finally(() => setLoading(false));
  }, [teamName, league]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Scraping des donnees joueurs...</span>
      </div>
    );
  }

  if (!data || !data.available) {
    return (
      <div className="m-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertCircle size={16} />
          <span className="text-sm font-medium">{data?.error || "Donnees non disponibles"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Scrape timestamp */}
      {data.scraped_at && (
        <div className="text-xs text-gray-400 text-right">
          Donnees du {new Date(data.scraped_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {/* Injuries */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
          <span className="text-red-500">+</span>
          Blessures / Absences
        </h4>
        {data.injuries.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune blessure signalee</p>
        ) : (
          <div className="space-y-2">
            {data.injuries.map((inj, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold shrink-0">X</span>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-900 font-medium">{inj.player}</span>
                  {inj.position && <span className="text-gray-400 ml-1.5 text-xs">({inj.position})</span>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-gray-600 text-xs">{inj.injury}</div>
                  {inj.expected_return && inj.expected_return !== "?" && (
                    <div className="text-gray-400 text-[10px]">Retour: {inj.expected_return}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Player stats table */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-gray-900 font-semibold text-sm mb-3 flex items-center gap-2">
          <Users size={14} className="text-blue-500" />
          Joueurs cles (saison)
        </h4>
        {data.players.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune donnee disponible</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-200">
                  <th className="text-left py-1.5 font-medium">Joueur</th>
                  <th className="text-center py-1.5 font-medium w-10">Pos</th>
                  <th className="text-center py-1.5 font-medium w-8">MJ</th>
                  <th className="text-center py-1.5 font-medium w-8">B</th>
                  <th className="text-center py-1.5 font-medium w-8">PD</th>
                  <th className="text-center py-1.5 font-medium w-12">Min</th>
                  <th className="text-center py-1.5 font-medium w-8">CJ</th>
                  <th className="text-center py-1.5 font-medium w-8">CR</th>
                </tr>
              </thead>
              <tbody>
                {data.players.slice(0, 15).map((p, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 text-gray-900 font-medium truncate max-w-[150px]">{p.player}</td>
                    <td className="py-1.5 text-center text-gray-500">{p.position.slice(0, 3)}</td>
                    <td className="py-1.5 text-center text-gray-700 font-medium">{p.appearances}</td>
                    <td className="py-1.5 text-center text-gray-700">{p.goals || "-"}</td>
                    <td className="py-1.5 text-center text-gray-700">{p.assists || "-"}</td>
                    <td className="py-1.5 text-center text-gray-500">{p.minutes.toLocaleString()}</td>
                    <td className="py-1.5 text-center">{p.yellow_cards ? <span className="text-amber-600">{p.yellow_cards}</span> : "-"}</td>
                    <td className="py-1.5 text-center">{p.red_cards ? <span className="text-red-600">{p.red_cards}</span> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Model Prediction ---

function ModelPredictionSection({ model, bet }: { model: ModelAnalysis; bet: ValueBet }) {
  const pieData = [
    { name: "Domicile", value: model.prob_home, color: OUTCOME_COLORS.H },
    { name: "Nul", value: model.prob_draw, color: OUTCOME_COLORS.D },
    { name: "Exterieur", value: model.prob_away, color: OUTCOME_COLORS.A },
  ];

  const outcomeLabel = model.predicted_outcome === "H" ? "Domicile" : model.predicted_outcome === "D" ? "Nul" : "Exterieur";

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-blue-500" />
        <h4 className="text-gray-900 font-semibold text-sm">Prediction du modele</h4>
      </div>
      <div className="flex items-center gap-6">
        <div className="w-32 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" strokeWidth={0}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex gap-4 text-sm">
            <ProbBar label="DOM" prob={model.prob_home} color="bg-blue-500" edge={model.edge_home} />
            <ProbBar label="NUL" prob={model.prob_draw} color="bg-amber-500" edge={model.edge_draw} />
            <ProbBar label="EXT" prob={model.prob_away} color="bg-red-500" edge={model.edge_away} />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Pari recommande : <span className="text-gray-900 font-bold">{outcomeLabel}</span>
              <span className="text-gray-400"> ({(model.confidence * 100).toFixed(1)}% confiance)</span>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Value bet actuel : <span className={`font-semibold ${bet.outcome === "H" ? "text-blue-600" : bet.outcome === "D" ? "text-amber-600" : "text-red-600"}`}>
                {bet.outcome === "H" ? "DOM" : bet.outcome === "D" ? "NUL" : "EXT"}
              </span>
              <span className="text-emerald-600 ml-2">+{(bet.edge * 100).toFixed(1)}% edge</span>
              <span className="text-amber-600 ml-2">@ {bet.best_odds.toFixed(2)}</span>
            </p>
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
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-900 font-medium">{(prob * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${prob * 100}%` }} />
      </div>
      {edge !== null && (
        <div className="text-xs mt-0.5 text-right">
          <span className={edge > 0 ? "text-emerald-600" : "text-gray-400"}>
            {edge > 0 ? "+" : ""}{(edge * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

// --- Form Comparison ---

function FormComparisonSection({ home, away }: { home: TeamFormStats; away: TeamFormStats }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-emerald-500" />
        <h4 className="text-gray-900 font-semibold text-sm">Forme des equipes</h4>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        {/* Header */}
        <div className="text-right text-blue-600 font-semibold">{home.team_name}</div>
        <div className="text-center text-gray-400 text-xs">VS</div>
        <div className="text-left text-red-600 font-semibold">{away.team_name}</div>

        {/* Recent form dots */}
        <div className="flex justify-end gap-1">
          {home.recent_matches.slice(0, 5).map((m, i) => (
            <span key={i} className={`w-5 h-5 rounded-full ${RESULT_COLORS[m.result]} flex items-center justify-center text-[10px] font-bold text-white`}>
              {m.result}
            </span>
          ))}
        </div>
        <div className="text-center text-xs text-gray-400">5 derniers</div>
        <div className="flex gap-1">
          {away.recent_matches.slice(0, 5).map((m, i) => (
            <span key={i} className={`w-5 h-5 rounded-full ${RESULT_COLORS[m.result]} flex items-center justify-center text-[10px] font-bold text-white`}>
              {m.result}
            </span>
          ))}
        </div>

        <FormRow label="ELO" homeVal={home.elo_rating.toFixed(0)} awayVal={away.elo_rating.toFixed(0)} homeBetter={home.elo_rating > away.elo_rating} />
        <FormRow label="Position" homeVal={`${home.league_position}e`} awayVal={`${away.league_position}e`} homeBetter={home.league_position < away.league_position} />
        <FormRow label="PPG (5)" homeVal={home.ppg_5.toFixed(2)} awayVal={away.ppg_5.toFixed(2)} homeBetter={home.ppg_5 > away.ppg_5} />
        <FormRow label="Buts/match" homeVal={home.goals_scored_avg_5.toFixed(1)} awayVal={away.goals_scored_avg_5.toFixed(1)} homeBetter={home.goals_scored_avg_5 > away.goals_scored_avg_5} />
        <FormRow label="Encaisses/m" homeVal={home.goals_conceded_avg_5.toFixed(1)} awayVal={away.goals_conceded_avg_5.toFixed(1)} homeBetter={home.goals_conceded_avg_5 < away.goals_conceded_avg_5} />
        <FormRow label="Serie" homeVal={home.current_streak} awayVal={away.current_streak} />
        <FormRow label="Invaincu" homeVal={`${home.unbeaten_run}`} awayVal={`${away.unbeaten_run}`} homeBetter={home.unbeaten_run > away.unbeaten_run} />
        <FormRow label="Clean sheets" homeVal={`${home.clean_sheets_5}/5`} awayVal={`${away.clean_sheets_5}/5`} homeBetter={home.clean_sheets_5 > away.clean_sheets_5} />
        {home.rest_days !== null && away.rest_days !== null && (
          <FormRow label="Repos (j)" homeVal={home.rest_days.toFixed(0)} awayVal={away.rest_days.toFixed(0)} homeBetter={home.rest_days > away.rest_days} />
        )}
      </div>
    </div>
  );
}

function FormRow({ label, homeVal, awayVal, homeBetter }: { label: string; homeVal: string; awayVal: string; homeBetter?: boolean }) {
  return (
    <>
      <div className={`text-right ${homeBetter === true ? "text-emerald-600 font-medium" : homeBetter === false ? "text-gray-500" : "text-gray-700"}`}>
        {homeVal}
      </div>
      <div className="text-center text-xs text-gray-400">{label}</div>
      <div className={`text-left ${homeBetter === false ? "text-emerald-600 font-medium" : homeBetter === true ? "text-gray-500" : "text-gray-700"}`}>
        {awayVal}
      </div>
    </>
  );
}

// --- H2H ---

function H2HSection({ h2h, homeName, awayName }: { h2h: H2HStats; homeName: string; awayName: string }) {
  if (h2h.total_meetings === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={16} className="text-amber-500" />
          <h4 className="text-gray-900 font-semibold text-sm">Confrontations directes</h4>
        </div>
        <p className="text-gray-400 text-sm">Aucune confrontation directe trouvee dans l'historique.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={16} className="text-amber-500" />
        <h4 className="text-gray-900 font-semibold text-sm">Confrontations directes</h4>
        <span className="text-xs text-gray-400">({h2h.total_meetings} matchs)</span>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-blue-600 font-medium">{homeName} {h2h.home_team_wins}</span>
        <div className="flex-1 h-3 rounded-full overflow-hidden flex">
          {h2h.home_team_wins > 0 && <div className="bg-blue-500 h-full" style={{ width: `${h2h.home_win_rate * 100}%` }} />}
          {h2h.draws > 0 && <div className="bg-amber-500 h-full" style={{ width: `${h2h.draw_rate * 100}%` }} />}
          {h2h.away_team_wins > 0 && <div className="bg-red-500 h-full" style={{ width: `${(1 - h2h.home_win_rate - h2h.draw_rate) * 100}%` }} />}
        </div>
        <span className="text-xs text-red-600 font-medium">{h2h.away_team_wins} {awayName}</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {h2h.draws} nul{h2h.draws > 1 ? "s" : ""} | {h2h.avg_goals} buts/match en moyenne
      </p>

      {/* Match list */}
      <div className="space-y-1">
        {h2h.recent_matches.map((m, i) => {
          const homeWin = (m.home_team === homeName && m.ftr === "H") || (m.away_team === homeName && m.ftr === "A");
          const isDraw = m.ftr === "D";
          return (
            <div key={i} className="flex items-center text-xs gap-2 py-1 border-b border-gray-100 last:border-0">
              <span className="text-gray-400 w-20">{m.date}</span>
              <span className={`flex-1 text-right ${m.home_team === homeName ? (homeWin ? "text-emerald-600" : isDraw ? "text-amber-600" : "text-red-600") : "text-gray-700"}`}>
                {m.home_team}
              </span>
              <span className="text-gray-900 font-bold w-12 text-center">{m.fthg} - {m.ftag}</span>
              <span className={`flex-1 ${m.away_team === homeName ? (homeWin ? "text-emerald-600" : isDraw ? "text-amber-600" : "text-red-600") : "text-gray-700"}`}>
                {m.away_team}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Key Features ---

function KeyFeaturesSection({ features }: { features: KeyFeature[] }) {
  if (features.length === 0) return null;

  const chartData = features.map((f) => ({
    name: f.name,
    value: f.value,
    fill: f.direction === "positive" ? "#3b82f6" : f.direction === "negative" ? "#ef4444" : "#9ca3af",
  }));

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-purple-500" />
        <h4 className="text-gray-900 font-semibold text-sm">Facteurs cles du modele</h4>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
            <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} width={95} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
              formatter={(value: number) => value.toFixed(3)}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-400 justify-center">
        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Favorise domicile</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Favorise exterieur</span>
      </div>
    </div>
  );
}

// --- Historical Stats ---

function HistoricalStatsSection({ stats, homeName, awayName }: { stats: HistoricalAverages; homeName: string; awayName: string }) {
  const rows = [
    { label: "Tirs/match", home: stats.home_shots_avg, away: stats.away_shots_avg },
    { label: "Tirs cadres", home: stats.home_shots_target_avg, away: stats.away_shots_target_avg },
    { label: "Corners", home: stats.home_corners_avg, away: stats.away_corners_avg },
    { label: "Fautes", home: stats.home_fouls_avg, away: stats.away_fouls_avg },
    { label: "Cartons jaunes", home: stats.home_yellow_avg, away: stats.away_yellow_avg },
  ];

  const hasData = rows.some((r) => r.home !== null || r.away !== null);
  if (!hasData) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-orange-500" />
        <h4 className="text-gray-900 font-semibold text-sm">Statistiques historiques</h4>
        <span className="text-xs text-gray-400">(10 derniers matchs)</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="text-right text-blue-600 font-semibold text-xs">{homeName} (dom)</div>
        <div className="text-center text-gray-400 text-xs">Stat</div>
        <div className="text-left text-red-600 font-semibold text-xs">{awayName} (ext)</div>
        {rows.map((row) => {
          if (row.home === null && row.away === null) return null;
          const hv = row.home ?? 0;
          const av = row.away ?? 0;
          const isLowerBetter = row.label === "Fautes" || row.label === "Cartons jaunes";
          const homeBetter = isLowerBetter ? hv < av : hv > av;
          return (
            <FormRow
              key={row.label}
              label={row.label}
              homeVal={hv.toFixed(1)}
              awayVal={av.toFixed(1)}
              homeBetter={hv !== av ? homeBetter : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
