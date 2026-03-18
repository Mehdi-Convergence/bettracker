// Composant detail pour les matchs NBA
import { TrendingUp, Trophy, Activity, BarChart2, Clock, MapPin } from "lucide-react";
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
  TotalOUContext,
  type Tab,
} from "./MatchDetailCommon";

// ─── NBAMatchDetail ───────────────────────────────────────────────────────────

interface NBAProps {
  am: AIScanMatch;
  home: string;
  away: string;
  tab: Tab;
}

export default function NBAMatchDetail({ am, home, away, tab }: NBAProps) {
  return (
    <>
      {tab === "analyse" && (
        <>
          {am.model_prob_home != null && <PredictionSection am={am} home={home} away={away} />}
          <NBAnalyseTab am={am} home={home} away={away} />
          <IAConseilTab am={am} home={home} away={away} />
        </>
      )}
      {tab === "equipes" && <NBAStatsTab am={am} home={home} away={away} />}
      {tab === "cotes" && <CotesTab am={am} />}
    </>
  );
}

// ─── NBAnalyseTab ─────────────────────────────────────────────────────────────

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

  return (
    <div className="space-y-4">
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
    </div>
  );
}

// ─── NBAStatsTab ──────────────────────────────────────────────────────────────

function NBAStatsTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "Win rate (10j)", hv: am.home_win_rate_10 != null ? `${(am.home_win_rate_10 * 100).toFixed(0)}%` : null, av: am.away_win_rate_10 != null ? `${(am.away_win_rate_10 * 100).toFixed(0)}%` : null },
    { label: "Pts/match (10j)", hv: am.home_pts_avg_10?.toFixed(1) ?? null, av: am.away_pts_avg_10?.toFixed(1) ?? null },
    { label: "Pts encaisses/match", hv: am.home_pts_allowed_10?.toFixed(1) ?? null, av: am.away_pts_allowed_10?.toFixed(1) ?? null, lowerBetter: true },
    { label: "Differentiel pts", hv: am.home_pt_diff_10 != null ? (am.home_pt_diff_10 > 0 ? `+${am.home_pt_diff_10.toFixed(1)}` : am.home_pt_diff_10.toFixed(1)) : null, av: am.away_pt_diff_10 != null ? (am.away_pt_diff_10 > 0 ? `+${am.away_pt_diff_10.toFixed(1)}` : am.away_pt_diff_10.toFixed(1)) : null },
  ].filter(r => r.hv != null || r.av != null);

  const advancedRows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "FG%", hv: am.home_fg_pct != null ? `${(am.home_fg_pct * 100).toFixed(1)}%` : null, av: am.away_fg_pct != null ? `${(am.away_fg_pct * 100).toFixed(1)}%` : null },
    { label: "3P%", hv: am.home_three_pct != null ? `${(am.home_three_pct * 100).toFixed(1)}%` : null, av: am.away_three_pct != null ? `${(am.away_three_pct * 100).toFixed(1)}%` : null },
    { label: "FT%", hv: am.home_ft_pct != null ? `${(am.home_ft_pct * 100).toFixed(1)}%` : null, av: am.away_ft_pct != null ? `${(am.away_ft_pct * 100).toFixed(1)}%` : null },
    { label: "Rebonds/match", hv: am.home_rebounds_avg?.toFixed(1) ?? null, av: am.away_rebounds_avg?.toFixed(1) ?? null },
    { label: "Assists/match", hv: am.home_assists_avg?.toFixed(1) ?? null, av: am.away_assists_avg?.toFixed(1) ?? null },
    { label: "Turnovers/match", hv: am.home_turnovers_avg?.toFixed(1) ?? null, av: am.away_turnovers_avg?.toFixed(1) ?? null, lowerBetter: true },
    { label: "Steals/match", hv: am.home_steals_avg?.toFixed(1) ?? null, av: am.away_steals_avg?.toFixed(1) ?? null },
    { label: "Blocks/match", hv: am.home_blocks_avg?.toFixed(1) ?? null, av: am.away_blocks_avg?.toFixed(1) ?? null },
  ].filter(r => r.hv != null || r.av != null);

  const hasConference = am.home_conference != null || am.away_conference != null;
  const hasSeasonRecord = am.home_season_record != null || am.away_season_record != null;
  const hasLast5 = am.home_last_5 != null || am.away_last_5 != null;

  return (
    <div className="space-y-4">
      {/* Bilan saison + conference */}
      {(hasConference || hasSeasonRecord || hasLast5) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Bilan saison</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: home, conf: am.home_conference, confRank: am.home_conference_rank, record: am.home_season_record, last5: am.home_last_5, color: "blue" },
              { label: away, conf: am.away_conference, confRank: am.away_conference_rank, record: am.away_season_record, last5: am.away_last_5, color: "red" },
            ].map(({ label, conf, confRank, record, last5, color }) => (
              <div key={label} className={`bg-${color === "blue" ? "blue" : "red"}-50 border border-${color === "blue" ? "blue" : "red"}-100 rounded-lg p-3`}>
                <div className={`text-xs font-semibold text-${color === "blue" ? "blue" : "red"}-700 truncate mb-1`}>{label}</div>
                {record != null && <div className="text-base font-bold text-slate-800">{record}</div>}
                {conf != null && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {conf}{confRank != null ? ` (${confRank}e)` : ""}
                  </div>
                )}
                {last5 != null && <div className="text-[10px] text-slate-400 mt-0.5">5 derniers : {Array.isArray(last5) ? last5.map((g: { won: boolean }) => g.won ? "W" : "L").join("") : String(last5)}</div>}
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

      {/* Stats de base */}
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

      {/* Stats avancees */}
      {advancedRows.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={15} className="text-orange-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Stats avancees</h4>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-sm">
            <div className="text-right text-blue-600 font-semibold text-xs truncate">{home}</div>
            <div className="text-center text-slate-400 text-xs">VS</div>
            <div className="text-left text-red-600 font-semibold text-xs truncate">{away}</div>
            {advancedRows.map(({ label, hv, av, lowerBetter }) => {
              const hNum = parseFloat(hv?.replace(/[^0-9.-]/g, "") ?? "");
              const aNum = parseFloat(av?.replace(/[^0-9.-]/g, "") ?? "");
              const canCompare = !isNaN(hNum) && !isNaN(aNum) && hNum !== aNum;
              const homeBetter = canCompare ? (lowerBetter ? hNum < aNum : hNum > aNum) : undefined;
              return <FormRow key={label} label={label} homeVal={hv ?? "-"} awayVal={av ?? "-"} homeBetter={homeBetter} />;
            })}
          </div>
        </div>
      )}

      {/* Total O/U context */}
      <TotalOUContext am={am} />

      {/* Absences NBA */}
      <AbsencesGrid am={am} home={home} away={away} />
    </div>
  );
}
