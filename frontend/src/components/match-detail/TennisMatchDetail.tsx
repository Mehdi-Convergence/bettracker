// Composant detail pour les matchs de tennis
import { TrendingUp, Trophy, Target, Zap } from "lucide-react";
import type { AIScanMatch } from "@/types";
import {
  Tip,
  FormRow,
  PredictionSection,
  RecentMatchesSection,
  CotesTab,
  IAConseilTab,
  EdgeBarChart,
  DataQualityRow,
  FormBubbles,
  type Tab,
} from "./MatchDetailCommon";

// ─── TennisMatchDetail ────────────────────────────────────────────────────────

interface TennisProps {
  am: AIScanMatch;
  home: string;
  away: string;
  tab: Tab;
}

export default function TennisMatchDetail({ am, home, away, tab }: TennisProps) {
  return (
    <>
      {tab === "analyse" && (
        <>
          {am.model_prob_home != null && <PredictionSection am={am} home={home} away={away} />}
          <TennisAnalyseTab am={am} home={home} away={away} />
          <IAConseilTab am={am} home={home} away={away} />
        </>
      )}
      {tab === "equipes" && <TennisStatsTab am={am} home={home} away={away} />}
      {tab === "cotes" && <CotesTab am={am} />}
    </>
  );
}

// ─── TennisAnalyseTab ─────────────────────────────────────────────────────────

function TennisAnalyseTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const edges = am.edges ?? {};
  const edgeData = Object.entries(edges)
    .map(([k, v]) => ({
      name: k === "P1" ? home.split(" ").pop() ?? "P1" : k === "P2" ? away.split(" ").pop() ?? "P2" : k,
      value: parseFloat((v * 100).toFixed(2)),
      fill: v > 0 ? "#10b981" : "#ef4444",
    }))
    .filter((d) => Math.abs(d.value) > 0.01);

  return (
    <div className="space-y-4">
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
            {am.home_bp_saved_pct != null && am.away_bp_saved_pct != null && (
              <FormRow label="BP Saves %" homeVal={`${am.home_bp_saved_pct}%`} awayVal={`${am.away_bp_saved_pct}%`} homeBetter={am.home_bp_saved_pct > am.away_bp_saved_pct ? true : am.home_bp_saved_pct < am.away_bp_saved_pct ? false : undefined} />
            )}
            {am.home_tb_win_pct != null && am.away_tb_win_pct != null && (
              <FormRow label="TB Win %" homeVal={`${am.home_tb_win_pct}%`} awayVal={`${am.away_tb_win_pct}%`} homeBetter={am.home_tb_win_pct > am.away_tb_win_pct ? true : am.home_tb_win_pct < am.away_tb_win_pct ? false : undefined} />
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
          <EdgeBarChart edgeData={edgeData} height={80} />
        </div>
      )}

      {/* Data quality */}
      <DataQualityRow am={am} maxPts={18} />

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

// ─── TennisStatsTab ───────────────────────────────────────────────────────────

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
    { label: "BP Saves %", hv: am.home_bp_saved_pct != null ? `${am.home_bp_saved_pct}%` : null, av: am.away_bp_saved_pct != null ? `${am.away_bp_saved_pct}%` : null },
    { label: "TB Win %", hv: am.home_tb_win_pct != null ? `${am.home_tb_win_pct}%` : null, av: am.away_tb_win_pct != null ? `${am.away_tb_win_pct}%` : null },
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

          {(form_h || form_a) && (
            <>
              <div className="flex justify-end gap-0.5">
                <FormBubbles form={form_h} />
              </div>
              <div className="text-center text-slate-400 text-[10px] self-center">5 derniers</div>
              <div className="flex gap-0.5">
                <FormBubbles form={form_a} />
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
      {(am.h2h_summary || am.h2h_total != null || (am.h2h_last3 && am.h2h_last3.length > 0)) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-amber-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Confrontations directes</h4>
            {am.h2h_total != null && (
              <span className="ml-auto text-[10px] text-slate-400">{am.h2h_total} confrontation{am.h2h_total > 1 ? "s" : ""}</span>
            )}
          </div>

          {am.h2h_total != null && am.h2h_total > 0 && am.h2h_p1_wins != null && am.h2h_p2_wins != null && (
            <div className="mb-3">
              <div className="flex justify-between text-[11px] font-semibold mb-1">
                <span className="text-blue-600">{home} — {am.h2h_p1_wins}V</span>
                <span className="text-slate-400 text-[10px] self-center">{am.h2h_total} matchs</span>
                <span className="text-red-500">{am.h2h_p2_wins}V — {away}</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden">
                <div className="bg-blue-500 transition-all" style={{ width: `${((am.h2h_p1_wins / am.h2h_total) * 100).toFixed(1)}%` }} />
                <div className="bg-red-400 transition-all" style={{ width: `${((am.h2h_p2_wins / am.h2h_total) * 100).toFixed(1)}%` }} />
              </div>
              {am.h2h_p1_win_rate != null && (
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>{(am.h2h_p1_win_rate * 100).toFixed(0)}%</span>
                  <span>{((1 - am.h2h_p1_win_rate) * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          )}

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
