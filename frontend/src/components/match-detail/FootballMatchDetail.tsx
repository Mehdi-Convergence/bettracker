// Composant detail pour les matchs de football
import { TrendingUp, Trophy, Zap } from "lucide-react";
import type { AIScanMatch } from "@/types";
import {
  Tip,
  FormRow,
  PredictionSection,
  RecentMatchesSection,
  CotesTab,
  IAConseilTab,
  EdgeBarChart,
  EdgeLegend,
  DataQualityRow,
  AbsencesGrid,
  FormBubbles,
  type Tab,
  type KeyPlayer,
} from "./MatchDetailCommon";

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface FootballProps {
  am: AIScanMatch;
  home: string;
  away: string;
  tab: Tab;
}

// ─── FootballMatchDetail ──────────────────────────────────────────────────────

export default function FootballMatchDetail({ am, home, away, tab }: FootballProps) {
  return (
    <>
      {tab === "analyse" && (
        <>
          {am.model_prob_home != null && <PredictionSection am={am} home={home} away={away} />}
          <IADataTab am={am} home={home} away={away} />
          <IAConseilTab am={am} home={home} away={away} />
        </>
      )}
      {tab === "equipes" && (
        <>
          <FormSection am={am} home={home} away={away} />
          {((am.form_home_detail && am.form_home_detail.length > 0) || (am.form_away_detail && am.form_away_detail.length > 0)) && (
            <RecentMatchesSection am={am} home={home} away={away} />
          )}
          <H2HSection am={am} home={home} away={away} />
          <CompoTab am={am} home={home} away={away} />
        </>
      )}
      {tab === "cotes" && <CotesTab am={am} />}
    </>
  );
}

// ─── IADataTab ────────────────────────────────────────────────────────────────

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
          <EdgeBarChart edgeData={edgeData} height={112} />
          <EdgeLegend />
        </div>
      )}

      {/* Data quality */}
      <DataQualityRow am={am} maxPts={23} />

      {/* Marches secondaires (BTTS + Over 2.5) */}
      {(am.btts_edge != null || am.over25_edge != null) && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
            <Zap size={11} className="text-amber-500" />
            Marches secondaires
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {am.btts_edge != null && (
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-[10px] text-slate-500 font-medium mb-1">
                  <Tip text="Both Teams To Score — les deux equipes marquent au moins un but dans le match.">
                    <span className="underline decoration-dotted cursor-help">Les 2 equipes marquent</span>
                  </Tip>
                </div>
                {am.btts_model_prob != null && (
                  <div className="text-sm font-semibold text-slate-700">{(am.btts_model_prob * 100).toFixed(1)}% (modele)</div>
                )}
                <div className={`text-xs font-bold mt-0.5 ${am.btts_edge > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  <Tip text="Ecart entre la probabilite estimee par le modele et la probabilite implicite de la cote. Positif = valeur detectee.">
                    <span className="underline decoration-dotted cursor-help">Edge</span>
                  </Tip> : {am.btts_edge > 0 ? "+" : ""}{(am.btts_edge * 100).toFixed(1)}%
                </div>
              </div>
            )}
            {am.over25_edge != null && (
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-[10px] text-slate-500 font-medium mb-1">
                  <Tip text="Over 2.5 — plus de 2.5 buts dans le match (3 buts minimum).">
                    <span className="underline decoration-dotted cursor-help">Plus de 2.5 buts</span>
                  </Tip>
                </div>
                {am.over25_model_prob != null && (
                  <div className="text-sm font-semibold text-slate-700">{(am.over25_model_prob * 100).toFixed(1)}% (modele)</div>
                )}
                <div className={`text-xs font-bold mt-0.5 ${am.over25_edge > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  <Tip text="Ecart entre la probabilite estimee par le modele et la probabilite implicite de la cote. Positif = valeur detectee.">
                    <span className="underline decoration-dotted cursor-help">Edge</span>
                  </Tip> : {am.over25_edge > 0 ? "+" : ""}{(am.over25_edge * 100).toFixed(1)}%
                </div>
              </div>
            )}
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
          <AbsencesGrid am={am} home={home} away={away} withPositionImpact={true} />
        </div>
      )}
    </div>
  );
}

// ─── FormSection ──────────────────────────────────────────────────────────────

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
        <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
        <div className="text-center text-slate-400 text-xs">VS</div>
        <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>

        <div className="flex justify-end gap-0.5">
          <FormBubbles form={form_h} />
        </div>
        <div className="text-center text-slate-400 text-[10px] self-center">5 derniers</div>
        <div className="flex gap-0.5">
          <FormBubbles form={form_a} />
        </div>

        {(am.form_home_home || am.form_away_away) && (
          <>
            <div className="flex justify-end gap-0.5">
              <FormBubbles form={am.form_home_home ?? ""} size="sm" />
            </div>
            <div className="text-center text-slate-400 text-[10px] self-center">Dom / Ext</div>
            <div className="flex gap-0.5">
              <FormBubbles form={am.form_away_away ?? ""} size="sm" />
            </div>
          </>
        )}

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

// ─── H2HSection ───────────────────────────────────────────────────────────────

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

// ─── CompoTab ─────────────────────────────────────────────────────────────────

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
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {[{ label: home, lineup: lineupH, keyPlayers: keyH, color: "text-blue-600" }, { label: away, lineup: lineupA, keyPlayers: keyA, color: "text-red-600" }].map(({ label, lineup, keyPlayers, color }) => (
            <div key={label}>
              <div className={`text-xs font-semibold mb-2 truncate ${color}`}>{label}</div>
              <div className="space-y-0.5">
                {lineup.map((p, i) => {
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
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
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

// Hook pour la gestion des tabs (utilise dans CompoTab uniquement via am)
export { type FootballProps };
