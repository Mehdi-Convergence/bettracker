import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp, Clock, MapPin, Trophy } from "lucide-react";
import type { PMURaceCard as PMURaceCardType } from "@/types";

interface PMURaceCardProps {
  race: PMURaceCardType;
  expanded: boolean;
  onToggle: () => void;
  onSelectRunner?: (race: PMURaceCardType, runnerIndex: number) => void;
}

const RACE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  Plat:      { label: "Plat",      color: "#3b5bdb", bg: "#3b5bdb0f", border: "#3b5bdb30" },
  Trot:      { label: "Trot",      color: "#059669", bg: "#0596690f", border: "#05966930" },
  Obstacle:  { label: "Obstacle",  color: "#d97706", bg: "#d977060f", border: "#d9770630" },
  Galop:     { label: "Galop",     color: "#3b5bdb", bg: "#3b5bdb0f", border: "#3b5bdb30" },
};

function getRaceTypeConfig(raceType: string) {
  return RACE_TYPE_CONFIG[raceType] ?? { label: raceType, color: "#8a919e", bg: "#8a919e0f", border: "#8a919e30" };
}

function FormBadge({ position }: { position: number }) {
  if (position === 1) return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-yellow-400 text-yellow-900">1</span>
  );
  if (position === 2) return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-slate-300 text-slate-700">2</span>
  );
  if (position === 3) return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-amber-600 text-white">3</span>
  );
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">{position}</span>
  );
}

export default function PMURaceCard({ race, expanded, onToggle, onSelectRunner }: PMURaceCardProps) {
  const [hoveredRunner, setHoveredRunner] = useState<number | null>(null);
  const cfg = getRaceTypeConfig(race.race_type);

  const valueBetCount = race.runners.filter((r) => (r.edge_win ?? 0) > 0).length;

  const postTimeStr = race.post_time
    ? (() => {
        try {
          const d = new Date(race.post_time);
          return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        } catch {
          return race.post_time;
        }
      })()
    : null;

  return (
    <div
      className="bg-white rounded-xl border overflow-hidden transition-all"
      style={{
        borderColor: expanded ? cfg.border : "#e3e6eb",
        boxShadow: expanded ? `0 0 0 1px ${cfg.border}` : "0 1px 3px rgba(16,24,40,.06)",
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 transition-colors"
      >
        {/* Race type badge */}
        <span
          className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold"
          style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
          {cfg.label}
        </span>

        {/* Hippodrome + race number */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-[#111318] truncate">{race.hippodrome}</span>
            <span className="text-[11px] font-semibold text-[#8a919e] shrink-0">R{race.race_number}</span>
            {race.is_quinteplus && (
              <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200">
                <Trophy size={9} />
                Quinte+
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {postTimeStr && (
              <span className="flex items-center gap-1 text-[11px] text-[#8a919e]">
                <Clock size={10} />
                {postTimeStr}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] text-[#8a919e]">
              <MapPin size={10} />
              {race.distance}m
            </span>
            {race.terrain && (
              <span className="text-[11px] text-[#8a919e]">{race.terrain}</span>
            )}
            <span className="text-[11px] text-[#8a919e]">{race.num_runners} partants</span>
            {valueBetCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#12b76a] bg-[#12b76a]/10 px-1.5 py-0.5 rounded-full border border-[#12b76a]/20">
                <TrendingUp size={9} />
                {valueBetCount} value
              </span>
            )}
          </div>
        </div>

        {/* Expand icon */}
        <div className="shrink-0 text-[#b0b7c3]">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* Runners table */}
      {expanded && (
        <div className="border-t border-[#f0f1f3]">
          {race.runners.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-[#8a919e]">
              Aucun partant disponible
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="bg-[#f8f9fa] text-[#8a919e] text-[10.5px] font-semibold uppercase tracking-[0.06em]">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left">Cheval</th>
                    <th className="px-3 py-2 text-left hidden md:table-cell">Jockey</th>
                    <th className="px-3 py-2 text-right">Cote</th>
                    <th className="px-3 py-2 text-right">P(Win)</th>
                    <th className="px-3 py-2 text-right">P(Place)</th>
                    <th className="px-3 py-2 text-right">Edge</th>
                    <th className="px-3 py-2 text-center hidden sm:table-cell">Forme</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {race.runners.map((runner, idx) => {
                    const edgeWin = runner.edge_win ?? 0;
                    const isValue = edgeWin > 0;
                    const isHovered = hoveredRunner === idx;

                    return (
                      <tr
                        key={idx}
                        onMouseEnter={() => setHoveredRunner(idx)}
                        onMouseLeave={() => setHoveredRunner(null)}
                        className={`border-t border-[#f0f1f3] transition-colors ${
                          isHovered ? "bg-slate-50" : isValue ? "bg-[#12b76a]/3" : ""
                        }`}
                      >
                        {/* Numéro */}
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: cfg.color }}>
                            {runner.number}
                          </span>
                        </td>

                        {/* Cheval */}
                        <td className="px-3 py-2">
                          <div>
                            <span className="font-semibold text-[#111318] text-[12px]">{runner.horse_name}</span>
                            {runner.trainer && (
                              <span className="block text-[10px] text-[#b0b7c3] hidden md:block truncate max-w-[120px]">
                                {runner.trainer}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Jockey */}
                        <td className="px-3 py-2 text-[#8a919e] hidden md:table-cell">
                          {runner.jockey ?? "-"}
                        </td>

                        {/* Cote */}
                        <td className="px-3 py-2 text-right">
                          <span className="font-mono font-semibold text-[#111318]">
                            {runner.odds != null ? runner.odds.toFixed(1) : "-"}
                          </span>
                        </td>

                        {/* P(Win) */}
                        <td className="px-3 py-2 text-right">
                          {runner.model_prob_win != null ? (
                            <span className="font-mono font-semibold" style={{ color: cfg.color }}>
                              {(runner.model_prob_win * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[#b0b7c3]">-</span>
                          )}
                        </td>

                        {/* P(Place) */}
                        <td className="px-3 py-2 text-right">
                          {runner.model_prob_place != null ? (
                            <span className="font-mono text-[#8a919e]">
                              {(runner.model_prob_place * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[#b0b7c3]">-</span>
                          )}
                        </td>

                        {/* Edge */}
                        <td className="px-3 py-2 text-right">
                          {runner.edge_win != null ? (
                            <span
                              className="font-mono font-bold text-[12px]"
                              style={{ color: edgeWin > 0 ? "#12b76a" : edgeWin < -0.03 ? "#f04438" : "#8a919e" }}
                            >
                              {edgeWin > 0 ? "+" : ""}{(edgeWin * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[#b0b7c3]">-</span>
                          )}
                        </td>

                        {/* Forme */}
                        <td className="px-3 py-2 hidden sm:table-cell">
                          {runner.last_5 && runner.last_5.length > 0 ? (
                            <div className="flex items-center gap-0.5 justify-center">
                              {runner.last_5.slice(0, 5).map((pos, i) => (
                                <FormBadge key={i} position={pos} />
                              ))}
                            </div>
                          ) : runner.form ? (
                            <span className="text-[#8a919e] font-mono">{runner.form}</span>
                          ) : (
                            <span className="text-[#b0b7c3]">-</span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="px-3 py-2">
                          {onSelectRunner && (
                            <button
                              onClick={() => onSelectRunner(race, idx)}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[#8a919e] hover:text-[#3b5bdb] hover:bg-[#3b5bdb]/10 transition-colors"
                              title="Voir le detail"
                            >
                              <ChevronRight size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
