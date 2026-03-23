import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp, Clock, MapPin, Trophy, Target, Star, AlertCircle, BarChart3, Award, Users, Activity } from "lucide-react";
import type { PMURaceCard as PMURaceCardType, PMUTicketRecommendation, PMURunnerCard as PMURunnerCardType } from "@/types";

interface PMURaceCardProps {
  race: PMURaceCardType;
  expanded: boolean;
  onToggle: () => void;
  onSelectRunner?: (race: PMURaceCardType, runnerIndex: number) => void;
}

const RACE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  plat:         { label: "Plat",         color: "#3b5bdb", bg: "#3b5bdb0f", border: "#3b5bdb30" },
  trot_attele:  { label: "Trot attele",  color: "#059669", bg: "#0596690f", border: "#05966930" },
  trot_monte:   { label: "Trot monte",   color: "#0d9488", bg: "#0d94880f", border: "#0d948830" },
  obstacle:     { label: "Obstacle",     color: "#d97706", bg: "#d977060f", border: "#d9770630" },
};

function getRaceTypeConfig(raceType: string) {
  return RACE_TYPE_CONFIG[raceType.toLowerCase()] ?? RACE_TYPE_CONFIG[raceType] ?? { label: raceType, color: "#8a919e", bg: "#8a919e0f", border: "#8a919e30" };
}

function FormBadge({ position }: { position: number }) {
  if (position === 1) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-yellow-400 text-yellow-900">1</span>;
  if (position === 2) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-slate-300 text-slate-700">2</span>;
  if (position === 3) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-amber-600 text-white">3</span>;
  return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">{position}</span>;
}

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  base:       { bg: "bg-blue-100", text: "text-blue-700", label: "BASE" },
  complement: { bg: "bg-amber-100", text: "text-amber-700", label: "COMPL." },
  outsider:   { bg: "bg-purple-100", text: "text-purple-700", label: "OUTSIDER" },
  reserve:    { bg: "bg-slate-100", text: "text-slate-500", label: "RESERVE" },
};

const TICKET_ORDER = ["quinte", "quarte", "tierce", "2sur4", "simple_gagnant", "simple_place"];
const TICKET_ICONS: Record<string, React.ReactNode> = {
  quinte: <Trophy size={13} />,
  quarte: <Award size={13} />,
  tierce: <Target size={13} />,
  "2sur4": <Star size={13} />,
  simple_gagnant: <TrendingUp size={13} />,
  simple_place: <Activity size={13} />,
};
const TICKET_COLORS: Record<string, string> = {
  quinte: "#7c3aed",
  quarte: "#3b5bdb",
  tierce: "#059669",
  "2sur4": "#d97706",
  simple_gagnant: "#12b76a",
  simple_place: "#8a919e",
};

type TabKey = "recommandations" | "partants" | "formes" | "stats";

export default function PMURaceCard({ race, expanded, onToggle, onSelectRunner }: PMURaceCardProps) {
  const [hoveredRunner, setHoveredRunner] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("recommandations");
  const cfg = getRaceTypeConfig(race.race_type);

  const valueBetCount = race.runners.filter((r) => (r.edge_win ?? 0) > 0.02).length;
  const hasRecos = race.recommendations && race.recommendations.length > 0;

  const postTimeStr = race.post_time
    ? (() => { try { return new Date(race.post_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return race.post_time; } })()
    : null;

  const sortedRecos = [...(race.recommendations || [])].sort(
    (a, b) => TICKET_ORDER.indexOf(a.ticket_type) - TICKET_ORDER.indexOf(b.ticket_type)
  );

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "recommandations", label: "Pronostics", icon: <Target size={12} /> },
    { key: "partants", label: "Partants", icon: <Users size={12} /> },
    { key: "formes", label: "Formes", icon: <Activity size={12} /> },
    { key: "stats", label: "Stats", icon: <BarChart3 size={12} /> },
  ];

  return (
    <div
      className="bg-white rounded-xl border overflow-hidden transition-all"
      style={{
        borderColor: expanded ? cfg.border : "var(--border-color)",
        boxShadow: expanded ? `0 0 0 1px ${cfg.border}` : "0 1px 3px rgba(16,24,40,.06)",
      }}
    >
      {/* ── HEADER ── */}
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 transition-colors">
        <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
          {cfg.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-[#111318] truncate">{race.hippodrome}</span>
            <span className="text-[11px] font-semibold text-[#8a919e] shrink-0">R{race.race_number}</span>
            {race.is_quinteplus && (
              <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200">
                <Trophy size={9} /> Quinte+
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {postTimeStr && <span className="flex items-center gap-1 text-[11px] text-[#8a919e]"><Clock size={10} />{postTimeStr}</span>}
            <span className="flex items-center gap-1 text-[11px] text-[#8a919e]"><MapPin size={10} />{race.distance}m</span>
            {race.terrain && <span className="text-[11px] text-[#8a919e]">{race.terrain}</span>}
            <span className="text-[11px] text-[#8a919e]">{race.num_runners} partants</span>
            {valueBetCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#12b76a] bg-[#12b76a]/10 px-1.5 py-0.5 rounded-full border border-[#12b76a]/20">
                <TrendingUp size={9} /> {valueBetCount} value
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-[#b0b7c3]">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* ── EXPANDED CONTENT ── */}
      {expanded && (
        <div className="border-t border-[#f0f1f3]">
          {/* Analysis summary */}
          {race.analysis_summary && (
            <div className="px-4 py-2.5 bg-[#f8f9fa] border-b border-[#f0f1f3] flex items-start gap-2">
              <AlertCircle size={13} className="text-[#3b5bdb] shrink-0 mt-0.5" />
              <p className="text-[12px] text-[#3c4149]">{race.analysis_summary}</p>
            </div>
          )}

          {/* Tab navigation */}
          <div className="flex border-b border-[#f0f1f3] px-2 gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11.5px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-[#3b5bdb] text-[#3b5bdb]"
                    : "border-transparent text-[#8a919e] hover:text-[#3c4149]"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ── TAB: RECOMMANDATIONS ── */}
          {activeTab === "recommandations" && (
            <div className="p-3 space-y-3">
              {!hasRecos ? (
                <div className="py-6 text-center text-[12px] text-[#8a919e]">Aucune recommandation disponible pour cette course.</div>
              ) : (
                sortedRecos.map((reco, i) => (
                  <RecommendationCard key={i} reco={reco} raceColor={cfg.color} />
                ))
              )}
            </div>
          )}

          {/* ── TAB: PARTANTS ── */}
          {activeTab === "partants" && (
            <RunnersTable race={race} cfg={cfg} hoveredRunner={hoveredRunner} setHoveredRunner={setHoveredRunner} onSelectRunner={onSelectRunner} />
          )}

          {/* ── TAB: FORMES ── */}
          {activeTab === "formes" && (
            <div className="p-3 space-y-2">
              {race.runners.map((r, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#f8f9fa] border border-[#f0f1f3]">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: cfg.color }}>
                    {r.number}
                  </span>
                  <span className="text-[12px] font-semibold text-[#111318] min-w-[100px] truncate">{r.horse_name}</span>
                  <div className="flex items-center gap-1 flex-1">
                    {r.last_5 && r.last_5.length > 0 ? (
                      r.last_5.slice(0, 5).map((pos, j) => <FormBadge key={j} position={pos} />)
                    ) : r.form ? (
                      <span className="text-[11px] font-mono text-[#8a919e]">{r.form}</span>
                    ) : (
                      <span className="text-[11px] text-[#b0b7c3]">Pas de forme</span>
                    )}
                  </div>
                  {r.rest_days != null && (
                    <span className="text-[10px] text-[#8a919e] shrink-0">{r.rest_days}j repos</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: STATS ── */}
          {activeTab === "stats" && (
            <div className="p-3 space-y-2">
              {race.runners.filter(r => r.horse_runs || r.jockey_runs || r.trainer_runs).length === 0 ? (
                <div className="py-6 text-center text-[12px] text-[#8a919e]">Aucune statistique disponible.</div>
              ) : (
                race.runners.map((r, idx) => (
                  <RunnerStatsRow key={idx} runner={r} color={cfg.color} />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── RECOMMENDATION CARD ── */
function RecommendationCard({ reco, raceColor }: { reco: PMUTicketRecommendation; raceColor: string }) {
  const ticketColor = TICKET_COLORS[reco.ticket_type] ?? raceColor;
  const confPct = Math.round(reco.confidence * 100);
  const icon = TICKET_ICONS[reco.ticket_type] ?? <Target size={13} />;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: `${ticketColor}30` }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ backgroundColor: `${ticketColor}08` }}>
        <span style={{ color: ticketColor }}>{icon}</span>
        <span className="text-[13px] font-bold" style={{ color: ticketColor }}>{reco.label}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[#8a919e] uppercase">Confiance</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{
            backgroundColor: confPct >= 40 ? "#12b76a20" : confPct >= 20 ? "#f7920920" : "#f0443820",
            color: confPct >= 40 ? "#12b76a" : confPct >= 20 ? "#f79209" : "#f04438",
          }}>
            {confPct}%
          </span>
        </div>
      </div>

      {/* Picks */}
      <div className="px-3.5 py-2.5 space-y-1.5">
        {reco.picks.map((pick, i) => {
          const role = ROLE_STYLES[pick.role] ?? ROLE_STYLES.base;
          return (
            <div key={i} className="flex items-center gap-2.5 py-1">
              <span className="text-[13px] font-bold font-mono w-5 text-center" style={{ color: ticketColor }}>{i + 1}</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: ticketColor }}>
                {pick.number}
              </span>
              <span className="text-[12.5px] font-semibold text-[#111318] flex-1 truncate">{pick.horse_name}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${role.bg} ${role.text}`}>{role.label}</span>
              <span className="text-[11px] font-mono font-semibold text-[#3b5bdb] w-12 text-right">{(pick.prob * 100).toFixed(1)}%</span>
              {pick.odds != null && (
                <span className="text-[11px] font-mono text-[#8a919e] w-10 text-right">{pick.odds.toFixed(1)}</span>
              )}
              {pick.edge != null && pick.edge > 0 && (
                <span className="text-[10px] font-bold text-[#12b76a]">+{(pick.edge * 100).toFixed(1)}%</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Reserves */}
      {reco.reserves.length > 0 && (
        <div className="px-3.5 py-2 border-t border-dashed" style={{ borderColor: `${ticketColor}20` }}>
          <span className="text-[10px] font-semibold text-[#8a919e] uppercase tracking-wide">Remplacants</span>
          <div className="flex gap-3 mt-1">
            {reco.reserves.map((pick, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[11px] text-[#8a919e]">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500">{pick.number}</span>
                {pick.horse_name}
                <span className="font-mono text-[10px]">({(pick.prob * 100).toFixed(0)}%)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Comment */}
      {reco.comment && (
        <div className="px-3.5 py-2 border-t" style={{ borderColor: `${ticketColor}15`, backgroundColor: `${ticketColor}04` }}>
          <p className="text-[11px] text-[#3c4149] italic">{reco.comment}</p>
        </div>
      )}
    </div>
  );
}

/* ── RUNNERS TABLE ── */
function RunnersTable({ race, cfg, hoveredRunner, setHoveredRunner, onSelectRunner }: {
  race: PMURaceCardType;
  cfg: { color: string };
  hoveredRunner: number | null;
  setHoveredRunner: (v: number | null) => void;
  onSelectRunner?: (race: PMURaceCardType, idx: number) => void;
}) {
  if (race.runners.length === 0) {
    return <div className="px-4 py-6 text-center text-[12px] text-[#8a919e]">Aucun partant disponible</div>;
  }
  return (
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
              <tr key={idx} onMouseEnter={() => setHoveredRunner(idx)} onMouseLeave={() => setHoveredRunner(null)}
                className={`border-t border-[#f0f1f3] transition-colors ${isHovered ? "bg-slate-50" : isValue ? "bg-[#12b76a]/3" : ""}`}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: cfg.color }}>{runner.number}</span>
                </td>
                <td className="px-3 py-2">
                  <div>
                    <span className="font-semibold text-[#111318] text-[12px]">{runner.horse_name}</span>
                    {runner.trainer && <span className="block text-[10px] text-[#b0b7c3] hidden md:block truncate max-w-[120px]">{runner.trainer}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-[#8a919e] hidden md:table-cell">{runner.jockey ?? "-"}</td>
                <td className="px-3 py-2 text-right"><span className="font-mono font-semibold text-[#111318]">{runner.odds != null ? runner.odds.toFixed(1) : "-"}</span></td>
                <td className="px-3 py-2 text-right">
                  {runner.model_prob_win != null ? <span className="font-mono font-semibold" style={{ color: cfg.color }}>{(runner.model_prob_win * 100).toFixed(1)}%</span> : <span className="text-[#b0b7c3]">-</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {runner.model_prob_place != null ? <span className="font-mono text-[#8a919e]">{(runner.model_prob_place * 100).toFixed(1)}%</span> : <span className="text-[#b0b7c3]">-</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {runner.edge_win != null ? (
                    <span className="font-mono font-bold text-[12px]" style={{ color: edgeWin > 0 ? "var(--green)" : edgeWin < -0.03 ? "var(--red)" : "var(--text-muted)" }}>
                      {edgeWin > 0 ? "+" : ""}{(edgeWin * 100).toFixed(1)}%
                    </span>
                  ) : <span className="text-[#b0b7c3]">-</span>}
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  {runner.last_5 && runner.last_5.length > 0 ? (
                    <div className="flex items-center gap-0.5 justify-center">{runner.last_5.slice(0, 5).map((pos, i) => <FormBadge key={i} position={pos} />)}</div>
                  ) : runner.form ? <span className="text-[#8a919e] font-mono">{runner.form}</span> : <span className="text-[#b0b7c3]">-</span>}
                </td>
                <td className="px-3 py-2">
                  {onSelectRunner && (
                    <button onClick={() => onSelectRunner(race, idx)} className="w-6 h-6 rounded-md flex items-center justify-center text-[#8a919e] hover:text-[#3b5bdb] hover:bg-[#3b5bdb]/10 transition-colors" title="Voir le detail">
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
  );
}

/* ── RUNNER STATS ROW ── */
function RunnerStatsRow({ runner, color }: { runner: PMURunnerCardType; color: string }) {
  const stats = [
    runner.horse_runs != null && { label: "Courses", value: runner.horse_runs },
    runner.horse_win_rate != null && { label: "Win%", value: `${(runner.horse_win_rate * 100).toFixed(0)}%` },
    runner.horse_place_rate != null && { label: "Place%", value: `${(runner.horse_place_rate * 100).toFixed(0)}%` },
    runner.jockey_win_rate != null && { label: "Jockey Win%", value: `${(runner.jockey_win_rate * 100).toFixed(0)}%` },
    runner.trainer_win_rate != null && { label: "Entr. Win%", value: `${(runner.trainer_win_rate * 100).toFixed(0)}%` },
  ].filter(Boolean) as { label: string; value: string | number }[];

  if (stats.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f8f9fa] border border-[#f0f1f3]">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: color }}>{runner.number}</span>
      <span className="text-[12px] font-semibold text-[#111318] min-w-[90px] truncate">{runner.horse_name}</span>
      <div className="flex items-center gap-3 flex-wrap flex-1">
        {stats.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[10px] text-[#8a919e]">{s.label}</span>
            <span className="text-[11px] font-bold font-mono text-[#111318]">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
