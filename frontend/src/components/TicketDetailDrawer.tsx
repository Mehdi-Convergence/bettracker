import { useEffect, useState, useRef, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, Activity,
  BarChart3, Flag, Share2, TrendingUp,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceDot,
} from "recharts";
import { updateBetNote, getBetOddsHistory } from "@/services/api";
import { LEAGUE_INFO } from "@/types";
import type { Bet } from "@/types";
import { outcomeLabel } from "@/utils/campaign";
import ShareTicketModal from "./ShareTicketModal";

// ══════════════════════════════════════════════
// DESIGN TOKENS (match Portfolio.tsx)
// ══════════════════════════════════════════════
const C = {
  accent: "#3b5bdb", green: "#12b76a", red: "#f04438",
  amber: "#f79009", purple: "#7c3aed",
  text: "#111318", text2: "#3c4149", muted: "#8a919e", muted2: "#b0b7c3",
  bg: "#f4f5f7", border: "#e3e6eb",
};

function getTag(bet: Bet): string {
  if (bet.combo_group) return "COMBI";
  if (bet.source === "algo") return "ALGO";
  if (bet.source === "manual") return "MANUEL";
  return "SCANNER";
}

function StatusBadge({ result }: { result: string }) {
  const map: Record<string, { label: string; cls: string; dot?: boolean }> = {
    pending: { label: "En cours", cls: "bg-[rgba(59,91,219,.07)] text-[#3b5bdb]", dot: true },
    won: { label: "Gagné", cls: "bg-[rgba(18,183,106,.08)] text-[#12b76a]", dot: true },
    lost: { label: "Perdu", cls: "bg-[rgba(240,68,56,.07)] text-[#f04438]", dot: true },
    void: { label: "Annulé", cls: "bg-[rgba(138,145,158,.1)] text-[#8a919e]" },
    ignored: { label: "Ignoré", cls: "bg-[rgba(138,145,158,.08)] text-[#8a919e] italic" },
    expired: { label: "Expiré", cls: "bg-[rgba(138,145,158,.1)] text-[#b0b7c3]" },
    proposed: { label: "Proposé", cls: "bg-[rgba(247,144,9,.08)] text-[#f79009]", dot: true },
  };
  const s = map[result] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-semibold font-[var(--font-mono)] ${s.cls}`}>
      {s.dot && <span className="w-[4px] h-[4px] rounded-full bg-current" />}
      {s.label}
    </span>
  );
}

function TagBadge({ tag }: { tag: string }) {
  const styles: Record<string, string> = {
    ALGO: `bg-[rgba(59,91,219,.07)] text-[${C.accent}] border border-[rgba(59,91,219,.18)]`,
    MANUEL: `bg-[rgba(124,58,237,.07)] text-[${C.purple}] border border-[rgba(124,58,237,.2)]`,
    SCANNER: `bg-[rgba(247,144,9,.1)] text-[${C.amber}] border border-[rgba(247,144,9,.2)]`,
    COMBI: `bg-[rgba(18,183,106,.08)] text-[${C.green}] border border-[rgba(18,183,106,.2)]`,
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold font-[var(--font-mono)] tracking-wider ${styles[tag] || ""}`}>
      {tag}
    </span>
  );
}

// ══════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════
interface TicketDetailDrawerProps {
  bet: Bet | null;
  open: boolean;
  onClose: () => void;
  allBets: Bet[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onUpdateResult: (betId: number, result: string) => void;
  getCampaignName: (id: number | null) => string;
  onBetUpdated?: (bet: Bet) => void;
}

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
export default function TicketDetailDrawer({
  bet, open, onClose, allBets, currentIndex,
  onNavigate, onUpdateResult, getCampaignName, onBetUpdated,
}: TicketDetailDrawerProps) {
  const [noteValue, setNoteValue] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [oddsHistory, setOddsHistory] = useState<{ time: string; odds: number; event?: string }[]>([]);

  // Sync note with bet
  useEffect(() => {
    if (bet) setNoteValue(bet.note || "");
  }, [bet?.id]);

  // Load odds history when bet changes
  useEffect(() => {
    if (!bet) return;
    setOddsHistory([]);
    getBetOddsHistory(bet.id)
      .then((data) => setOddsHistory(data))
      .catch(() => setOddsHistory([]));
  }, [bet?.id]);

  // Auto-save note (debounced 800ms)
  const autoSaveNote = useCallback((value: string) => {
    if (!bet) return;
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(async () => {
      setNoteSaving(true);
      try {
        const updated = await updateBetNote(bet.id, value);
        onBetUpdated?.(updated);
      } catch { /* ignore */ }
      setNoteSaving(false);
    }, 800);
  }, [bet?.id, onBetUpdated]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < allBets.length - 1) onNavigate(currentIndex + 1);
    }
    if (open) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, currentIndex, allBets.length, onClose, onNavigate]);

  if (!bet) return null;

  const tag = getTag(bet);
  const isResolved = bet.result === "won" || bet.result === "lost" || bet.result === "void";
  const isProposed = bet.result === "proposed";
  const isIgnored = bet.result === "ignored" || bet.result === "expired";
  const isPending = bet.result === "pending";
  const potentialGain = bet.stake * (bet.odds_at_bet - 1);
  const sportIcon = bet.sport === "tennis" ? "🎾" : "⚽";
  const leagueName = bet.league ? (LEAGUE_INFO[bet.league]?.name || bet.league) : "";

  // Result box styling
  const rbCls = bet.result === "won"
    ? "bg-[rgba(18,183,106,.08)] border-[1.5px] border-[rgba(18,183,106,.2)]"
    : bet.result === "lost"
    ? "bg-[rgba(240,68,56,.07)] border-[1.5px] border-[rgba(240,68,56,.2)]"
    : bet.result === "pending"
    ? "bg-[rgba(59,91,219,.07)] border-[1.5px] border-[rgba(59,91,219,.18)]"
    : "bg-[rgba(247,144,9,.08)] border-[1.5px] border-[rgba(247,144,9,.2)]";
  const rbColor = bet.result === "won" ? C.green : bet.result === "lost" ? C.red : bet.result === "pending" ? C.accent : C.amber;

  // CLV
  const clv = (bet.odds_at_close != null && bet.odds_at_bet > 0)
    ? ((bet.odds_at_close - bet.odds_at_bet) / bet.odds_at_bet)
    : bet.clv;
  const clvDisplay = clv != null ? `${clv >= 0 ? "+" : ""}${(clv * 100).toFixed(1)}%` : null;

  // ROI
  const roi = bet.profit_loss != null ? ((bet.profit_loss / bet.stake) * 100) : null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 w-[440px] h-full bg-white border-l-[1.5px] border-[#e3e6eb] flex flex-col z-50 transition-transform duration-[260ms] ease-[cubic-bezier(.32,.72,0,1)] ${
          open ? "translate-x-0 shadow-[0_16px_48px_rgba(16,24,40,.2)]" : "translate-x-full"
        }`}
      >
        {/* ── Navigator ── */}
        <div className="h-[38px] bg-[#f4f5f7] border-b border-[#e3e6eb] flex items-center justify-between px-3.5 shrink-0">
          <span className="text-[11px] text-[#8a919e] font-[var(--font-mono)]">
            Ticket {currentIndex + 1} / {allBets.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => currentIndex > 0 && onNavigate(currentIndex - 1)}
              disabled={currentIndex <= 0}
              className="w-6 h-6 rounded-[5px] border border-[#e3e6eb] bg-white flex items-center justify-center text-[#8a919e] hover:border-[rgba(59,91,219,.18)] hover:text-[#3b5bdb] transition-all disabled:opacity-30 cursor-pointer">
              <ChevronLeft size={11} />
            </button>
            <button onClick={() => currentIndex < allBets.length - 1 && onNavigate(currentIndex + 1)}
              disabled={currentIndex >= allBets.length - 1}
              className="w-6 h-6 rounded-[5px] border border-[#e3e6eb] bg-white flex items-center justify-center text-[#8a919e] hover:border-[rgba(59,91,219,.18)] hover:text-[#3b5bdb] transition-all disabled:opacity-30 cursor-pointer">
              <ChevronRight size={11} />
            </button>
          </div>
        </div>

        {/* ── Header ── */}
        <div className="px-4 py-3.5 border-b border-[#e3e6eb] shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#8a919e] mb-1">
                {sportIcon} {leagueName}
              </div>
              <div className="text-[16px] font-extrabold tracking-tight leading-tight mb-1.5">
                {bet.home_team} vs {bet.away_team}
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                <StatusBadge result={bet.result} />
                <TagBadge tag={tag} />
                <span className="text-[11px] text-[#8a919e] font-[var(--font-mono)]">
                  {bet.match_date.split("T")[0].slice(5).replace("-", "/")}
                </span>
              </div>
            </div>
            <button onClick={onClose}
              className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-[#8a919e] hover:bg-[#f4f5f7] hover:text-[#111318] transition-all cursor-pointer shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="flex-1 overflow-y-auto">

          {/* BLOC 1 — Données du pari */}
          <div className="px-4 py-3.5 border-b border-[#e3e6eb]">
            <BlocTitle icon={<CheckCircle2 size={12} />} label="Données du pari" />
            <div className="grid grid-cols-2 gap-[7px] mb-2.5">
              <StatBox value={bet.odds_at_bet.toFixed(2)} label={isProposed ? "Cote générée" : "Cote au placement"} />
              <StatBox value={`${bet.stake.toFixed(0)}€`} label={isProposed ? "Mise calculée" : "Mise"} />
            </div>
            <DataRow label="Issue pariée" value={`${outcomeLabel(bet.outcome_bet)} · ${bet.home_team}`} />
            <DataRow label="Gain potentiel" value={`+${potentialGain.toFixed(2)}€`} valueColor={C.green} />
            {bet.edge_at_bet != null && (
              <DataRow label="Edge généré" value={`${bet.edge_at_bet >= 0 ? "+" : ""}${(bet.edge_at_bet * 100).toFixed(1)}%`} valueColor={bet.edge_at_bet >= 0 ? C.green : C.red} />
            )}
            {bet.bookmaker && (
              <DataRow label={isProposed ? "Bookmaker suggéré" : "Bookmaker"} value={bet.bookmaker} />
            )}
          </div>

          {/* BLOC 2 — Mouvement de cote */}
          <div className="px-4 py-3.5 border-b border-[#e3e6eb]">
            <BlocTitle icon={<Activity size={12} />} label="Mouvement de cote" />
            {bet.odds_at_close != null ? (
              <>
                <CoteChart
                  generation={bet.edge_at_bet != null ? bet.odds_at_bet / (1 - bet.edge_at_bet) : null}
                  placement={bet.odds_at_bet}
                  closing={bet.odds_at_close}
                  isResolved={isResolved}
                />
                {/* Signal */}
                {bet.odds_at_close < bet.odds_at_bet ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-[7px] rounded-[7px] text-[11.5px] font-medium mt-2 bg-[rgba(18,183,106,.08)] text-[#12b76a] border border-[rgba(18,183,106,.2)]">
                    <CheckCircle2 size={12} /> Cote en baisse : le marché confirme la valeur.
                  </div>
                ) : bet.odds_at_close > bet.odds_at_bet ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-[7px] rounded-[7px] text-[11.5px] font-medium mt-2 bg-[rgba(240,68,56,.07)] text-[#f04438] border border-[rgba(240,68,56,.2)]">
                    <X size={12} /> Cote en hausse : marché diverge.
                  </div>
                ) : null}
              </>
            ) : isPending ? (
              <div className="text-[12px] text-[#8a919e] italic py-2">
                Cote de fermeture disponible après le match.
              </div>
            ) : (
              <div className="text-[12px] text-[#8a919e] italic py-2">
                Données de cote indisponibles.
              </div>
            )}
          </div>

          {/* BLOC 3 — Résultat & CLV (only if resolved) */}
          {isResolved && (
            <div className="px-4 py-3.5 border-b border-[#e3e6eb]">
              <BlocTitle icon={<BarChart3 size={12} />} label="Résultat & CLV" />
              {/* Result box */}
              <div className={`rounded-[9px] p-3 mb-2.5 flex items-center justify-between ${rbCls}`}>
                <div>
                  <div className="text-[13px] font-bold" style={{ color: rbColor }}>
                    {bet.result === "won" ? "✓ Gagné" : bet.result === "lost" ? "✕ Perdu" : "— Annulé"}
                  </div>
                </div>
                <div className="text-[20px] font-extrabold font-[var(--font-mono)] tracking-tight" style={{ color: rbColor }}>
                  {bet.profit_loss != null ? `${bet.profit_loss >= 0 ? "+" : ""}${bet.profit_loss.toFixed(2)}€` : "—"}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-[7px]">
                <StatBox value={roi != null ? `${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%` : "—"} label="ROI ticket"
                  valueColor={roi != null ? (roi >= 0 ? C.green : C.red) : undefined} />
                <StatBox
                  value={tag === "MANUEL" ? "— (manuel)" : (clvDisplay || "—")}
                  label="CLV"
                  valueColor={clv != null && tag !== "MANUEL" ? (clv >= 0 ? C.green : C.red) : undefined}
                />
                <StatBox value="—" label="EV réel/att." />
              </div>
              {clvDisplay && tag !== "MANUEL" && (
                <DataRow label="CLV détail" value={`${bet.odds_at_bet.toFixed(2)} placé · ${bet.odds_at_close?.toFixed(2)} fermeture`} />
              )}
            </div>
          )}

          {/* Ignored hypothetical result */}
          {isIgnored && bet.profit_loss != null && (
            <div className="px-4 py-3.5 border-b border-[#e3e6eb]">
              <BlocTitle icon={<BarChart3 size={12} />} label="Résultat hypothétique" />
              <div className="px-3 py-2.5 rounded-[9px] bg-[rgba(138,145,158,.06)] border border-[rgba(138,145,158,.12)] text-[13px] text-[#8a919e] italic">
                Aurait rapporté {bet.profit_loss >= 0 ? `+${bet.profit_loss.toFixed(2)}€` : `${bet.profit_loss.toFixed(2)}€`}
              </div>
            </div>
          )}

          {/* BLOC 4 — Evolution de la cote (snapshots horaires) */}
          {oddsHistory.length >= 2 && (
            <div className="px-4 py-3.5 border-b border-[#e3e6eb]">
              <BlocTitle icon={<TrendingUp size={12} />} label="Evolution de la cote" />
              <OddsHistoryChart history={oddsHistory} />
            </div>
          )}

          {/* BLOC 5 — Origine & contexte */}
          <div className="px-4 py-3.5">
            <BlocTitle icon={<Flag size={12} />} label="Origine & contexte" />
            <DataRow
              label="Campagne"
              value={bet.campaign_id ? `${getCampaignName(bet.campaign_id)} →` : "Hors campagne"}
              valueColor={bet.campaign_id ? C.accent : undefined}
            />
            <DataRow label="Bankroll" value={bet.campaign_id ? `Campagne ${getCampaignName(bet.campaign_id)}` : "Bankroll globale"} />
            <DataRow label="Généré le" value={bet.created_at ? bet.created_at.split("T")[0].slice(5).replace("-", "/") + " · " + bet.created_at.split("T")[1]?.slice(0, 5) : "—"} />
            {!isProposed && (
              <DataRow label="Placé le" value={bet.created_at ? bet.created_at.split("T")[0].slice(5).replace("-", "/") : "—"} />
            )}

            {/* Note personnelle */}
            <div className="mt-3">
              <div className="text-[11.5px] font-semibold text-[#3c4149] mb-1.5">Note personnelle</div>
              <textarea
                value={noteValue}
                onChange={(e) => {
                  setNoteValue(e.target.value);
                  autoSaveNote(e.target.value);
                }}
                placeholder={isProposed ? "Ajouter une note avant de valider…" : "Ajouter une note…"}
                className="w-full px-2.5 py-2 border border-[#e3e6eb] rounded-lg text-[13px] text-[#111318] bg-[#f4f5f7] resize-none min-h-[60px] outline-none leading-relaxed transition-all focus:border-[#3b5bdb] focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,91,219,.07)] placeholder:text-[#b0b7c3]"
              />
              <div className="text-[10px] text-[#b0b7c3] mt-1">
                {noteSaving ? "Sauvegarde…" : "Sauvegardé automatiquement"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="px-4 py-3 border-t border-[#e3e6eb] shrink-0 flex flex-col gap-[7px] bg-white">
          {isProposed && (
            <>
              <div className="flex gap-[7px]">
                <button onClick={() => onUpdateResult(bet.id, "pending")}
                  className="flex-1 py-2 rounded-[9px] bg-[#12b76a] text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#0da35e] transition-colors cursor-pointer">
                  ✓ Valider{bet.bookmaker ? ` : Placer sur ${bet.bookmaker}` : ""}
                </button>
              </div>
              <div className="flex gap-[7px]">
                <button className="flex-1 py-2 rounded-lg border border-[#e3e6eb] text-[#3c4149] text-[12.5px] font-medium flex items-center justify-center gap-1.5 hover:bg-[#f4f5f7] transition-colors cursor-pointer">
                  ✏️ Modifier la mise
                </button>
                <button onClick={() => onUpdateResult(bet.id, "ignored")}
                  className="flex-1 py-2 rounded-lg border border-[rgba(240,68,56,.2)] text-[#f04438] text-[12.5px] font-medium flex items-center justify-center gap-1.5 hover:bg-[rgba(240,68,56,.07)] transition-colors cursor-pointer">
                  ✕ Ignorer
                </button>
              </div>
            </>
          )}
          <div className="flex gap-[7px]">
            <button onClick={() => setShowShare(true)} className="flex-1 py-2 rounded-lg border-[1.5px] border-[rgba(59,91,219,.18)] bg-[rgba(59,91,219,.07)] text-[#3b5bdb] text-[12.5px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#3b5bdb] hover:text-white transition-colors cursor-pointer">
              <Share2 size={12} /> Partager ce ticket
            </button>
          </div>

          {/* Share modal */}
          {bet && (
            <ShareTicketModal
              bet={bet}
              comboLegs={bet.combo_group ? allBets.filter(b => b.combo_group === bet.combo_group && b.id !== bet.id) : undefined}
              open={showShare}
              onClose={() => setShowShare(false)}
            />
          )}
          {bet.campaign_id && (
            <button className="py-2 rounded-lg border border-[#e3e6eb] text-[#8a919e] text-[12px] font-medium flex items-center justify-center gap-1.5 hover:border-[rgba(59,91,219,.18)] hover:text-[#3b5bdb] hover:bg-[rgba(59,91,219,.07)] transition-colors cursor-pointer w-full">
              → Voir la campagne {getCampaignName(bet.campaign_id)}
            </button>
          )}
        </div>
      </div>
    </>
  );
}


// ══════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════

function BlocTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="text-[10.5px] font-bold text-[#b0b7c3] uppercase tracking-[.09em] mb-2.5 flex items-center gap-[5px]">
      <span className="text-[#3b5bdb]">{icon}</span>
      {label}
    </div>
  );
}

function StatBox({ value, label, valueColor }: { value: string; label: string; valueColor?: string }) {
  return (
    <div className="bg-[#f4f5f7] rounded-lg px-2.5 py-2">
      <div className="text-[15px] font-extrabold font-[var(--font-mono)] tracking-tight" style={{ color: valueColor || "#111318" }}>
        {value}
      </div>
      <div className="text-[10px] text-[#8a919e] mt-0.5">{label}</div>
    </div>
  );
}

function DataRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#e3e6eb] last:border-b-0">
      <span className="text-[12.5px] text-[#8a919e]">{label}</span>
      <span className="text-[12.5px] font-semibold font-[var(--font-mono)] text-right max-w-[220px]"
        style={{ color: valueColor || "#3c4149" }}>
        {value}
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════
// ODDS HISTORY CHART
// ══════════════════════════════════════════════

interface OddsPoint {
  time: string;
  odds: number;
  event?: string;
}

function formatSnapshotTime(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

function OddsHistoryChart({ history }: { history: OddsPoint[] }) {
  const data = history.map((p) => ({
    label: formatSnapshotTime(p.time),
    odds: p.odds,
    event: p.event,
  }));

  const allOdds = data.map((d) => d.odds);
  const minOdds = Math.min(...allOdds);
  const maxOdds = Math.max(...allOdds);
  const pad = Math.max((maxOdds - minOdds) * 0.15, 0.05);
  const domain: [number, number] = [
    Math.max(1.0, parseFloat((minOdds - pad).toFixed(2))),
    parseFloat((maxOdds + pad).toFixed(2)),
  ];

  const betPoint = data.find((d) => d.event === "bet");
  const closePoint = data.find((d) => d.event === "close");

  return (
    <div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#8a919e", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 9, fill: "#8a919e", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <ReTooltip
            contentStyle={{
              background: "#fff",
              border: "1px solid #e3e6eb",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
            }}
            formatter={(value: number | undefined) => {
              if (value == null) return ["", "Cote"];
              return [value.toFixed(3), "Cote"];
            }}
            labelStyle={{ color: "#8a919e", fontSize: 10 }}
          />
          <Line
            type="monotone"
            dataKey="odds"
            stroke="#3b5bdb"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "#3b5bdb" }}
          />
          {betPoint && (
            <ReferenceDot
              x={betPoint.label}
              y={betPoint.odds}
              r={5}
              fill="#12b76a"
              stroke="white"
              strokeWidth={2}
            />
          )}
          {closePoint && (
            <ReferenceDot
              x={closePoint.label}
              y={closePoint.odds}
              r={5}
              fill="#7c3aed"
              stroke="white"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-3 mt-1">
        {betPoint && (
          <div className="flex items-center gap-[5px] text-[10px] text-[#8a919e]">
            <span className="w-[7px] h-[7px] rounded-full bg-[#12b76a]" />
            Placement · {betPoint.odds.toFixed(2)}
          </div>
        )}
        {closePoint && (
          <div className="flex items-center gap-[5px] text-[10px] text-[#8a919e]">
            <span className="w-[7px] h-[7px] rounded-full bg-[#7c3aed]" />
            Fermeture · {closePoint.odds.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}


function CoteChart({ generation, placement, closing, isResolved }: {
  generation: number | null;
  placement: number;
  closing: number;
  isResolved: boolean;
}) {
  // Simple SVG chart showing placement → closing
  const pts = [placement];
  if (closing) pts.push(closing);
  const min = Math.min(...pts, generation ?? Infinity) - 0.05;
  const max = Math.max(...pts, generation ?? -Infinity) + 0.05;
  const range = max - min || 0.1;
  const yScale = (v: number) => 60 - ((v - min) / range) * 52;

  return (
    <div>
      <div className="h-[68px] w-full relative mb-2">
        <svg className="w-full h-full" viewBox="0 0 400 68" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cote-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b5bdb" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#3b5bdb" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Area + line */}
          <path
            d={`M0,${yScale(placement)} C200,${yScale((placement + closing) / 2)} 300,${yScale(closing)} 400,${yScale(closing)} L400,68 L0,68Z`}
            fill="url(#cote-grad)"
          />
          <path
            d={`M0,${yScale(placement)} C200,${yScale((placement + closing) / 2)} 300,${yScale(closing)} 400,${yScale(closing)}`}
            fill="none" stroke="#3b5bdb" strokeWidth="2" strokeLinecap="round"
          />
          {/* Points */}
          <circle cx="0" cy={yScale(placement)} r="4" fill="#12b76a" stroke="white" strokeWidth="2" />
          {isResolved && (
            <circle cx="400" cy={yScale(closing)} r="4" fill="#7c3aed" stroke="white" strokeWidth="2" />
          )}
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-[#8a919e] font-[var(--font-mono)]">
        <span style={{ color: "#12b76a" }}>Placement · {placement.toFixed(2)}</span>
        {isResolved && (
          <span style={{ color: "#7c3aed" }}>Fermeture · {closing.toFixed(2)}</span>
        )}
        {!isResolved && (
          <span>Maintenant · {closing.toFixed(2)}</span>
        )}
      </div>
      <div className="flex gap-3 mt-1.5">
        <div className="flex items-center gap-[5px] text-[10px] text-[#8a919e]">
          <span className="w-[7px] h-[7px] rounded-full bg-[#12b76a]" /> Placement
        </div>
        {isResolved && (
          <div className="flex items-center gap-[5px] text-[10px] text-[#8a919e]">
            <span className="w-[7px] h-[7px] rounded-full bg-[#7c3aed]" /> Fermeture
          </div>
        )}
      </div>
    </div>
  );
}
