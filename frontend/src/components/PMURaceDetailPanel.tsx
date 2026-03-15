import { useEffect } from "react";
import { X, TrendingUp, Target, User, Award } from "lucide-react";
import type { PMURaceCard, PMURunnerCard } from "@/types";

interface Props {
  race: PMURaceCard;
  runnerIndex: number;
  onClose: () => void;
}

function FormBadge({ position }: { position: number }) {
  if (position === 1) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-yellow-400 text-yellow-900">1</span>
  );
  if (position === 2) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-slate-300 text-slate-700">2</span>
  );
  if (position === 3) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-amber-600 text-white">3</span>
  );
  if (position === 0) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-slate-100 text-slate-400" title="Non classe">0</span>
  );
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">{position}</span>
  );
}

function ProgressBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-2 bg-[#f0f1f3] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f4f5f7] last:border-0">
      <span className="text-[12px] text-[#8a919e]">{label}</span>
      <span className="text-[12px] font-semibold text-[#111318]">{value ?? "-"}</span>
    </div>
  );
}

export default function PMURaceDetailPanel({ race, runnerIndex, onClose }: Props) {
  const runner: PMURunnerCard | undefined = race.runners[runnerIndex];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!runner) return null;

  const edgeWin = runner.edge_win ?? 0;
  const edgePlace = runner.edge_place ?? 0;
  const postTimeStr = race.post_time
    ? (() => {
        try {
          const d = new Date(race.post_time);
          return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        } catch {
          return race.post_time;
        }
      })()
    : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md max-md:max-w-full bg-white border-l border-slate-200 z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{runner.horse_name}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {race.hippodrome} &bull; R{race.race_number} &bull; {race.race_type}
              {postTimeStr && <span className="text-slate-400"> &bull; {postTimeStr}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 mt-1">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Resume cheval */}
          <section>
            <h4 className="text-xs font-bold text-[#8a919e] uppercase tracking-wider mb-3">Resume</h4>
            <div className="bg-[#f8f9fa] rounded-xl p-4 space-y-0">
              <StatRow label="Numero" value={runner.number} />
              <StatRow label="Jockey" value={runner.jockey} />
              <StatRow label="Entraineur" value={runner.trainer} />
              <StatRow label="Poids" value={runner.weight != null ? `${runner.weight} kg` : null} />
              <StatRow label="Cote actuelle" value={runner.odds != null ? runner.odds.toFixed(1) : null} />
              {runner.odds_morning != null && (
                <StatRow label="Cote matin" value={runner.odds_morning.toFixed(1)} />
              )}
              <StatRow label="Distance" value={`${race.distance}m`} />
              {race.terrain && <StatRow label="Terrain" value={race.terrain} />}
              {race.prize_pool != null && (
                <StatRow label="Allocation" value={`${race.prize_pool.toLocaleString("fr-FR")} €`} />
              )}
            </div>
          </section>

          {/* Forme recente */}
          {(runner.last_5 && runner.last_5.length > 0) || runner.form ? (
            <section>
              <h4 className="text-xs font-bold text-[#8a919e] uppercase tracking-wider mb-3">Forme recente</h4>
              {runner.last_5 && runner.last_5.length > 0 ? (
                <div className="flex items-center gap-2">
                  {runner.last_5.map((pos, i) => (
                    <FormBadge key={i} position={pos} />
                  ))}
                  <span className="text-[11px] text-[#b0b7c3] ml-1">(5 dernieres courses)</span>
                </div>
              ) : runner.form ? (
                <p className="font-mono text-[13px] text-[#111318]">{runner.form}</p>
              ) : null}
            </section>
          ) : null}

          {/* Probas modele */}
          {(runner.model_prob_win != null || runner.model_prob_place != null) && (
            <section>
              <h4 className="text-xs font-bold text-[#8a919e] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Target size={12} />
                Probabilites modele
              </h4>
              <div className="space-y-3">
                {runner.model_prob_win != null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] text-[#8a919e]">P(Victoire)</span>
                      <span className="text-[13px] font-bold font-mono text-[#3b5bdb]">
                        {(runner.model_prob_win * 100).toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar value={runner.model_prob_win} color="#3b5bdb" />
                  </div>
                )}
                {runner.model_prob_place != null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] text-[#8a919e]">P(Place)</span>
                      <span className="text-[13px] font-bold font-mono text-[#059669]">
                        {(runner.model_prob_place * 100).toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar value={runner.model_prob_place} color="#059669" />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Edge */}
          {(runner.edge_win != null || runner.edge_place != null) && (
            <section>
              <h4 className="text-xs font-bold text-[#8a919e] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp size={12} />
                Edge
              </h4>
              <div className="space-y-2">
                {runner.edge_win != null && (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{
                      backgroundColor: edgeWin > 0 ? "#12b76a0f" : edgeWin < -0.03 ? "#f044380f" : "#f4f5f7",
                      border: `1px solid ${edgeWin > 0 ? "#12b76a30" : edgeWin < -0.03 ? "#f0443830" : "#e3e6eb"}`,
                    }}>
                    <span className="text-[12px] text-[#8a919e]">Edge victoire</span>
                    <span
                      className="text-[14px] font-bold font-mono"
                      style={{ color: edgeWin > 0 ? "#12b76a" : edgeWin < -0.03 ? "#f04438" : "#8a919e" }}
                    >
                      {edgeWin > 0 ? "+" : ""}{(edgeWin * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                {runner.edge_place != null && (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{
                      backgroundColor: edgePlace > 0 ? "#12b76a0f" : edgePlace < -0.03 ? "#f044380f" : "#f4f5f7",
                      border: `1px solid ${edgePlace > 0 ? "#12b76a30" : edgePlace < -0.03 ? "#f0443830" : "#e3e6eb"}`,
                    }}>
                    <span className="text-[12px] text-[#8a919e]">Edge place</span>
                    <span
                      className="text-[14px] font-bold font-mono"
                      style={{ color: edgePlace > 0 ? "#12b76a" : edgePlace < -0.03 ? "#f04438" : "#8a919e" }}
                    >
                      {edgePlace > 0 ? "+" : ""}{(edgePlace * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Stats cheval */}
          {(runner.horse_win_rate != null || runner.horse_place_rate != null || runner.horse_runs != null || runner.rest_days != null) && (
            <section>
              <h4 className="text-xs font-bold text-[#8a919e] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp size={12} />
                Stats cheval
              </h4>
              <div className="bg-[#f8f9fa] rounded-xl p-4 space-y-0">
                {runner.horse_win_rate != null && (
                  <StatRow label="Victoires" value={`${(runner.horse_win_rate * 100).toFixed(1)}%`} />
                )}
                {runner.horse_place_rate != null && (
                  <StatRow label="Places" value={`${(runner.horse_place_rate * 100).toFixed(1)}%`} />
                )}
                {runner.horse_runs != null && (
                  <StatRow label="Courses" value={runner.horse_runs} />
                )}
                {runner.rest_days != null && (
                  <StatRow label="Repos" value={`${runner.rest_days}j`} />
                )}
              </div>
            </section>
          )}

          {/* Stats jockey */}
          {runner.jockey && (
            <section>
              <h4 className="text-xs font-bold text-[#8a919e] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <User size={12} />
                Jockey — {runner.jockey}
              </h4>
              {(runner.jockey_win_rate != null || runner.jockey_place_rate != null || runner.jockey_runs != null) ? (
                <div className="bg-[#f8f9fa] rounded-xl p-4 space-y-0">
                  {runner.jockey_win_rate != null && (
                    <StatRow label="Victoires" value={`${(runner.jockey_win_rate * 100).toFixed(1)}%`} />
                  )}
                  {runner.jockey_place_rate != null && (
                    <StatRow label="Places" value={`${(runner.jockey_place_rate * 100).toFixed(1)}%`} />
                  )}
                  {runner.jockey_runs != null && (
                    <StatRow label="Courses" value={runner.jockey_runs} />
                  )}
                </div>
              ) : (
                <div className="bg-[#f8f9fa] rounded-xl p-4 text-[12px] text-[#8a919e] italic">
                  Statistiques non disponibles
                </div>
              )}
            </section>
          )}

          {/* Stats entraineur */}
          {runner.trainer && (
            <section>
              <h4 className="text-xs font-bold text-[#8a919e] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Award size={12} />
                Entraineur — {runner.trainer}
              </h4>
              {(runner.trainer_win_rate != null || runner.trainer_place_rate != null || runner.trainer_runs != null) ? (
                <div className="bg-[#f8f9fa] rounded-xl p-4 space-y-0">
                  {runner.trainer_win_rate != null && (
                    <StatRow label="Victoires" value={`${(runner.trainer_win_rate * 100).toFixed(1)}%`} />
                  )}
                  {runner.trainer_place_rate != null && (
                    <StatRow label="Places" value={`${(runner.trainer_place_rate * 100).toFixed(1)}%`} />
                  )}
                  {runner.trainer_runs != null && (
                    <StatRow label="Courses" value={runner.trainer_runs} />
                  )}
                </div>
              ) : (
                <div className="bg-[#f8f9fa] rounded-xl p-4 text-[12px] text-[#8a919e] italic">
                  Statistiques non disponibles
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </>
  );
}
