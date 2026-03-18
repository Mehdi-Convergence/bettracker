import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { AIScanMatch } from "@/types";
import { getTabs, type Tab } from "./match-detail/MatchDetailCommon";
import FootballMatchDetail from "./match-detail/FootballMatchDetail";
import TennisMatchDetail from "./match-detail/TennisMatchDetail";
import NBAMatchDetail from "./match-detail/NBAMatchDetail";
import RugbyMatchDetail from "./match-detail/RugbyMatchDetail";
import MLBMatchDetail from "./match-detail/MLBMatchDetail";

interface Props {
  am: AIScanMatch;
  home: string;
  away: string;
  onClose: () => void;
  inline?: boolean;
}

export default function AIScanMatchDetailPanel({ am, home, away, onClose, inline }: Props) {
  const [tab, setTab] = useState<Tab>("analyse");
  const isTennis = am.sport === "tennis";
  const isMLB = am.sport === "mlb";
  const tabs = getTabs(am.sport ?? "football");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const dateStr = am.date
    ? new Date(am.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  function renderSportContent() {
    const props = { am, home, away, tab };
    switch (am.sport) {
      case "tennis": return <TennisMatchDetail {...props} />;
      case "nba": return <NBAMatchDetail {...props} />;
      case "mlb": return <MLBMatchDetail {...props} />;
      case "rugby": return <RugbyMatchDetail {...props} />;
      default: return <FootballMatchDetail {...props} />;
    }
  }

  return (
    <>
      {!inline && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}
      <div className={inline
        ? "w-full h-full bg-[var(--bg-card)] border-l flex flex-col shadow-xl" + " border-[var(--border-color)]"
        : "fixed right-0 top-0 h-full w-full max-w-2xl bg-[var(--bg-card)] border-l border-[var(--border-color)] z-50 flex flex-col shadow-2xl"
      }>

        {/* Header */}
        <div className="shrink-0 px-4 sm:px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: "var(--border-color)" }}>
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="text-base sm:text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{home} vs {away}</h3>
            <p className="text-xs sm:text-sm mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>
              {am.league} &bull; {dateStr}
              {am.venue && <span style={{ color: "var(--text-muted)" }}> &bull; {am.venue}</span>}
              {isTennis && am.surface && <span style={{ color: "var(--text-muted)" }}> &bull; {am.surface}</span>}
              {isTennis && am.round && <span style={{ color: "var(--text-muted)" }}> &bull; {am.round}</span>}
              {isMLB && <span style={{ color: "var(--text-muted)" }}> &bull; Baseball</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 mt-1 rounded-lg hover:bg-[var(--bg-surface)] transition-colors" style={{ color: "var(--text-muted)" }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 bg-[var(--bg-card)] px-5 flex gap-1 pt-1 overflow-x-auto">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap border-b-2 ${
                tab === key
                  ? "text-blue-600 border-blue-500 bg-blue-50/60"
                  : "border-transparent hover:bg-[var(--bg-surface)]"
              }`}
              style={tab === key ? {} : { color: "var(--text-muted)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="shrink-0 h-px mx-0" style={{ background: "var(--border-color)" }} />

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {renderSportContent()}
        </div>
      </div>
    </>
  );
}
