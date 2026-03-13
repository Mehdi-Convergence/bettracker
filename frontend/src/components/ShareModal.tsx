import { useRef, useState, useCallback } from "react";
import { X, Copy, Download, Check } from "lucide-react";
import { toPng } from "html-to-image";
import type { Bet } from "@/types";
import { usePreferences } from "@/contexts/PreferencesContext";
import { getCurrencySymbol } from "@/utils/currency";
import { Toggle } from "@/components/ui";
import TicketShareCard from "@/components/TicketShareCard";
import { outcomeLabel } from "@/utils/campaign";
import { formatOdds } from "@/utils/odds";

// ── Design tokens ──
const C = {
  border: "#e3e6eb",
  border2: "#cdd1d9",
  text: "#111318",
  text2: "#3c4149",
  muted: "#8a919e",
  muted2: "#b0b7c3",
  accent: "#3b5bdb",
  accentBg: "rgba(59,91,219,0.07)",
  accentBd: "rgba(59,91,219,0.18)",
  bg: "#f4f5f7",
};

const inputCls =
  "w-full py-2 px-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg text-[13px] text-[#111318] outline-none transition-all focus:border-[#3b5bdb] focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,91,219,0.07)] placeholder:text-[#b0b7c3]";

function buildTweetText(bet: Bet, showGainEuros: boolean, currSymbol: string, oddsFormat: string): string {
  const match = `${bet.home_team} vs ${bet.away_team}`;
  const outcome = outcomeLabel(bet.outcome_bet);
  const odds = formatOdds(bet.odds_at_bet, oddsFormat);
  const isWon = bet.result === "won";
  const isLost = bet.result === "lost";

  const lines: string[] = [];

  if (isWon) {
    lines.push(`Gagne : ${match} — ${outcome} @ ${odds}`);
  } else if (isLost) {
    lines.push(`Perdu : ${match} — ${outcome} @ ${odds}`);
  } else {
    lines.push(`${match} — ${outcome} @ ${odds}`);
  }

  if (bet.edge_at_bet != null) {
    const edge = `Edge : +${(bet.edge_at_bet * 100).toFixed(1)}%`;
    const clv = bet.clv != null ? ` | CLV : ${bet.clv >= 0 ? "+" : ""}${(bet.clv * 100).toFixed(1)}%` : "";
    lines.push(edge + clv);
  }

  if (bet.profit_loss != null && (isWon || isLost)) {
    if (showGainEuros) {
      lines.push(`${bet.profit_loss >= 0 ? "+" : ""}${bet.profit_loss.toFixed(2)} ${currSymbol}`);
    } else if (bet.stake > 0) {
      const roi = (bet.profit_loss / bet.stake) * 100;
      lines.push(`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% ROI`);
    }
  }

  lines.push("");
  lines.push("#ValueBetting #BetTracker");

  return lines.join("\n");
}

// ── Props ──

interface ShareModalProps {
  bet: Bet;
  onClose: () => void;
}

// ── Component ──

export default function ShareModal({ bet, onClose }: ShareModalProps) {
  const { prefs } = usePreferences();
  const currSymbol = getCurrencySymbol(prefs.currency ?? "EUR");
  const oddsFormat = prefs.odds_format ?? "decimal";

  // Local toggles (n'affectent pas les settings globaux)
  const [localPseudo, setLocalPseudo] = useState<string>(
    prefs.share_pseudo || ""
  );
  const [localShowStake, setLocalShowStake] = useState(prefs.share_show_stake ?? false);
  const [localShowGainEuros, setLocalShowGainEuros] = useState(prefs.share_show_gain_euros ?? true);
  const [localShowBookmaker, setLocalShowBookmaker] = useState(prefs.share_show_bookmaker ?? true);
  const [localShowClv, setLocalShowClv] = useState(prefs.share_show_clv ?? true);

  const cardRef = useRef<HTMLDivElement>(null);

  // Status des actions
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const generatePng = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      return await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: undefined,
      });
    } catch {
      return null;
    }
  }, []);

  const handleCopy = useCallback(async () => {
    setCopying(true);
    const dataUrl = await generatePng();
    if (!dataUrl) {
      setCopying(false);
      return;
    }
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencieux — clipboard API non supportee ou permissions refusees
    } finally {
      setCopying(false);
    }
  }, [generatePng]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    const dataUrl = await generatePng();
    if (!dataUrl) {
      setDownloading(false);
      return;
    }
    const slug = `${bet.home_team}-vs-${bet.away_team}`.replace(/\s+/g, "-").toLowerCase();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `bettracker-${slug}.png`;
    a.click();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
    setDownloading(false);
  }, [generatePng, bet]);

  const handleShareX = useCallback(() => {
    const text = buildTweetText(bet, localShowGainEuros, currSymbol, oddsFormat);
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [bet, localShowGainEuros, currSymbol, oddsFormat]);

  const tweetPreview = buildTweetText(bet, localShowGainEuros, currSymbol, oddsFormat);

  const matchLabel = `${bet.home_team} vs ${bet.away_team}`;
  const outcomeAndOdds = `${outcomeLabel(bet.outcome_bet)} @ ${formatOdds(bet.odds_at_bet, oddsFormat)}`;

  const options = [
    {
      label: "Afficher la mise",
      desc: null,
      value: localShowStake,
      onChange: setLocalShowStake,
    },
    {
      label: "Afficher le gain en euros",
      desc: "Si desactive : % ROI uniquement",
      value: localShowGainEuros,
      onChange: setLocalShowGainEuros,
    },
    {
      label: "Afficher le bookmaker",
      desc: null,
      value: localShowBookmaker,
      onChange: setLocalShowBookmaker,
    },
    {
      label: "Afficher le CLV",
      desc: null,
      value: localShowClv,
      onChange: setLocalShowClv,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[2px]"
      style={{ background: "rgba(10,13,20,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-[720px] max-w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col animate-fade-up">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e3e6eb] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-[#111318]">Partager ce ticket</h3>
            <div className="text-[12px] text-[#8a919e] mt-0.5">
              {matchLabel} · {outcomeAndOdds}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-lg border-none bg-transparent cursor-pointer text-[#8a919e] hover:bg-[#f4f5f7] hover:text-[#111318] transition-all flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex gap-5 flex-1 flex-wrap">
          {/* Preview + tweet text */}
          <div className="shrink-0 w-[280px]">
            <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2.5">
              Apercu
            </div>
            <TicketShareCard
              ref={cardRef}
              bet={bet}
              pseudo={localPseudo}
              showStake={localShowStake}
              showGainEuros={localShowGainEuros}
              showBookmaker={localShowBookmaker}
              showClv={localShowClv}
              currSymbol={currSymbol}
              oddsFormat={oddsFormat}
            />

            {/* Tweet preview */}
            <div className="mt-2.5 p-3 bg-[#f4f5f7] border border-[#e3e6eb] rounded-lg">
              <div className="text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-1.5">
                Texte X/Twitter
              </div>
              <div className="text-[12px] text-[#3c4149] leading-relaxed whitespace-pre-wrap">
                {tweetPreview}
              </div>
            </div>
          </div>

          {/* Options + Actions */}
          <div className="flex-1 min-w-[220px] flex flex-col gap-4">
            {/* Options */}
            <div>
              <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-1">
                Options pour ce partage
              </div>
              <div className="text-[11.5px] text-[#8a919e] mb-2">
                Modifiables a la volee, sans changer vos parametres globaux
              </div>
              <div className="border border-[#e3e6eb] rounded-[10px] overflow-hidden">
                {options.map((opt) => (
                  <div
                    key={opt.label}
                    className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#e3e6eb] last:border-b-0"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-[#111318]">{opt.label}</div>
                      {opt.desc && (
                        <div className="text-[11px] text-[#8a919e] mt-0.5">{opt.desc}</div>
                      )}
                    </div>
                    <Toggle checked={opt.value} onChange={opt.onChange} />
                  </div>
                ))}
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#f4f5f7]">
                  <div>
                    <div className="text-[13px] font-medium text-[#111318]">Watermark BetTracker</div>
                    <div className="text-[11px] text-[#8a919e] mt-0.5">Toujours present</div>
                  </div>
                  <Toggle checked={true} onChange={() => {}} disabled />
                </div>
              </div>
            </div>

            {/* Pseudo */}
            <div>
              <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
                Pseudo affiche
              </div>
              <input
                type="text"
                value={localPseudo}
                onChange={(e) => setLocalPseudo(e.target.value)}
                placeholder="@votre_pseudo"
                className={inputCls}
              />
            </div>

            {/* Actions */}
            <div>
              <div className="text-[11px] font-bold text-[#b0b7c3] uppercase tracking-wider mb-2">
                Actions
              </div>
              <div className="grid grid-cols-3 gap-2">
                {/* Copier */}
                <button
                  onClick={handleCopy}
                  disabled={copying}
                  className="p-2.5 rounded-[9px] border-[1.5px] border-[#e3e6eb] bg-transparent cursor-pointer flex flex-col items-center gap-1.5 transition-all hover:border-[rgba(59,91,219,0.18)] hover:bg-[rgba(59,91,219,0.07)] disabled:opacity-60"
                >
                  {copied ? (
                    <Check size={18} style={{ color: "#12b76a" }} />
                  ) : (
                    <Copy size={18} style={{ color: C.muted }} />
                  )}
                  <span className="text-[12px] font-semibold text-[#3c4149]">
                    {copied ? "Copie !" : "Copier l'image"}
                  </span>
                  <span className="text-[10.5px] text-[#8a919e]">PNG presse-papier</span>
                </button>

                {/* Telecharger */}
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="p-2.5 rounded-[9px] border-[1.5px] border-[#e3e6eb] bg-transparent cursor-pointer flex flex-col items-center gap-1.5 transition-all hover:border-[rgba(59,91,219,0.18)] hover:bg-[rgba(59,91,219,0.07)] disabled:opacity-60"
                >
                  {downloaded ? (
                    <Check size={18} style={{ color: "#12b76a" }} />
                  ) : (
                    <Download size={18} style={{ color: C.muted }} />
                  )}
                  <span className="text-[12px] font-semibold text-[#3c4149]">
                    {downloaded ? "Telecharge !" : "Telecharger"}
                  </span>
                  <span className="text-[10.5px] text-[#8a919e]">Fichier PNG local</span>
                </button>

                {/* Partager sur X */}
                <button
                  onClick={handleShareX}
                  className="p-2.5 rounded-[9px] border-[1.5px] border-[rgba(0,0,0,0.15)] bg-black cursor-pointer flex flex-col items-center gap-1.5 transition-all hover:bg-[#1a1a1a]"
                >
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 900,
                      fontFamily: "JetBrains Mono, monospace",
                      color: "rgba(255,255,255,0.9)",
                      lineHeight: 1,
                    }}
                  >
                    X
                  </span>
                  <span className="text-[12px] font-semibold text-white/80">Partager sur X</span>
                  <span className="text-[10.5px] text-white/50">Texte pre-rempli</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#e3e6eb] flex items-center justify-between shrink-0">
          <span className="text-[12px] text-[#8a919e]">
            Generation cote client, aucune donnee envoyee
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg border border-[#e3e6eb] bg-transparent text-[#8a919e] text-[12.5px] font-medium cursor-pointer hover:border-[#cdd1d9] hover:text-[#3c4149] transition-all"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
