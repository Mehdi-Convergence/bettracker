import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus, X, Loader2, Search, Layers, Download, Clock, CheckCircle2,
  AlertCircle,
  Trash2, ChevronDown, ChevronUp, SlidersHorizontal,
} from "lucide-react";
import {
  getPortfolioStats, getPortfolioBets, getCampaigns, createBet, aiScan,
  updatePortfolioBet, deletePortfolioBet, getCampaignDetail, getCampaignHistory,
  getCampaignRecommendations, acceptCampaignRecommendation,
} from "@/services/api";
import { LEAGUE_INFO } from "@/types";
import { Badge } from "@/components/ui";
import KanbanBoard from "@/components/KanbanBoard";
import type { KanbanColumn, KanbanCardData } from "@/components/KanbanBoard";
import type {
  PortfolioStats, Bet, Campaign, AIScanMatch,
  CampaignDetail, CampaignRecommendation, BankrollPoint,
} from "@/types";
import TeamAutocomplete from "@/components/TeamAutocomplete";
import { outcomeLabel } from "@/utils/campaign";
import TicketDetailDrawer from "@/components/TicketDetailDrawer";
import { useTour } from "@/hooks/useTour";
import SpotlightTour from "@/components/SpotlightTour";
import { portfolioTour } from "@/tours/index";
import { usePreferences } from "@/contexts/PreferencesContext";
import { getCurrencySymbol } from "@/utils/currency";

// ══════════════════════════════════════════════
// DESIGN TOKENS
// ══════════════════════════════════════════════
const C = {
  accent: "var(--accent)", green: "var(--green)", red: "var(--red)",
  amber: "var(--amber)", purple: "#7c3aed",
  text: "var(--text-primary)", text2: "var(--text-secondary)", muted: "var(--text-muted)", muted2: "var(--text-muted2)",
  bg: "var(--bg-surface)", border: "var(--border-color)",
};
const SH_SM = "0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04)";

type ViewMode = "kanban" | "list" | "camp";
type StatusFilter = "all" | "en_cours" | "proposes" | "resolus";
type PeriodFilter = "7d" | "30d" | "90d" | "custom";
type SortDir = "asc" | "desc";

interface ComboLeg {
  home_team: string; away_team: string; league: string;
  match_date: string; outcome_bet: string; odds: number;
}

// ══════════════════════════════════════════════
// TAG / STATUS helpers
// ══════════════════════════════════════════════
function getTag(bet: Bet): "ALGO" | "MANUEL" | "SCANNER" | "COMBI" {
  if (bet.combo_group) return "COMBI";
  if (bet.source === "algo") return "ALGO";
  if (bet.source === "manual") return "MANUEL";
  if (bet.source === "scanner") return "SCANNER";
  // Fallback for old data without source
  if (bet.campaign_id) return "ALGO";
  return "SCANNER";
}

const TAG_STYLES: Record<string, string> = {
  ALGO: `bg-[rgba(59,91,219,.07)] text-[${C.accent}] border border-[rgba(59,91,219,.18)]`,
  MANUEL: `bg-[rgba(124,58,237,.07)] text-[${C.purple}] border border-[rgba(124,58,237,.2)]`,
  SCANNER: `bg-[rgba(247,144,9,.1)] text-[${C.amber}] border border-[rgba(247,144,9,.2)]`,
  COMBI: `bg-[rgba(18,183,106,.08)] text-[${C.green}] border border-[rgba(18,183,106,.2)]`,
};

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold font-[var(--font-mono)] tracking-wider ${TAG_STYLES[tag] || ""}`}>
      {tag}
    </span>
  );
}

function StatusBadge({ result }: { result: string }) {
  const map: Record<string, { label: string; cls: string; dot?: boolean; pulse?: boolean }> = {
    pending: { label: "En cours", cls: "bg-[var(--accent-bg)] text-[#3b5bdb]", dot: true, pulse: true },
    won: { label: "Gagné", cls: "bg-[var(--green-bg)] text-[#12b76a]", dot: true },
    lost: { label: "Perdu", cls: "bg-[var(--red-bg)] text-[#f04438]", dot: true },
    void: { label: "Annulé", cls: "bg-[rgba(138,145,158,.1)] text-[#8a919e]" },
    ignored: { label: "Ignoré", cls: "bg-[rgba(138,145,158,.08)] text-[#8a919e] italic" },
    expired: { label: "Expiré", cls: "bg-[rgba(138,145,158,.1)] text-[#b0b7c3]" },
    proposed: { label: "Proposé", cls: "bg-[var(--amber-bg)] text-[#f79009]", dot: true },
  };
  const s = map[result] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold font-[var(--font-mono)] ${s.cls}`}>
      {s.dot && (
        <span className={`w-[5px] h-[5px] rounded-full bg-current ${s.pulse ? "animate-pulse" : ""}`} />
      )}
      {s.label}
    </span>
  );
}

function ClvBadge({ clv }: { clv: number | null }) {
  if (clv == null) return <span className="text-[#b0b7c3] font-[var(--font-mono)] text-[10px]">—</span>;
  const pos = clv >= 0;
  return (
    <span className={`text-[10px] font-[var(--font-mono)] font-semibold px-1 py-0.5 rounded ${
      pos ? "bg-[var(--green-bg)] text-[#12b76a]" : "bg-[var(--red-bg)] text-[#f04438]"
    }`}>
      {pos ? "+" : ""}{(clv * 100).toFixed(1)}%
    </span>
  );
}

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
export default function Portfolio() {
  const { showTour, completeTour } = useTour("portfolio");
  const { prefs } = usePreferences();
  const currencySymbol = getCurrencySymbol(prefs.currency);

  // ── Data state ──
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // ── View state ──
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [filtersCollapsed, setFiltersCollapsed] = useState(window.innerWidth < 768);

  // Initialise la vue depuis les preferences utilisateur
  useEffect(() => {
    const map: Record<string, ViewMode> = {
      kanban: "kanban",
      list: "list",
      campaign: "camp",
    };
    const pref = prefs.default_tickets_view;
    if (pref && map[pref]) {
      setViewMode(map[pref]);
    }
  }, [prefs.default_tickets_view]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [bankrollFilter, setBankrollFilter] = useState("all");

  // ── List view state ──
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("30d");
  const [resultFilter, setResultFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [clvFilter, setClvFilter] = useState("all");
  const [bookmakerFilter, setBookmakerFilter] = useState("all");
  const [sortCol, setSortCol] = useState("match_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // ── Campaign view state ──
  const [selectedCampId, setSelectedCampId] = useState<number | null>(null);
  const [campDetail, setCampDetail] = useState<CampaignDetail | null>(null);
  const [campHistory, setCampHistory] = useState<BankrollPoint[]>([]);
  const [campBets, setCampBets] = useState<Bet[]>([]);

  // ── Kanban state ──
  const [campRecos, setCampRecos] = useState<{ campId: number; reco: CampaignRecommendation }[]>([]);
  const [acceptingReco, setAcceptingReco] = useState<string | null>(null);

  // ── Drawer state ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBetId, setDrawerBetId] = useState<number | null>(null);
  const [drawerIndex, setDrawerIndex] = useState(0);

  const drawerBet = drawerBetId != null ? bets.find((b) => b.id === drawerBetId) || null : null;

  function openDrawer(bet: Bet) {
    setDrawerBetId(bet.id);
    const idx = drawerBets.findIndex((b) => b.id === bet.id);
    setDrawerIndex(idx >= 0 ? idx : 0);
    setDrawerOpen(true);
  }

  function navigateDrawer(index: number) {
    const bet = drawerBets[index];
    if (bet) {
      setDrawerBetId(bet.id);
      setDrawerIndex(index);
    }
  }

  // ── Add form state ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [formMode, setFormMode] = useState<"manual" | "search">("manual");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addForm, setAddForm] = useState({
    home_team: "", away_team: "", league: "E0",
    match_date: new Date().toISOString().split("T")[0],
    outcome_bet: "H", odds_at_bet: "", stake: "",
    bookmaker: "", note: "",
  });
  const [isCombo, setIsCombo] = useState(false);
  const [comboLegs, setComboLegs] = useState<ComboLeg[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [scanQuery, setScanQuery] = useState("");
  const [scanResults, setScanResults] = useState<AIScanMatch[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanLoaded, setScanLoaded] = useState(false);

  // ── Load data ──
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [s, b, c] = await Promise.all([
          getPortfolioStats().catch(() => null),
          getPortfolioBets().catch(() => []),
          getCampaigns().catch(() => []),
        ]);
        if (cancelled) return;
        if (s) setStats(s);
        setBets(b);
        setCampaigns(c);
        const activeCamps = c.filter((camp) => camp.status === "active");
        const recoResults: { campId: number; reco: CampaignRecommendation }[] = [];
        for (const camp of activeCamps.slice(0, 5)) {
          if (cancelled) return;
          try {
            const res = await getCampaignRecommendations(camp.id);
            for (const r of res.recommendations) {
              recoResults.push({ campId: camp.id, reco: r });
            }
          } catch { /* ignore */ }
        }
        if (!cancelled) setCampRecos(recoResults);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, b, c] = await Promise.all([
        getPortfolioStats().catch(() => null),
        getPortfolioBets().catch(() => []),
        getCampaigns().catch(() => []),
      ]);
      if (s) setStats(s);
      setBets(b);
      setCampaigns(c);

      // Load recommendations from active campaigns for Kanban
      const activeCamps = c.filter((camp) => camp.status === "active");
      const recoResults: { campId: number; reco: CampaignRecommendation }[] = [];
      for (const camp of activeCamps.slice(0, 5)) {
        try {
          const res = await getCampaignRecommendations(camp.id);
          for (const r of res.recommendations) {
            recoResults.push({ campId: camp.id, reco: r });
          }
        } catch { /* ignore */ }
      }
      setCampRecos(recoResults);
    } catch { /* ignore */ }
    setLoading(false);
  }

  // ── Campaign detail loader ──
  useEffect(() => {
    if (selectedCampId === null) { setCampDetail(null); setCampBets([]); return; }
    let cancelled = false;
    getCampaignDetail(selectedCampId).then((d) => { if (!cancelled) setCampDetail(d); }).catch(() => {});
    getCampaignHistory(selectedCampId).then((h) => { if (!cancelled) setCampHistory(h); }).catch(() => { if (!cancelled) setCampHistory([]); });
    getPortfolioBets(selectedCampId).then((b) => { if (!cancelled) setCampBets(b); }).catch(() => { if (!cancelled) setCampBets([]); });
    return () => { cancelled = true; };
  }, [selectedCampId]);

  // ── Helpers ──
  function getCampaignName(id: number | null): string {
    if (!id) return "Hors campagne";
    return campaigns.find((c) => c.id === id)?.name || `Campagne #${id}`;
  }

  function getCampaignColor(id: number | null): string {
    if (!id) return C.muted;
    const colors = [C.accent, C.green, C.purple, C.amber, C.red];
    return colors[(id - 1) % colors.length];
  }

  // ── Search filter ──
  const filterBySearch = useCallback((b: Bet) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return b.home_team.toLowerCase().includes(q) || b.away_team.toLowerCase().includes(q)
      || (b.league && LEAGUE_INFO[b.league]?.name.toLowerCase().includes(q));
  }, [searchQuery]);

  // ── Filtered bets for list/kanban ──
  const filteredBets = useMemo(() => {
    let result = bets.filter(filterBySearch);
    if (sportFilter !== "all") result = result.filter((b) => b.sport === sportFilter);
    if (bankrollFilter === "campaign") result = result.filter((b) => b.campaign_id != null);
    else if (bankrollFilter === "global") result = result.filter((b) => b.campaign_id == null);
    return result;
  }, [bets, filterBySearch, sportFilter, bankrollFilter]);

  // ── Period-filtered bets for list view ──
  const periodBets = useMemo(() => {
    const now = new Date();
    let days = 30;
    if (periodFilter === "7d") days = 7;
    else if (periodFilter === "90d") days = 90;
    else if (periodFilter === "custom") days = 9999;
    const cutoff = new Date(now.getTime() - days * 86400000);
    let result = filteredBets.filter((b) => new Date(b.match_date) >= cutoff);
    if (resultFilter !== "all") {
      result = result.filter((b) => b.result === resultFilter);
    }
    if (tagFilter !== "all") {
      result = result.filter((b) => getTag(b) === tagFilter);
    }
    if (clvFilter === "positive") result = result.filter((b) => b.clv != null && b.clv > 0);
    else if (clvFilter === "negative") result = result.filter((b) => b.clv != null && b.clv < 0);
    if (bookmakerFilter !== "all") result = result.filter((b) => b.bookmaker === bookmakerFilter);
    return result;
  }, [filteredBets, periodFilter, resultFilter, tagFilter, clvFilter, bookmakerFilter, campaigns]);

  // ── Sorted + paginated bets ──
  const sortedBets = useMemo(() => {
    const sorted = [...periodBets].sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0;
      if (sortCol === "match_date") { va = a.match_date; vb = b.match_date; }
      else if (sortCol === "odds_at_bet") { va = a.odds_at_bet; vb = b.odds_at_bet; }
      else if (sortCol === "stake") { va = a.stake; vb = b.stake; }
      else if (sortCol === "profit_loss") { va = a.profit_loss ?? 0; vb = b.profit_loss ?? 0; }
      else if (sortCol === "edge_at_bet") { va = a.edge_at_bet ?? 0; vb = b.edge_at_bet ?? 0; }
      else if (sortCol === "clv") { va = a.clv ?? 0; vb = b.clv ?? 0; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [periodBets, sortCol, sortDir]);

  const drawerBets = viewMode === "list" ? sortedBets : filteredBets;
  const totalPages = Math.max(1, Math.ceil(sortedBets.length / pageSize));
  const pagedBets = sortedBets.slice((page - 1) * pageSize, page * pageSize);

  // ── List KPIs ──
  const listKpis = useMemo(() => {
    const settled = periodBets.filter((b) => b.result === "won" || b.result === "lost");
    const won = settled.filter((b) => b.result === "won").length;
    const staked = settled.reduce((s, b) => s + b.stake, 0);
    const pnl = settled.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
    const avgClv = settled.filter((b) => b.clv != null).reduce((s, b, _, a) => s + (b.clv ?? 0) / a.length, 0);
    return {
      roi: staked > 0 ? (pnl / staked * 100) : 0,
      clv: avgClv,
      winRate: settled.length > 0 ? (won / settled.length * 100) : 0,
      staked, pnl, count: periodBets.length,
    };
  }, [periodBets]);

  // ── Sort handler ──
  function toggleSort(col: string) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
    setPage(1);
  }

  // ── Export CSV ──
  function exportCsv(data: Bet[], filename: string) {
    const headers = ["Date", "Match", "Issue", "Cote", "Mise", "Résultat", "Gain/Perte", "CLV", "Campagne", "Tag"];
    const rows = data.map((b) => [
      b.match_date.split("T")[0],
      `${b.home_team} vs ${b.away_team}`,
      outcomeLabel(b.outcome_bet),
      b.odds_at_bet.toFixed(2),
      b.stake.toFixed(2),
      b.result,
      b.profit_loss != null ? b.profit_loss.toFixed(2) : "",
      b.clv != null ? (b.clv * 100).toFixed(1) + "%" : "",
      getCampaignName(b.campaign_id),
      getTag(b),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Scan handlers ──
  async function handleScan() {
    setScanLoading(true);
    try { const res = await aiScan({ sport: "football", cacheOnly: true }); setScanResults(res.matches); setScanLoaded(true); }
    catch { setScanResults([]); }
    setScanLoading(false);
  }

  function filteredScanResults(): AIScanMatch[] {
    if (!scanQuery.trim()) return scanResults;
    const q = scanQuery.toLowerCase();
    return scanResults.filter((m) => (m.home_team ?? "").toLowerCase().includes(q) || (m.away_team ?? "").toLowerCase().includes(q));
  }

  function selectScanMatch(match: AIScanMatch, outcome: string) {
    const odds1x2 = (match.odds as Record<string, Record<string, Record<string, number>>>)?.["1x2"] ?? {};
    const outcomeOdds = odds1x2[outcome] ?? {};
    const bestOdds = Math.max(...Object.values(outcomeOdds).map(Number).filter(Boolean), 0);
    if (!bestOdds) return;
    if (isCombo) {
      setComboLegs((prev) => [...prev, {
        home_team: match.home_team ?? "", away_team: match.away_team ?? "",
        league: match.league, match_date: match.date.split("T")[0],
        outcome_bet: outcome, odds: bestOdds,
      }]);
    } else {
      setAddForm({
        home_team: match.home_team ?? "", away_team: match.away_team ?? "",
        league: match.league, match_date: match.date.split("T")[0],
        outcome_bet: outcome, odds_at_bet: String(bestOdds), stake: addForm.stake,
        bookmaker: "", note: "",
      });
      setFormMode("manual");
    }
  }

  function addComboLeg() {
    if (!addForm.home_team || !addForm.away_team || !addForm.odds_at_bet) return;
    setComboLegs((prev) => [...prev, {
      home_team: addForm.home_team, away_team: addForm.away_team,
      league: addForm.league, match_date: addForm.match_date,
      outcome_bet: addForm.outcome_bet, odds: Number(addForm.odds_at_bet),
    }]);
    setAddForm((f) => ({ ...f, home_team: "", away_team: "", odds_at_bet: "" }));
  }

  const combinedOdds = comboLegs.reduce((acc, leg) => acc * leg.odds, 1);

  async function handleAddBet() {
    setAdding(true); setAddError("");
    try {
      if (isCombo && comboLegs.length >= 2) {
        await createBet({
          home_team: comboLegs[0].home_team, away_team: comboLegs[0].away_team,
          league: comboLegs[0].league, match_date: comboLegs[0].match_date,
          outcome_bet: comboLegs[0].outcome_bet,
          odds_at_bet: Math.round(combinedOdds * 100) / 100,
          stake: Number(addForm.stake), is_combo: true,
          combo_legs: comboLegs.map((l) => ({
            home_team: l.home_team, away_team: l.away_team, league: l.league,
            match_date: l.match_date, outcome_bet: l.outcome_bet, odds: l.odds,
          })),
          campaign_id: selectedCampaignId,
          bookmaker: addForm.bookmaker || null,
          note: addForm.note || null,
        });
      } else {
        await createBet({
          home_team: addForm.home_team, away_team: addForm.away_team,
          league: addForm.league, match_date: addForm.match_date,
          outcome_bet: addForm.outcome_bet, odds_at_bet: Number(addForm.odds_at_bet),
          stake: Number(addForm.stake), is_combo: false, combo_legs: null,
          campaign_id: selectedCampaignId,
          bookmaker: addForm.bookmaker || null,
          note: addForm.note || null,
        });
      }
      setShowAddModal(false);
      setAddForm({ home_team: "", away_team: "", league: "E0", match_date: new Date().toISOString().split("T")[0], outcome_bet: "H", odds_at_bet: "", stake: "", bookmaker: "", note: "" });
      setComboLegs([]); setIsCombo(false); setSelectedCampaignId(null);
      loadAll();
    } catch (e) { setAddError((e as Error).message); }
    setAdding(false);
  }

  const canSubmit = isCombo
    ? comboLegs.length >= 2 && !!addForm.stake
    : !!addForm.home_team && !!addForm.away_team && !!addForm.odds_at_bet && !!addForm.stake;

  // ── Accept recommendation ──
  async function handleAcceptReco(campId: number, reco: CampaignRecommendation) {
    const key = `${campId}-${reco.home_team}-${reco.outcome}`;
    setAcceptingReco(key);
    try {
      await acceptCampaignRecommendation(campId, {
        home_team: reco.home_team, away_team: reco.away_team,
        league: reco.league, match_date: reco.date,
        outcome: reco.outcome, odds: reco.best_odds,
        stake: reco.suggested_stake, bookmaker: reco.bookmaker,
        sport: reco.sport,
      });
      loadAll();
    } catch { /* ignore */ }
    setAcceptingReco(null);
  }

  // ── Update bet result ──
  async function handleUpdateResult(betId: number, result: string) {
    try {
      await updatePortfolioBet(betId, result);
      loadAll();
    } catch { /* ignore */ }
  }

  async function handleDeleteBet(betId: number) {
    if (!confirm("Supprimer ce ticket ? Cette action est irréversible.")) return;
    try {
      await deletePortfolioBet(betId);
      loadAll();
    } catch { /* ignore */ }
  }

  const leagueOptions = Object.entries(LEAGUE_INFO);
  const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={28} style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 h-[calc(100vh-64px)] max-md:h-auto overflow-x-hidden max-md:overflow-y-auto max-md:pb-6" style={{ animation: "fu .3s ease both" }}>

      {/* ══════ HEADER ══════ */}
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>Tickets & Portfolio</h1>
          <p className="text-[12.5px] mt-0.5 max-md:hidden" style={{ color: "var(--text-muted)" }}>Vue globale de tous vos paris, campagnes et hors campagne</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode !== "kanban" && (
            <button onClick={() => exportCsv(periodBets, "tickets-export.csv")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:text-[#12b76a] transition-colors cursor-pointer max-md:hidden" style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
              <Download size={12} /> Export CSV
            </button>
          )}
          <button data-tour="add-bet-btn" onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-[9px] bg-[#3b5bdb] text-white text-[12px] md:text-[13px] font-semibold shadow-[0_1px_3px_rgba(59,91,219,.3)] hover:bg-[#2f4ac7] transition-colors cursor-pointer">
            <Plus size={13} /> <span className="max-sm:hidden">Nouveau ticket</span><span className="sm:hidden">Ajouter</span>
          </button>
        </div>
      </div>

      {/* ══════ KPI STRIP ══════ */}
      {stats && (
        <div data-tour="kpis" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2" style={{ animation: "fu .3s ease both", animationDelay: ".03s" }}>
          <KpiCard label="ROI global" value={`${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%`}
            color={stats.roi_pct >= 0 ? C.green : C.red} sub="30 derniers jours" />
          {(() => {
            const cb = bets.filter((b) => b.campaign_id && (b.result === "won" || b.result === "lost"));
            const stk = cb.reduce((s, b) => s + b.stake, 0);
            const pnl = cb.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
            const roiCamp = stk > 0 ? (pnl / stk * 100) : 0;
            return (
              <KpiCard label="ROI campagnes"
                value={`${roiCamp >= 0 ? "+" : ""}${roiCamp.toFixed(1)}%`}
                color={roiCamp >= 0 ? C.green : C.red} sub="algo + manuel" />
            );
          })()}
          <KpiCard label="ROI hors camp."
            value={(() => {
              const hc = bets.filter((b) => !b.campaign_id && (b.result === "won" || b.result === "lost"));
              const stk = hc.reduce((s, b) => s + b.stake, 0);
              const pnl = hc.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
              const roi = stk > 0 ? (pnl / stk * 100) : 0;
              return `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
            })()}
            color={C.amber} sub="Scanner" />
          {(() => {
            const withClv = bets.filter((b) => b.clv != null);
            const clvMoyen = withClv.length > 0
              ? withClv.reduce((s, b) => s + (b.clv ?? 0), 0) / withClv.length
              : null;
            return (
              <KpiCard label="CLV moyen"
                value={clvMoyen !== null ? `${clvMoyen >= 0 ? "+" : ""}${(clvMoyen * 100).toFixed(1)}%` : "—"}
                color={clvMoyen !== null ? (clvMoyen >= 0 ? C.green : C.red) : undefined} sub="qualite modele" />
            );
          })()}
          <KpiCard label="En cours" value={`${stats.pending_bets}`}
            sub={`${bets.filter((b) => b.result === "pending").reduce((s, b) => s + b.stake, 0).toFixed(0)}${currencySymbol} en jeu`} />
          <KpiCard label="Proposés" value={`${campRecos.length}`}
            color={campRecos.length > 0 ? C.amber : undefined} sub="à traiter" />
          <KpiCard label="BK globale"
            value={`${stats.total_staked > 0 ? (stats.total_staked + stats.total_pnl).toFixed(0) : "—"}${currencySymbol}`}
            sub="hors campagnes" />
          <KpiCard label="Taux réussite"
            value={stats.won + stats.lost > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : "—"}
            sub={`30j · ${stats.total_bets} paris`} />
        </div>
      )}

      {/* ══════ VIEW TABS + FILTERS ══════ */}
      <div className="flex flex-col gap-2" style={{ animation: "fu .3s ease both", animationDelay: ".06s" }}>
        <div className="flex items-center justify-between gap-2 flex-wrap overflow-x-hidden">
          {/* Tabs */}
          <div data-tour="view-toggle" className="flex gap-0 border rounded-[10px] p-1 w-fit overflow-x-auto max-w-full" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)" }}>
            {([
              { id: "kanban" as const, label: "Kanban", shortLabel: "Kanban", icon: <Columns3Icon /> },
              { id: "list" as const, label: "Liste / Historique", shortLabel: "Liste", icon: <ListIcon /> },
              { id: "camp" as const, label: "Par campagne", shortLabel: "Campagne", icon: <FlagIcon /> },
            ] as const).map((tab) => (
              <button key={tab.id} onClick={() => { setViewMode(tab.id); setPage(1); }}
                className={`flex items-center gap-1 px-2.5 md:px-4 py-1.5 rounded-[7px] text-[12px] md:text-[13px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                  viewMode === tab.id
                    ? "bg-[#3b5bdb] text-white font-semibold shadow-[0_1px_4px_rgba(59,91,219,.25)]"
                    : "hover:text-[#3c4149]"
                }`}
                style={viewMode !== tab.id ? { color: "var(--text-muted)" } : {}}>
                {tab.icon} <span className="md:hidden">{tab.shortLabel}</span><span className="max-md:hidden">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Collapse toggle for filters on mobile */}
          <button onClick={() => setFiltersCollapsed(!filtersCollapsed)}
            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium cursor-pointer" style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
            <SlidersHorizontal size={13} /> Filtres
            {filtersCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>

        {/* Filters — collapsible on mobile */}
        <div className={`flex items-center gap-2 flex-wrap overflow-x-hidden ${filtersCollapsed ? "max-md:hidden" : ""}`}>
          <div data-tour="search-bar" className="relative min-w-[140px] md:min-w-[190px] flex-1 md:flex-none">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#b0b7c3] pointer-events-none" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Match, equipe..."
              className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-[12.5px] outline-none focus:border-[#3b5bdb] focus:shadow-[0_0_0_3px_rgba(59,91,219,.07)] transition-all placeholder:text-[#b0b7c3]"
              style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }} />
          </div>
          <select value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}
            className="px-2.5 py-1.5 border rounded-lg text-[12px] md:text-[12.5px] outline-none cursor-pointer"
            style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}>
            <option value="all">Tous sports</option>
            <option value="football">Football</option>
            <option value="tennis">Tennis</option>
          </select>
          <select value={bankrollFilter} onChange={(e) => setBankrollFilter(e.target.value)}
            className="px-2.5 py-1.5 border rounded-lg text-[12px] md:text-[12.5px] outline-none cursor-pointer max-sm:hidden"
            style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}>
            <option value="all">Toutes bankrolls</option>
            <option value="campaign">Campagnes</option>
            <option value="global">Bankroll globale</option>
          </select>
          <div className="flex gap-0.5 border rounded-lg p-0.5 overflow-x-auto max-w-full" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)" }}>
            {([
              { id: "all" as const, label: "Tous" },
              { id: "en_cours" as const, label: "En cours" },
              { id: "proposes" as const, label: "Proposés" },
              { id: "resolus" as const, label: "Résolus" },
            ] as const).map((pill) => (
              <button key={pill.id} onClick={() => setStatusFilter(pill.id)}
                className={`px-2 md:px-2.5 py-1 rounded-md text-[11px] md:text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === pill.id
                    ? "font-semibold shadow-sm"
                    : "hover:text-[#3c4149]"
                }`}
                style={statusFilter === pill.id
                  ? { backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }
                  : { color: "var(--text-muted)" }}>
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════ KANBAN VIEW ══════ */}
      {viewMode === "kanban" && (
        <TicketsKanban
          bets={filteredBets}
          campRecos={campRecos}
          statusFilter={statusFilter}
          acceptingReco={acceptingReco}
          onAcceptReco={handleAcceptReco}
          onIgnoreReco={(campId, reco) => {
            setCampRecos((prev) => prev.filter((cr) => !(cr.campId === campId && cr.reco === reco)));
          }}
          onUpdateResult={handleUpdateResult}
          onDeleteBet={handleDeleteBet}
          onAddManual={() => setShowAddModal(true)}
          getCampaignName={getCampaignName}
          getCampaignColor={getCampaignColor}
          onOpenDetail={openDrawer}
          currencySymbol={currencySymbol}
        />
      )}

      {/* ══════ LIST VIEW ══════ */}
      {viewMode === "list" && (
        <div className="flex flex-col gap-3 flex-1" style={{ animation: "fu .3s ease both" }}>
          {/* List KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <LKpi label="ROI période" value={`${listKpis.roi >= 0 ? "+" : ""}${listKpis.roi.toFixed(1)}%`} color={listKpis.roi >= 0 ? C.green : C.red} />
            <LKpi label="CLV moyen" value={listKpis.clv !== 0 ? `${listKpis.clv >= 0 ? "+" : ""}${(listKpis.clv * 100).toFixed(1)}%` : "—"} color={listKpis.clv >= 0 ? C.green : C.red} />
            <LKpi label="Taux réussite" value={`${listKpis.winRate.toFixed(1)}%`} />
            <LKpi label="Mise totale" value={`${listKpis.staked.toFixed(0)}${currencySymbol}`} />
            <LKpi label="Gain net" value={`${listKpis.pnl >= 0 ? "+" : ""}${listKpis.pnl.toFixed(0)}${currencySymbol}`} color={listKpis.pnl >= 0 ? C.green : C.red} />
            <LKpi label="Tickets" value={`${listKpis.count}`} />
          </div>

          {/* Period + extra filters */}
          <div className="flex gap-2 items-center flex-wrap overflow-x-hidden">
            <div data-tour="period-filters" className="flex gap-0.5 border rounded-lg p-0.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)" }}>
              {(["7d", "30d", "90d", "custom"] as PeriodFilter[]).map((p) => (
                <button key={p} onClick={() => { setPeriodFilter(p); setPage(1); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                    periodFilter === p ? "font-semibold shadow-sm" : "hover:text-[#3c4149]"
                  }`}
                  style={periodFilter === p
                    ? { backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }
                    : { color: "var(--text-muted)" }}>
                  {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : p === "90d" ? "90 jours" : "Custom"}
                </button>
              ))}
            </div>
            <select data-tour="result-filters" value={resultFilter} onChange={(e) => { setResultFilter(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 border rounded-lg text-[12.5px] outline-none cursor-pointer"
              style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}>
              <option value="all">Tous résultats</option>
              <option value="won">Gagné</option>
              <option value="lost">Perdu</option>
              <option value="pending">En cours</option>
              <option value="void">Annulé</option>
              <option value="ignored">Ignoré</option>
              <option value="expired">Expiré</option>
            </select>
            <select data-tour="tag-filters" value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 border rounded-lg text-[12.5px] outline-none cursor-pointer"
              style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}>
              <option value="all">Tous tags</option>
              <option value="ALGO">ALGO</option>
              <option value="MANUEL">MANUEL</option>
              <option value="SCANNER">SCANNER</option>
              <option value="COMBI">COMBI</option>
            </select>
            <select value={clvFilter} onChange={(e) => { setClvFilter(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 border rounded-lg text-[12.5px] outline-none cursor-pointer"
              style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}>
              <option value="all">CLV : tous</option>
              <option value="positive">CLV positif</option>
              <option value="negative">CLV négatif</option>
            </select>
            <select value={bookmakerFilter} onChange={(e) => { setBookmakerFilter(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 border rounded-lg text-[12.5px] outline-none cursor-pointer"
              style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}>
              <option value="all">Tous bookmakers</option>
              {[...new Set(bets.map((b) => b.bookmaker).filter(Boolean))].map((bk) => (
                <option key={bk} value={bk!}>{bk}</option>
              ))}
            </select>
            <span className="text-[11.5px] font-[var(--font-mono)] ml-auto" style={{ color: "var(--text-muted)" }}>{sortedBets.length} tickets</span>
            <button onClick={() => exportCsv(sortedBets, "tickets-export.csv")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:border-[rgba(18,183,106,.2)] hover:text-[#12b76a] transition-colors cursor-pointer"
              style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
              <Download size={12} /> Export CSV
            </button>
          </div>

          {/* Table */}
          <div data-tour="bets-table" className="border-[1.5px] rounded-xl overflow-hidden flex flex-col flex-1" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", boxShadow: SH_SM }}>
            <div className="overflow-x-auto flex-1 overflow-y-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead className="border-b-[1.5px]" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)" }}>
                  <tr>
                    <SortTh col="match_date" label="Date" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Match</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Sport</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Issue</th>
                    <SortTh col="odds_at_bet" label="Cote" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh col="stake" label="Mise" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Résultat</th>
                    <SortTh col="profit_loss" label="Gain/Perte" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh col="edge_at_bet" label="Edge" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh col="clv" label="CLV" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} dataTour="clv-column" />
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Bookmaker</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Campagne</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>BK</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Tag</th>
                    <th className="px-3 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBets.map((b) => (
                    <tr key={b.id} onClick={() => openDrawer(b)} className="border-b last:border-b-0 transition-colors cursor-pointer hover:bg-[var(--bg-surface)]" style={{ borderColor: "var(--border-color)" }}>
                      <td className="px-3 py-2.5 font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-muted)" }}>{b.match_date.split("T")[0].slice(5).replace("-", "/")}</td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: "var(--text-primary)" }}>{b.home_team} vs {b.away_team}</td>
                      <td className="px-3 py-2.5 text-[11px]">{b.sport === "tennis" ? "🎾" : "⚽"}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>{outcomeLabel(b.outcome_bet)}</td>
                      <td className="px-3 py-2.5 font-[var(--font-mono)] font-semibold">{b.odds_at_bet.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-[var(--font-mono)] font-semibold">{b.stake.toFixed(0)}{currencySymbol}</td>
                      <td className="px-3 py-2.5"><StatusBadge result={b.result} /></td>
                      <td className={`px-3 py-2.5 font-[var(--font-mono)] font-bold ${
                        b.profit_loss == null ? "text-[#8a919e]" : b.profit_loss >= 0 ? "text-[#12b76a]" : "text-[#f04438]"
                      }`}>
                        {b.profit_loss != null ? `${b.profit_loss >= 0 ? "+" : ""}${b.profit_loss.toFixed(2)}${currencySymbol}` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {b.edge_at_bet != null ? (
                          <span className={`text-[10.5px] font-[var(--font-mono)] font-semibold ${b.edge_at_bet >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                            {b.edge_at_bet >= 0 ? "+" : ""}{(b.edge_at_bet * 100).toFixed(1)}%
                          </span>
                        ) : <span className="text-[#b0b7c3] font-[var(--font-mono)] text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><ClvBadge clv={b.clv} /></td>
                      <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>{b.bookmaker || "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: getCampaignColor(b.campaign_id) }} />
                          <span className="truncate max-w-[100px]">{b.campaign_id ? getCampaignName(b.campaign_id) : "Hors camp."}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-[var(--font-mono)] text-[10.5px]" style={{ color: "var(--text-muted)" }}>{b.campaign_id ? "Camp." : "Globale"}</td>
                      <td className="px-3 py-2.5"><TagBadge tag={getTag(b)} /></td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button onClick={() => openDrawer(b)}
                            className="px-2 py-0.5 rounded-[5px] border border-[#e3e6eb] text-[11px] text-[#8a919e] hover:border-[rgba(59,91,219,.18)] hover:text-[#3b5bdb] hover:bg-[rgba(59,91,219,.07)] transition-colors cursor-pointer">
                            Détail
                          </button>
                          {b.result === "pending" && <>
                            <button onClick={() => handleUpdateResult(b.id, "won")}
                              className="px-1.5 py-0.5 rounded text-[10px] border border-[#e3e6eb] text-[#8a919e] hover:border-[rgba(18,183,106,.2)] hover:text-[#12b76a] hover:bg-[rgba(18,183,106,.05)] transition-colors cursor-pointer">W</button>
                            <button onClick={() => handleUpdateResult(b.id, "lost")}
                              className="px-1.5 py-0.5 rounded text-[10px] border border-[#e3e6eb] text-[#8a919e] hover:border-[rgba(240,68,56,.2)] hover:text-[#f04438] hover:bg-[rgba(240,68,56,.05)] transition-colors cursor-pointer">L</button>
                          </>}
                          <button onClick={() => handleDeleteBet(b.id)}
                            className="px-1.5 py-0.5 rounded text-[10px] border border-[#e3e6eb] text-[#8a919e] hover:border-[rgba(240,68,56,.2)] hover:text-[#f04438] hover:bg-[rgba(240,68,56,.05)] transition-colors cursor-pointer">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pagedBets.length === 0 && (
                    <tr><td colSpan={15} className="px-3 py-12 text-center text-sm text-[#8a919e]">Aucun ticket trouvé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t text-[12.5px]" style={{ borderColor: "var(--border-color)", color: "var(--text-muted)" }}>
              <span>{sortedBets.length} tickets · page {page} / {totalPages}</span>
              <div className="flex gap-1">
                <PBtn onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>‹</PBtn>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                  <PBtn key={p} active={page === p} onClick={() => setPage(p)}>{p}</PBtn>
                ))}
                {totalPages > 5 && <span className="px-1" style={{ color: "var(--text-muted2)" }}>…</span>}
                {totalPages > 5 && <PBtn onClick={() => setPage(totalPages)}>{totalPages}</PBtn>}
                <PBtn onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>›</PBtn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ PAR CAMPAGNE VIEW ══════ */}
      {viewMode === "camp" && (
        <div className="flex flex-col md:grid gap-3" style={{ gridTemplateColumns: "260px 1fr", animation: "fu .3s ease both" }}>
          {/* Campaign sidebar */}
          <div className="border-[1.5px] rounded-xl overflow-hidden h-fit max-md:max-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", boxShadow: SH_SM }}>
            <div className="px-4 py-3 border-b text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: "var(--border-color)", color: "var(--text-muted2)" }}>
              Campagnes
            </div>
            {campaigns.map((c) => {
              const cBets = bets.filter((b) => b.campaign_id === c.id && (b.result === "won" || b.result === "lost"));
              const stk = cBets.reduce((s, b) => s + b.stake, 0);
              const pnl = cBets.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
              const roi = stk > 0 ? (pnl / stk * 100) : 0;
              const count = bets.filter((b) => b.campaign_id === c.id).length;
              return (
                <div key={c.id} onClick={() => setSelectedCampId(c.id)}
                  className={`px-3.5 py-3 border-b cursor-pointer transition-colors flex flex-col gap-1 ${
                    selectedCampId === c.id
                      ? "border-r-2 border-r-[#3b5bdb]"
                      : ""
                  } ${c.status === "archived" ? "opacity-50" : ""}`}
                  style={{
                    borderColor: "var(--border-color)",
                    backgroundColor: selectedCampId === c.id ? "var(--accent-bg)" : undefined,
                  }}
                  onMouseEnter={(e) => { if (selectedCampId !== c.id) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-surface)"; }}
                  onMouseLeave={(e) => { if (selectedCampId !== c.id) (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}>
                  <div className="text-[13px] font-semibold flex items-center gap-1.5">
                    <span>⚽</span> {c.name}
                  </div>
                  <div className="flex gap-2.5 text-[11px] font-[var(--font-mono)]">
                    <span className={`font-bold ${roi >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                      {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                    </span>
                    <span className="text-[#8a919e]">{count} tickets</span>
                    <span className={`text-[10px] ${
                      c.status === "active" ? "text-[#12b76a]" : c.status === "paused" ? "text-[#f79009]" : "text-[#8a919e]"
                    }`}>
                      {c.status === "active" ? "Active" : c.status === "paused" ? "En pause" : "Archivée"}
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Hors campagne */}
            <div onClick={() => setSelectedCampId(0)}
              className="px-3.5 py-3 border-t cursor-pointer transition-colors"
              style={{ borderColor: "var(--border-color)", backgroundColor: selectedCampId === 0 ? "var(--accent-bg)" : undefined }}
              onMouseEnter={(e) => { if (selectedCampId !== 0) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-surface)"; }}
              onMouseLeave={(e) => { if (selectedCampId !== 0) (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}>
              <div className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted2)" }}>
                <AlertCircle size={12} /> Hors campagne
              </div>
              <div className="flex gap-2.5 text-[11px] font-[var(--font-mono)] mt-1">
                {(() => {
                  const hc = bets.filter((b) => !b.campaign_id && (b.result === "won" || b.result === "lost"));
                  const stk = hc.reduce((s, b) => s + b.stake, 0);
                  const pnl = hc.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
                  const roi = stk > 0 ? (pnl / stk * 100) : 0;
                  return <>
                    <span className={`font-bold ${roi >= 0 ? "text-[#12b76a]" : "text-[#f04438]"}`}>{roi >= 0 ? "+" : ""}{roi.toFixed(1)}%</span>
                    <span className="text-[#8a919e]">{bets.filter((b) => !b.campaign_id).length} tickets</span>
                    <span className="text-[10px] text-[#f79009]">Scanner</span>
                  </>;
                })()}
              </div>
            </div>
          </div>

          {/* Campaign detail */}
          <div className="flex flex-col gap-3 min-w-0">
            {selectedCampId != null && selectedCampId > 0 && campDetail && (
              <CampMiniDash detail={campDetail} history={campHistory} campBets={campBets} currencySymbol={currencySymbol} />
            )}
            {selectedCampId === 0 && (
              <div className="border-[1.5px] rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", boxShadow: SH_SM }}>
                <div className="text-[13px] font-bold mb-3 flex items-center gap-2">
                  <AlertCircle size={14} style={{ color: "var(--text-muted)" }} /> Tickets hors campagne
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(() => {
                    const hc = bets.filter((b) => !b.campaign_id);
                    const settled = hc.filter((b) => b.result === "won" || b.result === "lost");
                    const won = settled.filter((b) => b.result === "won").length;
                    const stk = settled.reduce((s, b) => s + b.stake, 0);
                    const pnl = settled.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
                    const roi = stk > 0 ? (pnl / stk * 100) : 0;
                    const wr = settled.length > 0 ? (won / settled.length * 100) : 0;
                    return <>
                      <CmdStat label="ROI" value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`} color={roi >= 0 ? C.green : C.red} />
                      <CmdStat label="Taux réussite" value={`${wr.toFixed(1)}%`} />
                      <CmdStat label="Mise totale" value={`${stk.toFixed(0)}${currencySymbol}`} />
                      <CmdStat label="Gain net" value={`${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}${currencySymbol}`} color={pnl >= 0 ? C.green : C.red} />
                      <CmdStat label="Tickets" value={`${hc.length}`} />
                      <CmdStat label="En cours" value={`${hc.filter((b) => b.result === "pending").length}`} />
                    </>;
                  })()}
                </div>
              </div>
            )}

            {/* Campaign bets table */}
            {selectedCampId != null && (
              <CampBetsTable
                bets={selectedCampId === 0
                  ? bets.filter((b) => !b.campaign_id)
                  : bets.filter((b) => b.campaign_id === selectedCampId)
                }
                campaigns={campaigns}
                onUpdateResult={handleUpdateResult}
                onDeleteBet={handleDeleteBet}
                onExport={(data) => exportCsv(data, `tickets-camp-${selectedCampId}.csv`)}
                onOpenDetail={openDrawer}
                currencySymbol={currencySymbol}
              />
            )}
            {selectedCampId == null && (
              <div className="flex items-center justify-center h-48 text-sm" style={{ color: "var(--text-muted)" }}>
                Sélectionnez une campagne pour voir ses tickets
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ ADD TICKET MODAL ══════ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "var(--overlay)" }} onClick={() => setShowAddModal(false)}>
          <div className="rounded-xl p-4 md:p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-3 md:mx-0 shadow-[0_12px_40px_rgba(16,24,40,.14)] space-y-4" style={{ backgroundColor: "var(--bg-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Nouveau ticket</h2>
              <button onClick={() => setShowAddModal(false)} className="hover:text-[#111318] cursor-pointer" style={{ color: "var(--text-muted)" }}><X size={18} /></button>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <button onClick={() => setFormMode("manual")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  formMode === "manual" ? "bg-[#3b5bdb] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}>
                <Plus size={12} /> Manuel
              </button>
              <button onClick={() => { setFormMode("search"); if (!scanLoaded) handleScan(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  formMode === "search" ? "bg-[#3b5bdb] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}>
                <Search size={12} /> Recherche
              </button>
              <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={isCombo}
                  onChange={(e) => { setIsCombo(e.target.checked); if (!e.target.checked) setComboLegs([]); }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <Layers size={12} className="text-slate-500" />
                <span className="text-xs text-slate-600">Combi</span>
              </label>
            </div>

            {/* Search mode */}
            {formMode === "search" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="text" value={scanQuery} onChange={(e) => setScanQuery(e.target.value)}
                    placeholder="Filtrer par équipe…" className={`flex-1 ${inputCls}`} />
                  <button onClick={handleScan} disabled={scanLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3b5bdb] text-white text-xs font-medium cursor-pointer disabled:opacity-50">
                    {scanLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Scanner
                  </button>
                </div>
                {scanLoaded && (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 scanner-scroll">
                    {filteredScanResults().length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Aucun match trouvé</p>
                    ) : (
                      filteredScanResults().map((m, idx) => (
                        <div key={idx} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-slate-900">{m.home_team} vs {m.away_team}</span>
                            <span className="text-[10px] text-slate-400">
                              {LEAGUE_INFO[m.league]?.flag} {LEAGUE_INFO[m.league]?.name || m.league}
                            </span>
                          </div>
                          <div className="flex gap-1.5">
                            {(["H", "D", "A"] as const).map((o) => {
                              const odds1x2 = (m.odds as Record<string, Record<string, Record<string, number>>>)?.["1x2"] ?? {};
                              const outcomeOdds = odds1x2[o] ?? {};
                              const bestOdds = Math.max(...Object.values(outcomeOdds).map(Number).filter(Boolean), 0);
                              if (!bestOdds) return null;
                              const edge = (m.edges ?? {})[o] ?? 0;
                              const isValue = edge > 0;
                              return (
                                <button key={o} onClick={() => selectScanMatch(m, o)}
                                  className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                                    isValue ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                  }`}>
                                  <div className="font-bold">{outcomeLabel(o)}</div>
                                  <div className="text-amber-600">{bestOdds.toFixed(2)}</div>
                                  {isValue && <div className="text-[9px] text-emerald-600">+{(edge * 100).toFixed(1)}%</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Combo legs */}
            {isCombo && comboLegs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">
                  Legs ({comboLegs.length}), cote combinée : <span className="text-amber-600 font-bold">{combinedOdds.toFixed(2)}</span>
                </p>
                {comboLegs.map((leg, i) => (
                  <div key={i} className="flex items-center gap-2 bg-blue-50 rounded px-2.5 py-1.5 text-xs">
                    <span className="text-slate-700 flex-1">
                      {leg.home_team} vs {leg.away_team} :
                      <Badge variant={leg.outcome_bet === "H" ? "blue" : leg.outcome_bet === "D" ? "amber" : "red"} size="xs" className="ml-1">
                        {leg.outcome_bet}
                      </Badge>
                      <span className="ml-1 text-amber-600">@{leg.odds.toFixed(2)}</span>
                    </span>
                    <button onClick={() => setComboLegs((prev) => prev.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-red-500 cursor-pointer"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Manual fields */}
            {(formMode === "manual" || isCombo) && (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <TeamAutocomplete label="Équipe dom." value={addForm.home_team}
                    onChange={(v) => setAddForm({ ...addForm, home_team: v })} placeholder="ex: Arsenal" />
                  <TeamAutocomplete label="Équipe ext." value={addForm.away_team}
                    onChange={(v) => setAddForm({ ...addForm, away_team: v })} placeholder="ex: Chelsea" />
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Ligue</label>
                    <select value={addForm.league} onChange={(e) => setAddForm({ ...addForm, league: e.target.value })} className={inputCls}>
                      {leagueOptions.map(([code, info]) => (
                        <option key={code} value={code}>{info.flag} {info.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Date</label>
                    <input type="date" value={addForm.match_date} onChange={(e) => setAddForm({ ...addForm, match_date: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Pari</label>
                    <select value={addForm.outcome_bet} onChange={(e) => setAddForm({ ...addForm, outcome_bet: e.target.value })} className={inputCls}>
                      <option value="H">Dom (H)</option>
                      <option value="D">Nul (D)</option>
                      <option value="A">Ext (A)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Cote</label>
                    <input type="number" step="0.01" placeholder="1.85" value={addForm.odds_at_bet}
                      onChange={(e) => setAddForm({ ...addForm, odds_at_bet: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Mise ({currencySymbol})</label>
                    <input type="number" step="0.01" placeholder="10" value={addForm.stake}
                      onChange={(e) => setAddForm({ ...addForm, stake: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Bookmaker</label>
                    <select value={addForm.bookmaker} onChange={(e) => setAddForm({ ...addForm, bookmaker: e.target.value })} className={inputCls}>
                      <option value="">— Choisir —</option>
                      <option value="Unibet">Unibet</option>
                      <option value="Pinnacle">Pinnacle</option>
                      <option value="Betclic">Betclic</option>
                      <option value="Winamax">Winamax</option>
                      <option value="Bet365">Bet365</option>
                      <option value="Bwin">Bwin</option>
                      <option value="PMU">PMU</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Note (optionnel)</label>
                    <input type="text" placeholder="Motif, conviction…" value={addForm.note}
                      onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-400">Campagne :</label>
                    <select value={selectedCampaignId ?? ""}
                      onChange={(e) => setSelectedCampaignId(e.target.value ? Number(e.target.value) : null)}
                      className={inputCls} style={{ width: "auto" }}>
                      <option value="">Sans campagne</option>
                      {campaigns.filter((c) => c.status === "active").map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {isCombo && (
                    <button onClick={addComboLeg}
                      disabled={!addForm.home_team || !addForm.away_team || !addForm.odds_at_bet}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">
                      <Plus size={12} /> Ajouter leg
                    </button>
                  )}
                  <button onClick={handleAddBet} disabled={!canSubmit || adding}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3b5bdb] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">
                    {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {adding ? "Envoi…" : "Enregistrer"}
                  </button>
                </div>
              </div>
            )}
            {addError && <div className="text-xs text-red-600">{addError}</div>}
          </div>
        </div>
      )}

      {/* ══════ TICKET DETAIL DRAWER ══════ */}
      <TicketDetailDrawer
        bet={drawerBet}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        allBets={drawerBets}
        currentIndex={drawerIndex}
        onNavigate={navigateDrawer}
        onUpdateResult={(id, result) => { handleUpdateResult(id, result); setDrawerOpen(false); }}
        getCampaignName={getCampaignName}
        onBetUpdated={(updated) => {
          setBets((prev) => prev.map((b) => b.id === updated.id ? updated : b));
        }}
      />

      {showTour && <SpotlightTour steps={portfolioTour} onComplete={completeTour} />}
    </div>
  );
}


// ══════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════

function KpiCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="border-[1.5px] rounded-[10px] px-2.5 md:px-3.5 py-2 md:py-2.5 text-center min-w-0" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", boxShadow: SH_SM }}>
      <div className="text-[10px] md:text-[10.5px] leading-tight" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[15px] md:text-[17px] font-extrabold tracking-tight font-[var(--font-mono)]" style={{ color: color || "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-[9px] md:text-[10px] mt-0.5 truncate" style={{ color: "var(--text-muted2)" }}>{sub}</div>}
    </div>
  );
}

function LKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border-[1.5px] rounded-[10px] px-2.5 md:px-3.5 py-2 md:py-2.5 text-center min-w-0" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", boxShadow: SH_SM }}>
      <div className="text-[10px] md:text-[10.5px] mb-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[14px] md:text-[16px] font-extrabold font-[var(--font-mono)] tracking-tight" style={{ color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function CmdStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center p-2 rounded-lg min-w-0" style={{ backgroundColor: "var(--bg-surface)" }}>
      <div className="text-[13px] md:text-[15px] font-extrabold font-[var(--font-mono)] tracking-tight" style={{ color: color || "var(--text-primary)" }}>{value}</div>
      <div className="text-[9px] md:text-[10px] mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function SortTh({ col, label, sortCol, sortDir, onSort, dataTour }: {
  col: string; label: string; sortCol: string; sortDir: SortDir; onSort: (col: string) => void; dataTour?: string;
}) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)} data-tour={dataTour}
      className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:text-[#3c4149] select-none whitespace-nowrap transition-colors" style={{ color: "var(--text-muted2)" }}>
      {label}
      {active && <span className="text-[#3b5bdb] ml-0.5">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
    </th>
  );
}

function PBtn({ children, onClick, active, disabled }: {
  children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-7 h-7 rounded-md border text-xs flex items-center justify-center transition-all cursor-pointer ${
        active ? "bg-[#3b5bdb] text-white border-[#3b5bdb]"
          : "hover:bg-[#3b5bdb] hover:text-white hover:border-[#3b5bdb]"
      } ${disabled ? "opacity-30 pointer-events-none" : ""}`}
      style={!active ? { borderColor: "var(--border-color)", color: "var(--text-secondary)" } : {}}>
      {children}
    </button>
  );
}

// ── Tiny SVG icons for view tabs ──
function Columns3Icon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="14" rx="1" /><rect x="17" y="3" width="5" height="10" rx="1" /></svg>;
}
function ListIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
}
function FlagIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>;
}


// ══════════════════════════════════════════════
// KANBAN VIEW
// ══════════════════════════════════════════════

interface TicketKanbanCard extends KanbanCardData {
  type: "bet" | "reco";
  bet?: Bet;
  reco?: CampaignRecommendation;
  campId?: number;
}

const TICKET_KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "proposed", title: "Proposés",
    icon: <AlertCircle size={11} />, color: "#f79009",
    emptyText: "Aucune proposition en attente",
  },
  {
    id: "en_cours", title: "En cours",
    icon: <Clock size={11} />, color: "#3b5bdb",
    emptyText: "Aucun ticket en cours",
  },
  {
    id: "resolved", title: "Terminés",
    icon: <CheckCircle2 size={11} />, color: "#12b76a",
    emptyText: "Aucun résultat aujourd'hui",
  },
];

function TicketsKanban({
  bets, campRecos, statusFilter, acceptingReco,
  onAcceptReco, onIgnoreReco, onUpdateResult, onDeleteBet, onAddManual,
  getCampaignName, getCampaignColor, onOpenDetail, currencySymbol,
}: {
  bets: Bet[];
  campRecos: { campId: number; reco: CampaignRecommendation }[];
  statusFilter: StatusFilter;
  acceptingReco: string | null;
  onAcceptReco: (campId: number, reco: CampaignRecommendation) => void;
  onIgnoreReco: (campId: number, reco: CampaignRecommendation) => void;
  onUpdateResult: (betId: number, result: string) => void;
  onDeleteBet: (betId: number) => void;
  onAddManual: () => void;
  getCampaignName: (id: number | null) => string;
  getCampaignColor: (id: number | null) => string;
  onOpenDetail: (bet: Bet) => void;
  currencySymbol: string;
}) {
  const today = new Date().toISOString().split("T")[0];

  const cards: TicketKanbanCard[] = useMemo(() => {
    const result: TicketKanbanCard[] = [];

    // Recos → Proposed column
    if (statusFilter === "all" || statusFilter === "proposes") {
      campRecos.forEach((cr, i) => {
        result.push({
          id: `reco-${cr.campId}-${i}`,
          columnId: "proposed",
          type: "reco",
          reco: cr.reco,
          campId: cr.campId,
        });
      });
    }

    // Bets
    bets.forEach((b) => {
      let col = "";
      if (b.result === "pending") col = "en_cours";
      else if (b.result === "won" || b.result === "lost") col = "resolved";
      else return;

      if (statusFilter === "en_cours" && col !== "en_cours") return;
      if (statusFilter === "resolus" && col !== "resolved") return;

      result.push({
        id: `bet-${b.id}`,
        columnId: col,
        type: "bet",
        bet: b,
      });
    });

    return result;
  }, [bets, campRecos, statusFilter, today]);

  // Add manual button as headerSlot on proposed column
  const columnsWithSlots = TICKET_KANBAN_COLUMNS.map((col) => {
    if (col.id === "proposed") {
      return {
        ...col,
        headerSlot: (
          <button onClick={onAddManual}
            className="text-[10px] text-[#8a919e] hover:text-[#3b5bdb] transition-colors cursor-pointer">
            <Plus size={12} />
          </button>
        ),
      };
    }
    return col;
  });

  return (
    <div style={{ animation: "fu .3s ease both", animationDelay: ".1s" }}>
      <KanbanBoard<TicketKanbanCard>
        columns={columnsWithSlots}
        cards={cards}
        renderCard={(card) => {
          if (card.type === "reco" && card.reco) {
            const r = card.reco;
            const key = `${card.campId}-${r.home_team}-${r.outcome}`;
            const isAccepting = acceptingReco === key;
            return (
              <div className="border-[1.5px] border-[rgba(247,144,9,.2)] rounded-[9px] p-3 transition-all hover:shadow-sm hover:-translate-y-px" style={{ backgroundColor: "var(--bg-card)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex gap-1"><TagBadge tag="ALGO" /></div>
                </div>
                <div className="text-[13px] font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>{r.home_team} vs {r.away_team}</div>
                <div className="text-[10.5px] mb-2" style={{ color: "var(--text-muted)" }}>
                  {LEAGUE_INFO[r.league]?.flag} {LEAGUE_INFO[r.league]?.name || r.league} · {r.date.split("T")[0]}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}>{outcomeLabel(r.outcome)}</span>
                  <span className="text-sm font-extrabold font-[var(--font-mono)]" style={{ color: "var(--text-primary)" }}>{r.best_odds.toFixed(2)}</span>
                  <span className="text-[10.5px] font-bold font-[var(--font-mono)]" style={{ color: "var(--green)" }}>+{(r.edge * 100).toFixed(1)}%</span>
                  <span className="text-[10px] font-[var(--font-mono)] ml-auto" style={{ color: "var(--text-muted)" }}>{r.bookmaker}</span>
                </div>
                <div className="flex items-center mt-1">
                  <span className="text-[11px] font-[var(--font-mono)] font-semibold" style={{ color: "var(--text-secondary)" }}>Mise : {r.suggested_stake.toFixed(0)}{currencySymbol}</span>
                </div>
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t" style={{ borderColor: "var(--border-color)" }}>
                  <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted2)" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: getCampaignColor(card.campId ?? null) }} />
                    <span className="truncate max-w-[100px]">{getCampaignName(card.campId ?? null)}</span>
                  </div>
                  <span className="text-[10px] font-[var(--font-mono)]" style={{ color: "var(--text-muted2)" }}>BK Campagne</span>
                </div>
                {/* Actions */}
                <div className="flex gap-1 mt-2">
                  <button onClick={() => onAcceptReco(card.campId!, r)} disabled={isAccepting}
                    className="flex-[2] py-1.5 rounded-md bg-[#12b76a] text-white text-[11.5px] font-semibold cursor-pointer hover:bg-[#0ea05e] disabled:opacity-50 transition-colors">
                    {isAccepting ? "…" : "✓ Valider"}
                  </button>
                  <button className="flex-1 py-1.5 rounded-md border text-[11.5px] cursor-pointer transition-colors" style={{ borderColor: "var(--border-strong)", color: "var(--text-secondary)" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-surface)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}>✏️</button>
                  <button onClick={() => onIgnoreReco(card.campId!, r)}
                    className="flex-1 py-1.5 rounded-md border border-[rgba(240,68,56,.2)] bg-[rgba(240,68,56,.07)] text-[#f04438] text-[11.5px] cursor-pointer hover:bg-[rgba(240,68,56,.12)] transition-colors">✕ Ignorer</button>
                </div>
              </div>
            );
          }

          // Bet card
          const b = card.bet!;
          const isWon = b.result === "won";
          const isLost = b.result === "lost";
          const isPending = b.result === "pending";
          const isIgnored = b.result === "ignored" || b.result === "expired";
          return (
            <div onClick={() => onOpenDetail(b)} className="border-[1.5px] rounded-[9px] p-3 transition-all hover:shadow-sm hover:-translate-y-px cursor-pointer"
              style={{
                backgroundColor: isWon ? "rgba(18,183,106,.015)" : isLost ? "rgba(240,68,56,.015)" : "var(--bg-card)",
                borderColor: isWon ? "rgba(18,183,106,.2)" : isLost ? "rgba(240,68,56,.2)" : "var(--border-color)",
              }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex gap-1"><TagBadge tag={getTag(b)} /></div>
                {isPending && <span className="text-[10px] text-[#12b76a] font-[var(--font-mono)]">Placé ✓</span>}
                {!isPending && <StatusBadge result={b.result} />}
              </div>
              <div className="text-[13px] font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>{b.home_team} vs {b.away_team}</div>
              <div className="text-[10.5px] mb-2" style={{ color: "var(--text-muted)" }}>
                {b.league && LEAGUE_INFO[b.league]?.flag} {b.league && (LEAGUE_INFO[b.league]?.name || b.league)} · {b.match_date.split("T")[0]}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}>{outcomeLabel(b.outcome_bet)}</span>
                <span className="text-sm font-extrabold font-[var(--font-mono)]" style={{ color: "var(--text-primary)" }}>{b.odds_at_bet.toFixed(2)}</span>
                {b.odds_at_close != null && (
                  <span className={`text-[10px] font-[var(--font-mono)] font-semibold ${
                    b.odds_at_close < b.odds_at_bet ? "text-[#12b76a]" : b.odds_at_close > b.odds_at_bet ? "text-[#f04438]" : "text-[#8a919e]"
                  }`}>
                    {b.odds_at_close < b.odds_at_bet ? "▼" : b.odds_at_close > b.odds_at_bet ? "▲" : "→"}
                  </span>
                )}
                {b.edge_at_bet != null && (
                  <span className="text-[10px] font-[var(--font-mono)] font-bold text-[#12b76a]">+{(b.edge_at_bet * 100).toFixed(1)}%</span>
                )}
              </div>
              {b.bookmaker && (
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{b.bookmaker}</div>
              )}
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t" style={{ borderColor: "var(--border-color)" }}>
                {isPending ? (
                  <>
                    <span className="text-[11px] font-[var(--font-mono)] font-semibold" style={{ color: "var(--text-secondary)" }}>Mise : {b.stake.toFixed(0)}{currencySymbol}</span>
                    <span className="text-[11px] font-[var(--font-mono)]" style={{ color: "var(--text-secondary)" }}>
                      +{(b.stake * (b.odds_at_bet - 1)).toFixed(0)}{currencySymbol} potentiel
                    </span>
                  </>
                ) : (
                  <>
                    <span className={`text-[11px] font-[var(--font-mono)] font-bold ${isWon ? "text-[#12b76a]" : "text-[#f04438]"}`}>
                      {b.profit_loss != null ? `${b.profit_loss >= 0 ? "+" : ""}${b.profit_loss.toFixed(2)}${currencySymbol}` : "—"}
                    </span>
                    <ClvBadge clv={b.clv} />
                  </>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted2)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: getCampaignColor(b.campaign_id) }} />
                  <span className="truncate max-w-[100px]">{getCampaignName(b.campaign_id)}</span>
                </div>
                <span className="text-[10px] font-[var(--font-mono)]" style={{ color: "var(--text-muted2)" }}>{b.campaign_id ? "BK Camp." : "BK Globale"}</span>
              </div>
              {/* Hypothetical result for ignored tickets */}
              {isIgnored && b.profit_loss != null && (
                <div className="mt-1.5 px-2 py-1 rounded border border-[rgba(138,145,158,.12)] text-[10.5px] italic" style={{ backgroundColor: "rgba(138,145,158,.06)", color: "var(--text-muted)" }}>
                  Aurait rapporté {b.profit_loss >= 0 ? `+${b.profit_loss.toFixed(2)}${currencySymbol}` : `${b.profit_loss.toFixed(2)}${currencySymbol}`}
                </div>
              )}
              {/* Actions */}
              <div className="flex gap-1 mt-2">
                {isPending && <>
                  <button onClick={() => onUpdateResult(b.id, "won")}
                    className="flex-1 py-1 rounded-md bg-[rgba(18,183,106,.08)] text-[#12b76a] text-[10px] font-semibold cursor-pointer hover:bg-[rgba(18,183,106,.15)] transition-colors">
                    Gagné
                  </button>
                  <button onClick={() => onUpdateResult(b.id, "lost")}
                    className="flex-1 py-1 rounded-md bg-[rgba(240,68,56,.07)] text-[#f04438] text-[10px] font-semibold cursor-pointer hover:bg-[rgba(240,68,56,.12)] transition-colors">
                    Perdu
                  </button>
                </>}
                <button onClick={() => onDeleteBet(b.id)}
                  className="py-1 px-2 rounded-md border border-[#e3e6eb] text-[#b0b7c3] text-[10px] cursor-pointer hover:border-[rgba(240,68,56,.2)] hover:text-[#f04438] hover:bg-[rgba(240,68,56,.05)] transition-colors"
                  title="Supprimer">
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          );
        }}
      />
      {/* Add manual button below kanban */}
      <button onClick={onAddManual}
        className="w-full mt-3 py-2.5 rounded-lg border-[1.5px] border-dashed bg-transparent text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5 hover:border-[#3b5bdb] hover:text-[#3b5bdb] hover:bg-[rgba(59,91,219,.03)] transition-all"
        style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}>
        <Plus size={12} /> Ajouter un ticket manuel
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════
// CAMPAIGN MINI DASHBOARD
// ══════════════════════════════════════════════

function CampMiniDash({ detail, history, campBets, currencySymbol }: {
  detail: CampaignDetail;
  history: BankrollPoint[];
  campBets: Bet[];
  currencySymbol: string;
}) {
  const { campaign, stats } = detail;
  const statusLabel = campaign.status === "active" ? "Active" : campaign.status === "paused" ? "En pause" : "Archivée";
  const statusColor = campaign.status === "active" ? C.green : campaign.status === "paused" ? C.amber : C.muted;

  // ROI algo vs manuel breakdown
  const algoSettled = campBets.filter((b) => b.source === "algo" && (b.result === "won" || b.result === "lost"));
  const algoStk = algoSettled.reduce((s, b) => s + b.stake, 0);
  const algoPnl = algoSettled.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
  const algoRoi = algoStk > 0 ? (algoPnl / algoStk * 100) : 0;

  const manuelSettled = campBets.filter((b) => b.source === "manual" && (b.result === "won" || b.result === "lost"));
  const manuelStk = manuelSettled.reduce((s, b) => s + b.stake, 0);
  const manuelPnl = manuelSettled.reduce((s, b) => s + (b.profit_loss ?? 0), 0);
  const manuelRoi = manuelStk > 0 ? (manuelPnl / manuelStk * 100) : 0;

  // CLV moyen
  const withClv = campBets.filter((b) => b.clv != null);
  const avgClv = withClv.length > 0 ? withClv.reduce((s, b) => s + (b.clv ?? 0), 0) / withClv.length : 0;

  // Max drawdown from history
  let maxDrawdown = 0;
  if (history.length > 0) {
    let peak = history[0].bankroll;
    for (const h of history) {
      if (h.bankroll > peak) peak = h.bankroll;
      const dd = peak > 0 ? ((peak - h.bankroll) / peak * 100) : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }

  return (
    <div className="border-[1.5px] rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", boxShadow: SH_SM }}>
      <div className="text-[13px] font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
        ⚽ {campaign.name}
        <span className="text-[10px] px-2 py-0.5 rounded font-[var(--font-mono)] font-semibold"
          style={{ background: `${statusColor}12`, color: statusColor }}>{statusLabel}</span>
      </div>
      <div className="grid grid-cols-3 lg:grid-cols-9 gap-2 mb-3">
        <CmdStat label="ROI global" value={`${stats.roi_pct >= 0 ? "+" : ""}${stats.roi_pct.toFixed(1)}%`} color={stats.roi_pct >= 0 ? C.green : C.red} />
        <CmdStat label="ROI algo" value={algoStk > 0 ? `${algoRoi >= 0 ? "+" : ""}${algoRoi.toFixed(1)}%` : "—"} color={algoRoi >= 0 ? C.green : C.red} />
        <CmdStat label="ROI manuel" value={manuelStk > 0 ? `${manuelRoi >= 0 ? "+" : ""}${manuelRoi.toFixed(1)}%` : "—"} color={manuelRoi >= 0 ? C.green : C.red} />
        <CmdStat label="CLV moyen" value={withClv.length > 0 ? `${avgClv >= 0 ? "+" : ""}${(avgClv * 100).toFixed(1)}%` : "—"} color={avgClv >= 0 ? C.green : C.red} />
        <CmdStat label="Taux réussite" value={stats.won + stats.lost > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : "—"} />
        <CmdStat label="BK courante" value={`${stats.current_bankroll.toFixed(0)}${currencySymbol}`} />
        <CmdStat label="Drawdown max" value={`${maxDrawdown.toFixed(1)}%`} color={maxDrawdown > 15 ? C.red : maxDrawdown > 5 ? C.amber : C.green} />
        <CmdStat label="P&L" value={`${stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl.toFixed(0)}${currencySymbol}`} color={stats.total_pnl >= 0 ? C.green : C.red} />
        <CmdStat label="Tickets" value={`${stats.total_bets}`} />
      </div>
      {/* Mini bankroll chart */}
      {history.length > 1 && (
        <svg className="w-full h-8" viewBox={`0 0 ${history.length * 10} 32`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="mcg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b5bdb" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#3b5bdb" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const min = Math.min(...history.map((h) => h.bankroll));
            const max = Math.max(...history.map((h) => h.bankroll));
            const range = max - min || 1;
            const points = history.map((h, i) => `${i * 10},${32 - ((h.bankroll - min) / range) * 28}`).join(" ");
            const areaPoints = points + ` ${(history.length - 1) * 10},32 0,32`;
            return <>
              <polygon points={areaPoints} fill="url(#mcg)" />
              <polyline points={points} fill="none" stroke="#3b5bdb" strokeWidth="1.8" strokeLinecap="round" />
            </>;
          })()}
        </svg>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════
// CAMPAIGN BETS TABLE (reused in Par Campagne view)
// ══════════════════════════════════════════════

function CampBetsTable({ bets, campaigns: _campaigns, onUpdateResult, onDeleteBet, onExport, onOpenDetail, currencySymbol }: {
  bets: Bet[];
  campaigns: Campaign[];
  onUpdateResult: (betId: number, result: string) => void;
  onDeleteBet: (betId: number) => void;
  onExport: (data: Bet[]) => void;
  onOpenDetail: (bet: Bet) => void;
  currencySymbol: string;
}) {
  const [filter, setFilter] = useState("all");
  const [tagF, setTagF] = useState("all");
  const [pg, setPg] = useState(1);
  const ps = 10;

  const filtered = useMemo(() => {
    let r = bets;
    if (filter !== "all") r = r.filter((b) => b.result === filter);
    if (tagF !== "all") r = r.filter((b) => getTag(b) === tagF);
    return r.sort((a, b) => b.match_date.localeCompare(a.match_date));
  }, [bets, filter, tagF, _campaigns]);

  const tp = Math.max(1, Math.ceil(filtered.length / ps));
  const paged = filtered.slice((pg - 1) * ps, pg * ps);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex gap-0.5 border rounded-lg p-0.5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)" }}>
          {["all", "pending", "won", "lost"].map((f) => (
            <button key={f} onClick={() => { setFilter(f); setPg(1); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                filter === f ? "font-semibold shadow-sm" : "hover:text-[#3c4149]"
              }`}
              style={filter === f
                ? { backgroundColor: "var(--bg-card)", color: "var(--text-primary)" }
                : { color: "var(--text-muted)" }}>
              {f === "all" ? "Tous" : f === "pending" ? "En cours" : f === "won" ? "Gagné" : "Perdu"}
            </button>
          ))}
        </div>
        <select value={tagF} onChange={(e) => { setTagF(e.target.value); setPg(1); }}
          className="px-2.5 py-1.5 border rounded-lg text-[12.5px] outline-none cursor-pointer"
          style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-secondary)" }}>
          <option value="all">Tous tags</option>
          <option value="ALGO">ALGO</option>
          <option value="MANUEL">MANUEL</option>
          <option value="SCANNER">SCANNER</option>
          <option value="COMBI">COMBI</option>
        </select>
        <button onClick={() => onExport(filtered)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:text-[#12b76a] transition-colors cursor-pointer ml-auto"
          style={{ borderColor: "var(--border-color)", backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
          <Download size={12} /> Export CSV campagne
        </button>
      </div>

      <div className="border-[1.5px] rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", boxShadow: SH_SM }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead className="border-b-[1.5px]" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)" }}>
              <tr>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Date</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Match</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Issue</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Cote</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Mise</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Résultat</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Gain/Perte</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>CLV</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted2)" }}>Tag</th>
                <th className="px-3 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => (
                <tr key={b.id} onClick={() => onOpenDetail(b)} className="border-b last:border-b-0 transition-colors cursor-pointer hover:bg-[var(--bg-surface)]" style={{ borderColor: "var(--border-color)" }}>
                  <td className="px-3 py-2.5 font-[var(--font-mono)] text-[11px]" style={{ color: "var(--text-muted)" }}>{b.match_date.split("T")[0].slice(5).replace("-", "/")}</td>
                  <td className="px-3 py-2.5 font-semibold" style={{ color: "var(--text-primary)" }}>{b.home_team} vs {b.away_team}</td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>{outcomeLabel(b.outcome_bet)}</td>
                  <td className="px-3 py-2.5 font-[var(--font-mono)] font-semibold">{b.odds_at_bet.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-[var(--font-mono)] font-semibold">{b.stake.toFixed(0)}{currencySymbol}</td>
                  <td className="px-3 py-2.5"><StatusBadge result={b.result} /></td>
                  <td className={`px-3 py-2.5 font-[var(--font-mono)] font-bold ${
                    b.profit_loss == null ? "text-[#8a919e]" : b.profit_loss >= 0 ? "text-[#12b76a]" : "text-[#f04438]"
                  }`}>
                    {b.profit_loss != null ? `${b.profit_loss >= 0 ? "+" : ""}${b.profit_loss.toFixed(2)}${currencySymbol}` : "—"}
                  </td>
                  <td className="px-3 py-2.5"><ClvBadge clv={b.clv} /></td>
                  <td className="px-3 py-2.5"><TagBadge tag={getTag(b)} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      {b.result === "pending" && <>
                        <button onClick={() => onUpdateResult(b.id, "won")}
                          className="px-1.5 py-0.5 rounded text-[10px] border border-[#e3e6eb] text-[#8a919e] hover:text-[#12b76a] cursor-pointer">W</button>
                        <button onClick={() => onUpdateResult(b.id, "lost")}
                          className="px-1.5 py-0.5 rounded text-[10px] border border-[#e3e6eb] text-[#8a919e] hover:text-[#f04438] cursor-pointer">L</button>
                      </>}
                      <button onClick={() => onDeleteBet(b.id)}
                        className="px-1.5 py-0.5 rounded text-[10px] border hover:border-[rgba(240,68,56,.2)] hover:text-[#f04438] cursor-pointer"
                        style={{ borderColor: "var(--border-color)", color: "var(--text-muted2)" }}
                        title="Supprimer"><Trash2 size={10} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>Aucun ticket</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t text-[12.5px]" style={{ borderColor: "var(--border-color)", color: "var(--text-muted)" }}>
          <span>{filtered.length} tickets · page {pg} / {tp}</span>
          <div className="flex gap-1">
            <PBtn onClick={() => setPg(Math.max(1, pg - 1))} disabled={pg <= 1}>‹</PBtn>
            {Array.from({ length: Math.min(5, tp) }, (_, i) => i + 1).map((p) => (
              <PBtn key={p} active={pg === p} onClick={() => setPg(p)}>{p}</PBtn>
            ))}
            {tp > 5 && <span className="px-1" style={{ color: "var(--text-muted2)" }}>…</span>}
            {tp > 5 && <PBtn onClick={() => setPg(tp)}>{tp}</PBtn>}
            <PBtn onClick={() => setPg(Math.min(tp, pg + 1))} disabled={pg >= tp}>›</PBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
