// Composant detail pour les matchs MLB (baseball)
import { TrendingUp, Trophy, Clock, MapPin } from "lucide-react";
import type { AIScanMatch } from "@/types";
import {
  FormRow,
  PredictionSection,
  CotesTab,
  IAConseilTab,
  EdgeBarChart,
  EdgeLegend,
  DataQualityRow,
  AbsencesGrid,
  FormBubbles,
  OverUnderSection,
  type Tab,
} from "./MatchDetailCommon";

// ─── MLBMatchDetail ───────────────────────────────────────────────────────────

interface MLBProps {
  am: AIScanMatch;
  home: string;
  away: string;
  tab: Tab;
}

export default function MLBMatchDetail({ am, home, away, tab }: MLBProps) {
  return (
    <>
      {tab === "analyse" && (
        <>
          {am.model_prob_home != null && <PredictionSection am={am} home={home} away={away} />}
          <MLBAnalyseTab am={am} home={home} away={away} />
          <IAConseilTab am={am} home={home} away={away} />
        </>
      )}
      {tab === "equipes" && <MLBStatsTab am={am} home={home} away={away} />}
      {tab === "cotes" && <CotesTab am={am} />}
    </>
  );
}

// ─── MLBAnalyseTab ────────────────────────────────────────────────────────────

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
              {am.starter_home_name
                ? <div className="text-sm font-bold text-blue-700 truncate">{am.starter_home_name}</div>
                : <div className="text-sm text-slate-400 italic">Non disponible</div>
              }
              <div className="text-xs text-blue-500 mt-0.5 truncate">{home}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              {am.starter_away_name
                ? <div className="text-sm font-bold text-red-700 truncate">{am.starter_away_name}</div>
                : <div className="text-sm text-slate-400 italic">Non disponible</div>
              }
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
            Avantage modele vs bookmakers
          </div>
          <EdgeBarChart edgeData={edgeData} height={80} />
          <EdgeLegend />
        </div>
      )}

      {/* Secondary markets: Over/Under edge */}
      <OverUnderSection am={am} />

      {/* Rest days */}
      {(am.home_rest_days != null || am.away_rest_days != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={15} className="text-slate-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Repos</h4>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{home}</span><span className="font-semibold">{am.home_rest_days ?? "?"}j</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{away}</span><span className="font-semibold">{am.away_rest_days ?? "?"}j</span></div>
          </div>
        </div>
      )}

      {/* Venue */}
      {am.venue && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <MapPin size={12} />
          <span>{am.venue}</span>
        </div>
      )}

      {/* Data quality */}
      <DataQualityRow am={am} maxPts={6} />

      {/* Context */}
      {am.context && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Contexte</div>
          <p className="text-xs text-slate-600 leading-relaxed">{am.context}</p>
        </div>
      )}
    </div>
  );
}

// ─── MLBStatsTab ──────────────────────────────────────────────────────────────

function MLBStatsTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean; tooltip?: string }[] = [
    { label: "Runs marques / match (10j)", hv: am.home_runs_avg_10 != null ? am.home_runs_avg_10.toFixed(2) : null, av: am.away_runs_avg_10 != null ? am.away_runs_avg_10.toFixed(2) : null },
    { label: "Runs encaisses / match (10j)", hv: am.home_runs_allowed_10 != null ? am.home_runs_allowed_10.toFixed(2) : null, av: am.away_runs_allowed_10 != null ? am.away_runs_allowed_10.toFixed(2) : null, lowerBetter: true },
    { label: "Moyenne au baton (BA)", hv: am.home_batting_avg != null ? am.home_batting_avg.toFixed(3) : null, av: am.away_batting_avg != null ? am.away_batting_avg.toFixed(3) : null },
    { label: "OBP (On-Base %)", hv: am.home_obp != null ? am.home_obp.toFixed(3) : null, av: am.away_obp != null ? am.away_obp.toFixed(3) : null, tooltip: "On-Base Percentage — frequence a laquelle un batteur atteint la base (coup sur, but sur balles ou atteint par lancer)." },
    { label: "SLG (Slugging)", hv: am.home_slg != null ? am.home_slg.toFixed(3) : null, av: am.away_slg != null ? am.away_slg.toFixed(3) : null, tooltip: "Slugging — puissance de frappe moyenne. Mesure le nombre total de bases obtenues par passage au baton." },
    { label: "OPS (OBP + SLG)", hv: am.home_ops != null ? am.home_ops.toFixed(3) : null, av: am.away_ops != null ? am.away_ops.toFixed(3) : null, tooltip: "On-base Plus Slugging — mesure combinee d'un batteur. Somme du OBP et du SLG." },
    { label: "ERA (equipe, saison)", hv: am.home_era != null ? am.home_era.toFixed(2) : null, av: am.away_era != null ? am.away_era.toFixed(2) : null, lowerBetter: true },
  ].filter(r => r.hv != null || r.av != null);

  const hasDivision = am.home_division != null || am.away_division != null;

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
              {am.starter_home_name
                ? <div className="text-sm font-bold text-blue-700 truncate">{am.starter_home_name}</div>
                : <div className="text-sm text-slate-400 italic">Non disponible</div>
              }
              <div className="text-xs text-blue-500 mt-0.5 truncate">{home}</div>
              {am.home_era != null && (
                <div className="text-[10px] text-slate-500 mt-1">ERA : <span className="font-semibold text-slate-700">{am.home_era.toFixed(2)}</span></div>
              )}
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              {am.starter_away_name
                ? <div className="text-sm font-bold text-red-700 truncate">{am.starter_away_name}</div>
                : <div className="text-sm text-slate-400 italic">Non disponible</div>
              }
              <div className="text-xs text-red-500 mt-0.5 truncate">{away}</div>
              {am.away_era != null && (
                <div className="text-[10px] text-slate-500 mt-1">ERA : <span className="font-semibold text-slate-700">{am.away_era.toFixed(2)}</span></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Division */}
      {hasDivision && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Division MLB</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: home, div: am.home_division, rank: am.home_division_rank, color: "blue" },
              { label: away, div: am.away_division, rank: am.away_division_rank, color: "red" },
            ].map(({ label, div, rank, color }) => (
              <div key={label} className={`bg-${color === "blue" ? "blue" : "red"}-50 border border-${color === "blue" ? "blue" : "red"}-100 rounded-lg p-3`}>
                <div className={`text-xs font-semibold text-${color === "blue" ? "blue" : "red"}-700 truncate mb-1`}>{label}</div>
                {div != null && <div className="text-sm font-bold text-slate-800">{div}</div>}
                {rank != null && <div className="text-[10px] text-slate-500 mt-0.5">{rank}e de la division</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forme recente */}
      {(am.form_home || am.form_away) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Forme recente</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs">5 derniers</div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            <div className="flex justify-end gap-0.5"><FormBubbles form={am.form_home ?? ""} /></div>
            <div />
            <div className="flex gap-0.5"><FormBubbles form={am.form_away ?? ""} /></div>
          </div>
        </div>
      )}

      {/* Stats comparison */}
      {rows.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Statistiques des equipes</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs">VS</div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {rows.map(({ label, hv, av, lowerBetter, tooltip }) => {
              const hNum = parseFloat(hv?.replace(/[^0-9.-]/g, "") ?? "");
              const aNum = parseFloat(av?.replace(/[^0-9.-]/g, "") ?? "");
              const canCompare = !isNaN(hNum) && !isNaN(aNum) && hNum !== aNum;
              const homeBetter = canCompare ? (lowerBetter ? hNum < aNum : hNum > aNum) : undefined;
              return <FormRow key={label} label={label} homeVal={hv ?? "-"} awayVal={av ?? "-"} homeBetter={homeBetter} tooltip={tooltip} />;
            })}
          </div>
        </div>
      )}

      {/* Absences MLB */}
      <AbsencesGrid am={am} home={home} away={away} />

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
