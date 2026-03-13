import { forwardRef } from "react";
import type { Bet } from "@/types";
import { LEAGUE_INFO } from "@/types";
import { outcomeLabel } from "@/utils/campaign";
import { formatOdds } from "@/utils/odds";

// ── Helpers ──

function formatMatch(bet: Bet): string {
  if (bet.sport === "tennis") {
    return `${bet.home_team} vs ${bet.away_team}`;
  }
  return `${bet.home_team} vs ${bet.away_team}`;
}

function formatSportBadge(bet: Bet): string {
  const sport = bet.sport ?? "football";
  const leagueInfo = LEAGUE_INFO[bet.league];
  const leagueName = leagueInfo?.name ?? bet.league ?? "";

  if (sport === "tennis") {
    return `ATP · ${leagueName}`;
  }
  if (sport === "basketball") {
    return `NBA · ${leagueName}`;
  }
  return leagueName;
}

function formatOutcomeLabel(bet: Bet): string {
  return outcomeLabel(bet.outcome_bet);
}

function formatDate(dateStr: string): string {
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function calcRoi(bet: Bet): string {
  if (bet.profit_loss == null || bet.stake == null || bet.stake === 0) return "—";
  const roi = (bet.profit_loss / bet.stake) * 100;
  return `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% ROI`;
}

// ── Props ──

export interface TicketShareCardProps {
  bet: Bet;
  pseudo: string;
  showStake: boolean;
  showGainEuros: boolean;
  showBookmaker: boolean;
  showClv: boolean;
  currSymbol: string;
  oddsFormat: string;
}

// ── Component ──
// forwardRef permet la capture PNG via html-to-image

const TicketShareCard = forwardRef<HTMLDivElement, TicketShareCardProps>(
  function TicketShareCard(
    { bet, pseudo, showStake, showGainEuros, showBookmaker, showClv, currSymbol, oddsFormat },
    ref
  ) {
    const isWon = bet.result === "won";
    const isLost = bet.result === "lost";
    const isPending = bet.result === "pending";

    const resultBg = isWon
      ? "rgba(18,183,106,0.15)"
      : isLost
      ? "rgba(240,68,56,0.13)"
      : "rgba(59,91,219,0.12)";
    const resultBorder = isWon
      ? "rgba(18,183,106,0.25)"
      : isLost
      ? "rgba(240,68,56,0.2)"
      : "rgba(59,91,219,0.25)";
    const resultColor = isWon ? "#4ade80" : isLost ? "#f87171" : "#7eb8ff";

    const resultLabel = isWon ? "Gagne" : isLost ? "Perdu" : "En cours";
    const resultIcon = isWon ? "+" : isLost ? "-" : "~";

    const gainDisplay = (() => {
      if (isPending) {
        const potential = bet.stake * (bet.odds_at_bet - 1);
        return `+${potential.toFixed(2)} ${currSymbol} potentiel`;
      }
      if (bet.profit_loss == null) return "—";
      if (showGainEuros) {
        return `${bet.profit_loss >= 0 ? "+" : ""}${bet.profit_loss.toFixed(2)} ${currSymbol}`;
      }
      return calcRoi(bet);
    })();

    const edgeDisplay =
      bet.edge_at_bet != null
        ? `${bet.edge_at_bet >= 0 ? "+" : ""}${(bet.edge_at_bet * 100).toFixed(1)}%`
        : null;

    const clvDisplay =
      bet.clv != null
        ? `${bet.clv >= 0 ? "+" : ""}${(bet.clv * 100).toFixed(1)}%`
        : null;

    const leagueInfo = LEAGUE_INFO[bet.league];
    const leagueFlag = leagueInfo?.flag ?? "";

    // Nombre de colonnes dans la grille de stats
    const statCols = showClv && clvDisplay ? 3 : edgeDisplay ? 2 : 1;

    const subtitleParts: string[] = [];
    if (formatOutcomeLabel(bet)) subtitleParts.push(formatOutcomeLabel(bet));
    if (showBookmaker && bet.bookmaker) subtitleParts.push(bet.bookmaker);
    subtitleParts.push(formatDate(bet.match_date));

    return (
      <div
        ref={ref}
        style={{
          background: "linear-gradient(145deg, #0f172a, #1a2540)",
          borderRadius: "12px",
          padding: "18px 20px",
          color: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          width: "280px",
          fontFamily: "Plus Jakarta Sans, sans-serif",
        }}
      >
        {/* Sport / League badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "10px",
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "6px",
            background: "rgba(59,91,219,0.3)",
            color: "#7eb8ff",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "12px",
          }}
        >
          {leagueFlag && <span>{leagueFlag}</span>}
          <span>{formatSportBadge(bet)}</span>
        </div>

        {/* Match */}
        <div style={{ fontSize: "16px", fontWeight: 800, marginBottom: "2px", letterSpacing: "-0.01em" }}>
          {formatMatch(bet)}
        </div>

        {/* Subtitle: issue, bookmaker, date */}
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginBottom: "12px" }}>
          {subtitleParts.join(" · ")}
        </div>

        {/* Mise */}
        {showStake && (
          <div
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.5)",
              marginBottom: "8px",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            Mise : {bet.stake.toFixed(2)} {currSymbol}
          </div>
        )}

        {/* Stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${statCols}, 1fr)`,
            gap: "6px",
            marginBottom: "12px",
          }}
        >
          {/* Cote */}
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: "6px",
              padding: "8px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {formatOdds(bet.odds_at_bet, oddsFormat)}
            </div>
            <div style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.4)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Cote
            </div>
          </div>

          {/* Edge */}
          {edgeDisplay && (
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: "6px",
                padding: "8px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 800,
                  fontFamily: "JetBrains Mono, monospace",
                  color: "#4ade80",
                }}
              >
                {edgeDisplay}
              </div>
              <div style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.4)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Edge
              </div>
            </div>
          )}

          {/* CLV */}
          {showClv && clvDisplay && (
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: "6px",
                padding: "8px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 800,
                  fontFamily: "JetBrains Mono, monospace",
                  color: bet.clv! >= 0 ? "#4ade80" : "#f87171",
                }}
              >
                {clvDisplay}
              </div>
              <div style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.4)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                CLV
              </div>
            </div>
          )}
        </div>

        {/* Result */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: "7px",
            marginBottom: "12px",
            background: resultBg,
            border: `1px solid ${resultBorder}`,
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: 700, color: resultColor }}>
            {resultIcon} {resultLabel}
          </span>
          <span
            style={{
              fontSize: "17px",
              fontWeight: 800,
              fontFamily: "JetBrains Mono, monospace",
              color: resultColor,
            }}
          >
            {gainDisplay}
          </span>
        </div>

        {/* Footer: pseudo + watermark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingTop: "10px",
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>
            {pseudo || "BetTracker"}
          </span>
          <span style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "-0.01em", color: "rgba(255,255,255,0.3)" }}>
            Bet<span style={{ color: "#4f8cff" }}>Tracker</span>
          </span>
        </div>
      </div>
    );
  }
);

export default TicketShareCard;
