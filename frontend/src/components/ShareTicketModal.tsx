import { useRef, useState, useCallback } from "react";
import { X, Download, Copy, Check, Trophy, TrendingUp } from "lucide-react";
import html2canvas from "html2canvas";
import type { Bet } from "@/types";

/* ═══════════════════════════════════════════════════════════
   ShareTicketModal — Génère une image PNG d'un ticket
   pour partager sur X / Instagram / Telegram
   ═══════════════════════════════════════════════════════════ */

interface Props {
  bet: Bet;
  comboLegs?: Bet[];        // Si combo, les autres legs
  open: boolean;
  onClose: () => void;
  pseudo?: string;          // @pseudo affiché sur la carte
}

// ── Design tokens ──
const GREEN = "#12b76a";
const RED   = "#f04438";
const AMBER = "#f79009";
const ACCENT = "#3b5bdb";

function resultColor(r: string) {
  if (r === "won") return GREEN;
  if (r === "lost") return RED;
  return AMBER;
}

function resultLabel(r: string) {
  if (r === "won") return "GAGNÉ";
  if (r === "lost") return "PERDU";
  if (r === "void") return "VOID";
  return "EN ATTENTE";
}

function resultEmoji(r: string) {
  if (r === "won") return "✅";
  if (r === "lost") return "❌";
  return "⏳";
}

function outcomeLabel(o: string) {
  if (o === "H" || o === "home") return "Domicile";
  if (o === "D" || o === "draw") return "Nul";
  if (o === "A" || o === "away") return "Extérieur";
  return o;
}

function sportIcon(sport: string) {
  return sport === "tennis" ? "🎾" : "⚽";
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
}

export default function ShareTicketModal({ bet, comboLegs, open, onClose, pseudo }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const isCombo = !!(comboLegs && comboLegs.length > 0);
  const allLegs = isCombo ? [bet, ...comboLegs] : [bet];
  const combinedOdds = isCombo ? allLegs.reduce((a, l) => a * l.odds_at_bet, 1) : bet.odds_at_bet;

  const generateImage = useCallback(async () => {
    if (!cardRef.current) return null;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        logging: false,
      });
      return canvas;
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    const canvas = await generateImage();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `bettracker-ticket-${bet.id}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [generateImage, bet.id]);

  const handleCopy = useCallback(async () => {
    const canvas = await generateImage();
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      // Fallback: download if clipboard not available
      handleDownload();
    }
  }, [generateImage, handleDownload]);

  if (!open) return null;

  const pnl = bet.profit_loss;
  const pnlStr = pnl != null ? (pnl >= 0 ? `+${pnl.toFixed(2)}€` : `${pnl.toFixed(2)}€`) : null;
  const roi = pnl != null && bet.stake > 0 ? ((pnl / bet.stake) * 100) : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[9998] animate-fade-in" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-[440px] w-full max-h-[90vh] overflow-y-auto animate-scale-in">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e3e6eb]">
            <div className="text-[15px] font-bold text-[#111318]">Partager ce ticket</div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f4f5f7] transition-colors cursor-pointer">
              <X size={18} className="text-[#8a919e]" />
            </button>
          </div>

          {/* Card preview */}
          <div className="p-5">
            {/* ══════════════════════════════════════════
                THE SHAREABLE CARD (captured by html2canvas)
                ══════════════════════════════════════════ */}
            <div ref={cardRef} style={{
              width: 380, padding: 0, borderRadius: 16,
              overflow: "hidden", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            }}>
              {/* Top gradient bar */}
              <div style={{
                background: "linear-gradient(135deg, #3b5bdb 0%, #7c3aed 100%)",
                padding: "16px 20px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: "rgba(255,255,255,0.2)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 800, color: "#fff",
                  }}>BT</div>
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: -0.3 }}>
                    BetTracker
                  </span>
                </div>
                {pseudo && (
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5, fontWeight: 500 }}>
                    {pseudo}
                  </span>
                )}
              </div>

              {/* Body */}
              <div style={{ background: "#fff", padding: "16px 20px 20px" }}>

                {/* Tag + Date */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: isCombo ? "rgba(124,58,237,0.08)" : "rgba(59,91,219,0.08)",
                    color: isCombo ? "#7c3aed" : ACCENT,
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    {isCombo ? `COMBI ${allLegs.length} LEGS` : (bet.source === "algo" ? "ALGO" : bet.source === "scanner" ? "SCANNER" : "MANUEL")}
                  </div>
                  <span style={{ color: "#8a919e", fontSize: 11, fontWeight: 500 }}>
                    {fmtDate(bet.match_date)}
                  </span>
                </div>

                {/* Legs */}
                {allLegs.map((leg, i) => (
                  <div key={i} style={{
                    background: "#f8f9fb", borderRadius: 10, padding: "10px 14px",
                    marginBottom: i < allLegs.length - 1 ? 8 : 0,
                    border: "1px solid #eef0f3",
                  }}>
                    {/* Sport + League */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                      <span style={{ fontSize: 12 }}>{sportIcon(leg.sport)}</span>
                      <span style={{ color: "#8a919e", fontSize: 10.5, fontWeight: 500 }}>
                        {leg.league}
                      </span>
                    </div>
                    {/* Teams */}
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111318", marginBottom: 5 }}>
                      {leg.home_team} – {leg.away_team}
                    </div>
                    {/* Outcome + Odds */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        background: "rgba(59,91,219,0.1)", color: ACCENT,
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
                      }}>
                        {outcomeLabel(leg.outcome_bet)}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: "#111318",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        @{leg.odds_at_bet.toFixed(2)}
                      </span>
                      {isCombo && leg.result && leg.result !== "pending" && (
                        <span style={{ fontSize: 12 }}>{resultEmoji(leg.result)}</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Divider */}
                <div style={{ borderTop: "1px dashed #e3e6eb", margin: "14px 0" }} />

                {/* Bottom summary */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {/* Left: Odds + Stake */}
                  <div>
                    {isCombo && (
                      <div style={{ fontSize: 11, color: "#8a919e", fontWeight: 500, marginBottom: 2 }}>
                        Cote combinée
                      </div>
                    )}
                    <div style={{
                      fontSize: 18, fontWeight: 800, color: "#111318",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      @{combinedOdds.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: "#8a919e", fontWeight: 500, marginTop: 2 }}>
                      Mise : {bet.stake.toFixed(2)}€
                    </div>
                  </div>

                  {/* Right: Result */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: `${resultColor(bet.result)}14`,
                      color: resultColor(bet.result),
                      fontSize: 13, fontWeight: 700, padding: "5px 14px", borderRadius: 8,
                    }}>
                      {resultEmoji(bet.result)} {resultLabel(bet.result)}
                    </div>
                    {pnlStr && (
                      <div style={{
                        fontSize: 14, fontWeight: 700, marginTop: 4,
                        color: (pnl ?? 0) >= 0 ? GREEN : RED,
                        fontFamily: "'JetBrains Mono', monospace",
                        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
                      }}>
                        {(pnl ?? 0) >= 0 ? <TrendingUp size={13} /> : null}
                        {pnlStr}
                        {roi != null && (
                          <span style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.7 }}>
                            ({roi >= 0 ? "+" : ""}{roi.toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Edge badge (if available) */}
                {bet.edge_at_bet != null && bet.edge_at_bet > 0 && (
                  <div style={{
                    marginTop: 10, display: "flex", alignItems: "center", gap: 5,
                    fontSize: 10.5, color: GREEN, fontWeight: 600,
                  }}>
                    <Trophy size={11} /> Edge détecté : +{(bet.edge_at_bet * 100).toFixed(1)}%
                  </div>
                )}
              </div>

              {/* Footer watermark */}
              <div style={{
                background: "#f8f9fb", borderTop: "1px solid #eef0f3",
                padding: "8px 20px", display: "flex", alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={{ color: "#b0b7c3", fontSize: 10, fontWeight: 500 }}>
                  bettracker.fr
                </span>
                <span style={{ color: "#b0b7c3", fontSize: 10, fontWeight: 500 }}>
                  Détection IA de value bets
                </span>
              </div>
            </div>
            {/* ══ END CARD ══ */}
          </div>

          {/* Action buttons */}
          <div className="px-5 pb-5 flex gap-3">
            <button
              onClick={handleDownload}
              disabled={generating}
              className="flex-1 py-2.5 rounded-xl bg-[#3b5bdb] text-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#2b4bc9] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              {generating ? "Génération..." : "Télécharger PNG"}
            </button>
            <button
              onClick={handleCopy}
              disabled={generating}
              className="flex-1 py-2.5 rounded-xl border-[1.5px] border-[rgba(59,91,219,.25)] text-[#3b5bdb] text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[rgba(59,91,219,.07)] transition-colors cursor-pointer disabled:opacity-50"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copié !" : "Copier l'image"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
