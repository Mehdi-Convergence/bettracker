// Composant detail pour les matchs de rugby
import { TrendingUp, Trophy, Activity, BarChart2, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { AIScanMatch } from "@/types";
import {
  FormRow,
  PredictionSection,
  CotesTab,
  AbsencesGrid,
  FormBubbles,
  OverUnderSection,
  TotalOUContext,
  type Tab,
} from "./MatchDetailCommon";

// ─── RugbyMatchDetail ─────────────────────────────────────────────────────────

interface RugbyProps {
  am: AIScanMatch;
  home: string;
  away: string;
  tab: Tab;
}

export default function RugbyMatchDetail({ am, home, away, tab }: RugbyProps) {
  return (
    <>
      {tab === "analyse" && (
        <>
          {am.model_prob_home != null && <PredictionSection am={am} home={home} away={away} />}
          <RugbyAnalyseTab am={am} home={home} away={away} />
        </>
      )}
      {tab === "equipes" && <RugbyStatsTab am={am} home={home} away={away} />}
      {tab === "cotes" && <CotesTab am={am} />}
    </>
  );
}

// ─── RugbyAnalyseTab ──────────────────────────────────────────────────────────

function RugbyAnalyseTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  return (
    <div className="space-y-4">
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

      {/* Secondary markets: Over/Under edge */}
      <OverUnderSection am={am} />

      {/* Edge breakdown */}
      {(() => {
        const edges = am.edges ?? {};
        const edgeData = Object.entries(edges)
          .filter(([k]) => k === "H" || k === "D" || k === "A")
          .map(([k, v]) => ({
            name: k === "H" ? home : k === "D" ? "Nul" : away,
            value: parseFloat((v * 100).toFixed(2)),
            fill: v > 0 ? "#10b981" : "#ef4444",
          }))
          .filter((d) => Math.abs(d.value) > 0.01);
        if (edgeData.length === 0) return null;
        return (
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">Avantage modele vs bookmakers</div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={edgeData} layout="vertical" margin={{ left: 80, right: 30, top: 0, bottom: 0 }}>
                  <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" tick={{ fontSize: 10 }} width={75} />
                  <Tooltip formatter={(v: number | undefined) => { const n = v ?? 0; return `${n > 0 ? "+" : ""}${n}%`; }} contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }} />
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
        );
      })()}

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

      {/* Data quality */}
      {am.data_quality && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2">Fiabilite des donnees</div>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${am.data_quality === "green" ? "bg-emerald-500" : am.data_quality === "yellow" ? "bg-amber-400" : "bg-red-500"}`} />
            <span className="text-sm text-slate-700">
              {am.data_quality === "green" ? "Excellente" : am.data_quality === "yellow" ? "Correcte" : "Limitee"}
              {am.data_score != null && <span className="text-slate-400 ml-1">({Math.round(am.data_score * 7)}/7 points)</span>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RugbyStatsTab ────────────────────────────────────────────────────────────

function RugbyStatsTab({ am, home, away }: { am: AIScanMatch; home: string; away: string }) {
  const rows: { label: string; hv: string | null; av: string | null; lowerBetter?: boolean }[] = [
    { label: "Win rate (10j)", hv: am.home_win_rate_10 != null ? `${(am.home_win_rate_10 * 100).toFixed(0)}%` : null, av: am.away_win_rate_10 != null ? `${(am.away_win_rate_10 * 100).toFixed(0)}%` : null },
    { label: "Points/match (10j)", hv: am.home_pts_avg_10?.toFixed(1) ?? null, av: am.away_pts_avg_10?.toFixed(1) ?? null },
    { label: "Points encaisses/match", hv: am.home_pts_allowed_10?.toFixed(1) ?? null, av: am.away_pts_allowed_10?.toFixed(1) ?? null, lowerBetter: true },
    { label: "Differentiel pts", hv: am.home_pt_diff_10 != null ? (am.home_pt_diff_10 > 0 ? `+${am.home_pt_diff_10.toFixed(1)}` : am.home_pt_diff_10.toFixed(1)) : null, av: am.away_pt_diff_10 != null ? (am.away_pt_diff_10 > 0 ? `+${am.away_pt_diff_10.toFixed(1)}` : am.away_pt_diff_10.toFixed(1)) : null },
    { label: "Essais / match (10j)", hv: am.home_tries_avg_10?.toFixed(1) ?? null, av: am.away_tries_avg_10?.toFixed(1) ?? null },
    { label: "Penalites / match (10j)", hv: am.home_penalties_avg_10?.toFixed(1) ?? null, av: am.away_penalties_avg_10?.toFixed(1) ?? null, lowerBetter: true },
    { label: "Cartons jaunes / match", hv: am.home_yellow_cards_avg != null ? am.home_yellow_cards_avg.toFixed(2) : null, av: am.away_yellow_cards_avg != null ? am.away_yellow_cards_avg.toFixed(2) : null, lowerBetter: true },
    { label: "Cartons rouges / match", hv: am.home_red_cards_avg != null ? am.home_red_cards_avg.toFixed(2) : null, av: am.away_red_cards_avg != null ? am.away_red_cards_avg.toFixed(2) : null, lowerBetter: true },
    { label: "Conversions / match", hv: am.home_conversions_avg != null ? am.home_conversions_avg.toFixed(1) : null, av: am.away_conversions_avg != null ? am.away_conversions_avg.toFixed(1) : null },
  ].filter(r => r.hv != null || r.av != null);

  return (
    <div className="space-y-4">
      {/* Forme recente */}
      {(am.form_home || am.form_away) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-green-600" />
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

      {/* Absences Rugby */}
      <AbsencesGrid am={am} home={home} away={away} />

      {/* Scoring guide */}
      <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
        <div className="text-xs font-semibold text-amber-700 mb-1.5">Systeme de points rugby</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-amber-800">
          <span>Essai : 5 pts</span>
          <span>Transformation : 2 pts</span>
          <span>Penalite : 3 pts</span>
          <span>Drop : 3 pts</span>
        </div>
      </div>

      {/* Total O/U */}
      <TotalOUContext am={am} />

      {/* Streak context dans stats tab */}
      {(am.home_streak != null || am.away_streak != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={15} className="text-slate-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Contexte serie</h4>
          </div>
          <div className="space-y-2 text-sm">
            {am.home_streak != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Streak {home}</span>
                <span className={`font-semibold ${am.home_streak > 0 ? "text-emerald-600" : am.home_streak < 0 ? "text-red-500" : "text-slate-600"}`}>
                  {am.home_streak > 0 ? `+${am.home_streak}V` : am.home_streak < 0 ? `${Math.abs(am.home_streak)}D` : "Neutre"}
                </span>
              </div>
            )}
            {am.away_streak != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Streak {away}</span>
                <span className={`font-semibold ${am.away_streak > 0 ? "text-emerald-600" : am.away_streak < 0 ? "text-red-500" : "text-slate-600"}`}>
                  {am.away_streak > 0 ? `+${am.away_streak}V` : am.away_streak < 0 ? `${Math.abs(am.away_streak)}D` : "Neutre"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Repos */}
      {(am.home_rest_days != null || am.away_rest_days != null) && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <BarChart2 size={15} className="text-slate-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Repos</h4>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{home}</span><span className="font-semibold">{am.home_rest_days ?? "?"}j</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{away}</span><span className="font-semibold">{am.away_rest_days ?? "?"}j</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
